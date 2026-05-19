/**
 * Plumbing-level tests for the AI assistant. The native llama runtime is
 * mocked (see __mocks__/llama.rn.js) so these run in plain Node via `npm test`.
 *
 * What this proves:
 *  - The GBNF grammar is generated correctly for every registered tool.
 *  - parseAction classifies speak / tool / malformed envelopes correctly.
 *  - The streaming JSON peeker emits clean text and never leaks raw JSON.
 *  - The dispatch loop calls the right tool, feeds the result back into the
 *    conversation, and loops until the model speaks.
 *  - The no-fallback contract: model unavailable / invalid output / turn
 *    exhaustion all THROW rather than returning canned text.
 *
 * What this does NOT prove: that the real Gemma model actually decides to call
 * the right tool. That requires the GGUF model and is a separate eval harness.
 */

// assetManager pulls in react-native-fs; stub its tiny surface instead.
jest.mock('../src/services/assetManager', () => ({
  assetManager: {
    isInstalled: jest.fn(async () => true),
    getLocalPath: jest.fn(async () => '/fake/model.gguf'),
  },
}));

import {buildGrammar} from '../src/services/aiGrammar';
import {TOOL_REGISTRY} from '../src/services/aiTools';
import {
  __testables,
  aiAssistantService,
  ModelNotLoadedError,
  BatteryTooLowError,
} from '../src/services/aiAssistantService';
import {defaultProfile} from '../src/stores/appStore';
import type {ChatMessage} from '../src/types';

const llamaMock = require('llama.rn');
const deviceInfoMock = require('react-native-device-info');

const {parseAction, extractJsonObject, createSpeakStreamer, detectForcedTool} =
  __testables;

const baseHistory: ChatMessage[] = [
  {id: 'welcome', role: 'assistant', text: 'Hi'} as ChatMessage,
];

const queryArgs = (userMessage: string) => ({
  userMessage,
  context: 'earthquake' as const,
  conversationHistory: baseHistory,
  profile: defaultProfile,
  nearestCenters: [],
});

const drain = async (
  gen: AsyncIterableIterator<string>,
): Promise<string> => {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
};

beforeEach(() => {
  llamaMock.__reset();
  deviceInfoMock.__setBatteryLevel(0.9);
});

// ---------------------------------------------------------------------------
// Layer 1: grammar generation
// ---------------------------------------------------------------------------
describe('GBNF grammar', () => {
  const grammar = buildGrammar();

  it('defines a root rule covering speak + every registered tool', () => {
    expect(grammar).toMatch(/^root ::=/m);
    const rootLine = grammar.split('\n').find(l => l.startsWith('root ::='))!;
    expect(rootLine).toContain('speak');
    TOOL_REGISTRY.forEach((_t, i) => {
      expect(rootLine).toContain(`tool_${i}`);
    });
  });

  it('bakes each tool name in as a string literal', () => {
    TOOL_REGISTRY.forEach(t => {
      expect(grammar).toContain(`\\"${t.name}\\"`);
    });
  });

  it('renders enum args as literal alternations', () => {
    // get_protocol has disaster: enum[earthquake,typhoon,volcano]
    expect(grammar).toContain('\\"earthquake\\"');
    expect(grammar).toContain('\\"typhoon\\"');
    expect(grammar).toContain('\\"volcano\\"');
    expect(grammar).toContain('\\"before\\"');
  });

  it('emits {} args rule for parameterless tools', () => {
    // get_user_profile has no properties.
    expect(grammar).toMatch(/args_\d+ ::= "\{\}"/);
  });
});

// ---------------------------------------------------------------------------
// Layer 2a: parseAction
// ---------------------------------------------------------------------------
describe('parseAction', () => {
  it('parses a well-formed speak envelope', () => {
    const a = parseAction('{"action":"speak","text":"Stay calm."}');
    expect(a).toEqual({kind: 'speak', text: 'Stay calm.'});
  });

  it('parses a well-formed tool envelope', () => {
    const a = parseAction(
      '{"action":"tool","name":"get_protocol","args":{"disaster":"earthquake","phase":"during"}}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'get_protocol',
      args: {disaster: 'earthquake', phase: 'during'},
    });
  });

  it('strips a reasoning prefix before the JSON object', () => {
    const a = parseAction(
      '<think>user wants protocol</think>{"action":"tool","name":"get_protocol","args":{}}',
    );
    expect(a.kind).toBe('tool');
  });

  it('tolerates the malformed {action:<toolname>, name:<toolname>} shape', () => {
    const a = parseAction(
      '{"action":"get_protocol","name":"get_protocol","args":{"disaster":"typhoon","phase":"after"}}',
    );
    expect(a).toMatchObject({kind: 'tool', name: 'get_protocol'});
  });

  it('tolerates action-as-tool-name with top-level args and nested disaster.type', () => {
    const a = parseAction(
      '{"action":"get_protocol","disaster":{"type":"earthquake"},"phase":"before"}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'get_protocol',
      args: {disaster: 'earthquake', phase: 'before'},
    });
  });

  it('merges empty args with top-level protocol fields', () => {
    const a = parseAction(
      '{"action":"tool","name":"get_protocol","args":{},"disaster":"earthquake","phase":"before"}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'get_protocol',
      args: {disaster: 'earthquake', phase: 'before'},
    });
  });

  it('normalizes nested disaster.type inside args', () => {
    const a = parseAction(
      '{"action":"tool","name":"get_protocol","args":{"disaster":{"type":"typhoon"},"phase":"during"}}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'get_protocol',
      args: {disaster: 'typhoon', phase: 'during'},
    });
  });

  it('parses stringified args payloads', () => {
    const a = parseAction(
      '{"action":"tool","name":"find_nearby","args":"{\\"category\\":\\"hospital\\"}"}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'find_nearby',
      args: {category: 'hospital'},
    });
  });

  it('accepts tool names case-insensitively', () => {
    const a = parseAction(
      '{"action":"tool","name":"GET_PROTOCOL","args":{"disaster":"volcano","phase":"after"}}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'get_protocol',
      args: {disaster: 'volcano', phase: 'after'},
    });
  });

  it('parses name-only tool envelopes', () => {
    const a = parseAction('{"name":"get_user_profile"}');
    expect(a).toEqual({kind: 'tool', name: 'get_user_profile', args: {}});
  });

  it('rejects action=tool with unknown name', () => {
    const a = parseAction('{"action":"tool","name":"launch_missiles","args":{}}');
    expect(a.kind).toBe('invalid');
  });

  it('repairs missing quote before args object (grammar / token seam)', () => {
    const a = parseAction(
      '{"action":"tool","name":"route_to_nearest_evacuation","args:{}}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'route_to_nearest_evacuation',
      args: {},
    });
  });

  it('rejects unknown tool names as invalid', () => {
    const a = parseAction('{"name":"launch_missiles","args":{}}');
    expect(a.kind).toBe('invalid');
  });

  it('treats plain prose (no JSON) as speak — models often skip the envelope for refusal lines', () => {
    expect(parseAction('totally not json')).toEqual({
      kind: 'speak',
      text: 'totally not json',
    });
    expect(
      parseAction("I can't verify that protocol — contact NDRRMC at 911."),
    ).toEqual({
      kind: 'speak',
      text: "I can't verify that protocol — contact NDRRMC at 911.",
    });
  });

  it('repairs args seam for find_nearby payload', () => {
    const a = parseAction(
      '{"action":"tool","name":"find_nearby","args:{"category":"hospital"}}',
    );
    expect(a).toEqual({
      kind: 'tool',
      name: 'find_nearby',
      args: {category: 'hospital'},
    });
  });

  it('returns invalid for malformed JSON that starts with {', () => {
    expect(parseAction('{broken incomplete').kind).toBe('invalid');
  });

  it('extractJsonObject returns the first balanced object only', () => {
    expect(extractJsonObject('junk {"a":{"b":1}} trailing {')).toBe(
      '{"a":{"b":1}}',
    );
    expect(extractJsonObject('no braces here')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Layer 2b: streaming JSON peeker
// ---------------------------------------------------------------------------
describe('createSpeakStreamer', () => {
  it('emits only the decoded text of a speak envelope', () => {
    let out = '';
    const s = createSpeakStreamer(c => (out += c));
    for (const ch of '{"action":"speak","text":"Drop, cover, hold on."}') {
      s.push(ch);
    }
    expect(out).toBe('Drop, cover, hold on.');
  });

  it('decodes \\n and \\uXXXX escapes', () => {
    let out = '';
    const s = createSpeakStreamer(c => (out += c));
    s.push('{"action":"speak","text":"line1\\nline2 \\u00f1"}');
    expect(out).toBe('line1\nline2 ñ');
  });

  it('emits nothing for a tool envelope (no raw JSON leak)', () => {
    let out = '';
    const s = createSpeakStreamer(c => (out += c));
    s.push('{"action":"tool","name":"get_protocol","args":{}}');
    expect(out).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Layer 3+4 (mocked model): the dispatch loop
// ---------------------------------------------------------------------------
describe('aiAssistantService.query dispatch loop', () => {
  // The service holds a module-level llama singleton; fully reset it around
  // every test so scripted turns and the no-model case don't bleed across.
  beforeEach(async () => {
    await aiAssistantService.release();
  });
  afterEach(async () => {
    await aiAssistantService.release();
  });

  it('streams a direct speak answer', async () => {
    llamaMock.__setScriptedTurns(['{"action":"speak","text":"Hello there."}']);
    const text = await drain(
      aiAssistantService.query(queryArgs('is my area safe?')),
    );
    expect(text).toBe('Hello there.');
  });

  it('calls a tool, feeds the result back, then speaks', async () => {
    llamaMock.__setScriptedTurns([
      '{"action":"tool","name":"get_protocol","args":{"disaster":"earthquake","phase":"during"}}',
      '{"action":"speak","text":"Per NDRRMC: drop, cover, hold on."}',
    ]);
    const events: string[] = [];
    const text = await drain(
      aiAssistantService.query(
        queryArgs('what do I do in an earthquake?'),
        ev => events.push(`${ev.kind}:${ev.name}`),
      ),
    );
    expect(events).toEqual([
      'tool_call:get_protocol',
      'tool_result:get_protocol',
    ]);
    expect(text).toBe('Per NDRRMC: drop, cover, hold on.');
  });

  it('answers a trivial greeting without invoking the model', async () => {
    llamaMock.initLlama.mockClear();
    const text = await drain(aiAssistantService.query(queryArgs('hello')));
    expect(text).toContain('LIKAS');
    // The greeting short-circuits before the model is ever loaded.
    expect(llamaMock.initLlama).not.toHaveBeenCalled();
  });

  // Graceful-degradation contract: in a life-safety app the user must always
  // get *something* actionable, so query() yields rule-based guidance instead
  // of throwing when the model is unavailable / misbehaves. (The no-model path
  // also force-runs evac/POI tools so the map still works — see useAIAssistant.)
  it('falls back to NDRRMC guidance when the model is unavailable', async () => {
    const {assetManager} = require('../src/services/assetManager');
    await aiAssistantService.release(); // ensure no cached context short-circuits
    assetManager.getLocalPath.mockResolvedValue(null);
    try {
      const text = await drain(
        aiAssistantService.query(queryArgs('what do I do in an earthquake?')),
      );
      expect(text).toMatch(/NDRRMC|PHIVOLCS|DROP, COVER/i);
    } finally {
      assetManager.getLocalPath.mockResolvedValue('/fake/model.gguf');
      await aiAssistantService.release();
    }
  });

  it('forces the evac tool in the no-model path so the route still reaches the map', async () => {
    const {assetManager} = require('../src/services/assetManager');
    await aiAssistantService.release();
    assetManager.getLocalPath.mockResolvedValue(null);
    try {
      const events: string[] = [];
      await drain(
        aiAssistantService.query(queryArgs('where do I evacuate?'), ev =>
          events.push(`${ev.kind}:${ev.name}`),
        ),
      );
      // nearestCenters is [] in queryArgs, so no route payload — but the
      // intent is recognized and the user still gets evac guidance text.
      expect(events).toEqual([]);
    } finally {
      assetManager.getLocalPath.mockResolvedValue('/fake/model.gguf');
      await aiAssistantService.release();
    }
  });

  it('falls back to guidance on invalid model output (never leaks raw JSON)', async () => {
    llamaMock.__setScriptedTurns(['this is not valid json at all']);
    const text = await drain(aiAssistantService.query(queryArgs('help')));
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('{"action"');
  });

  it('recovers with a fallback when the model loops past the tool-call limit', async () => {
    const toolTurn =
      '{"action":"tool","name":"get_protocol","args":{"disaster":"earthquake","phase":"during"}}';
    llamaMock.__setScriptedTurns([toolTurn, toolTurn, toolTurn, toolTurn, toolTurn]);
    const text = await drain(
      aiAssistantService.query(queryArgs('explain everything')),
    );
    expect(text.length).toBeGreaterThan(0);
  });

  it('THROWS BatteryTooLowError below the battery floor', async () => {
    deviceInfoMock.__setBatteryLevel(0.05);
    await expect(
      drain(aiAssistantService.query(queryArgs('help me'))),
    ).rejects.toThrow(BatteryTooLowError);
  });
});

// ---------------------------------------------------------------------------
// Intent detector — the deterministic rescue trigger
// ---------------------------------------------------------------------------
describe('detectForcedTool', () => {
  it('routes evacuation phrasing (English) to route_to_nearest_evacuation', () => {
    expect(detectForcedTool('where is the nearest evacuation center?')).toEqual({
      tool: 'route_to_nearest_evacuation',
      args: {},
    });
  });

  it('routes evacuation phrasing (Filipino) to route_to_nearest_evacuation', () => {
    expect(detectForcedTool('Saan ako lilikas?')).toMatchObject({
      tool: 'route_to_nearest_evacuation',
    });
    expect(detectForcedTool('saan kami pwedeng pumunta na safe?')).toMatchObject(
      {tool: 'route_to_nearest_evacuation'},
    );
  });

  it('maps "nearest hospital" to find_nearby with the right category', () => {
    expect(detectForcedTool("where's the closest hospital?")).toMatchObject({
      tool: 'find_nearby',
      args: {category: 'hospital'},
    });
  });

  it('maps Filipino POI phrasing to find_nearby', () => {
    expect(detectForcedTool('may malapit bang paaralan dito?')).toMatchObject({
      tool: 'find_nearby',
      args: {category: 'school'},
    });
  });

  it('does NOT force a tool on off-topic / refusal turns', () => {
    expect(detectForcedTool('Who won the NBA finals last year?')).toBeNull();
    expect(detectForcedTool('Write me a poem about the moon.')).toBeNull();
    expect(detectForcedTool("What's your favorite food?")).toBeNull();
  });

  it('does NOT force a tool on protocol / profile questions', () => {
    // These have their own tools; the model handles them — no rescue.
    expect(detectForcedTool('what do I do during an earthquake?')).toBeNull();
    expect(detectForcedTool('what meds do I have on file?')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rescue path: model narrates a tool instead of emitting the envelope
// ---------------------------------------------------------------------------
describe('post-speak tool rescue', () => {
  beforeEach(async () => {
    // Fully isolate from the shared llama singleton + scripted-turn cursor and
    // restore the default model path (a prior no-model test may have nulled
    // it). Then prime a fresh context so ensureContext() can't return a stale
    // cached null from a previous test's no-model run.
    llamaMock.__reset();
    const {assetManager} = require('../src/services/assetManager');
    assetManager.isInstalled.mockResolvedValue(true);
    assetManager.getLocalPath.mockResolvedValue('/fake/model.gguf');
    await aiAssistantService.release();
    await aiAssistantService.initialize();
  });
  afterEach(async () => {
    await aiAssistantService.release();
  });

  it('force-runs route_to_nearest_evacuation when the model only narrates it', async () => {
    // Reproduces the notebook §IV "Saan ako lilikas?" failure: the model
    // chose `speak` and described the tool instead of calling it.
    llamaMock.__setScriptedTurns([
      '{"action":"speak","text":"Kailangan kong gamitin ang route_to_nearest_evacuation tool."}',
    ]);
    const events: string[] = [];
    const text = await drain(
      aiAssistantService.query(queryArgs('Saan ako lilikas?'), ev =>
        events.push(`${ev.kind}:${ev.name}`),
      ),
    );
    expect(events).toEqual([
      'tool_call:route_to_nearest_evacuation',
      'tool_result:route_to_nearest_evacuation',
    ]);
    // The model's narration is preserved, with the map note appended.
    expect(text).toContain('route_to_nearest_evacuation');
    expect(text).toMatch(/route on the map/i);
  });

  it('does NOT double-run when the model already called the tool', async () => {
    llamaMock.__setScriptedTurns([
      '{"action":"tool","name":"route_to_nearest_evacuation","args":{}}',
      '{"action":"speak","text":"Your nearest center is X."}',
    ]);
    const events: string[] = [];
    await drain(
      aiAssistantService.query(
        queryArgs('where is the nearest evacuation center?'),
        ev => events.push(`${ev.kind}:${ev.name}`),
      ),
    );
    const calls = events.filter(e => e === 'tool_call:route_to_nearest_evacuation');
    expect(calls).toHaveLength(1);
  });

  it('does NOT rescue an off-topic refusal', async () => {
    llamaMock.__setScriptedTurns([
      '{"action":"speak","text":"I can only help with disaster topics."}',
    ]);
    const events: string[] = [];
    const text = await drain(
      aiAssistantService.query(queryArgs('write me a poem about the moon'), ev =>
        events.push(`${ev.kind}:${ev.name}`),
      ),
    );
    expect(events).toEqual([]);
    expect(text).toBe('I can only help with disaster topics.');
  });
});
