import DeviceInfo from 'react-native-device-info';
import {initLlama, LlamaContext, releaseAllLlama} from 'llama.rn';

import {contextualChips, disasterActions} from '../data/seedData';
import type {
  ChatMessage,
  DisasterContext,
  EvacuationRanking,
  UserProfile,
} from '../types';
import {assetManager} from './assetManager';
import {TOOL_REGISTRY, ToolResult, findTool} from './aiTools';
import {buildGrammar} from './aiGrammar';

const AI_MODEL_ASSET_ID = 'ai-model-gemma-4-e2b';
const BATTERY_FLOOR = 0.15;
const DEFAULT_CONTEXT_SIZE = 4096;
const MAX_TOOL_CALLS_PER_TURN = 3;
const SAMPLING = {
  temperature: 0.4,
  top_p: 0.85,
  top_k: 40,
  repeat_penalty: 1.1,
  n_predict: 512,
};

export class BatteryTooLowError extends Error {
  constructor(public readonly level: number) {
    super(`Battery too low for AI inference: ${(level * 100).toFixed(0)}%`);
    this.name = 'BatteryTooLowError';
  }
}

export class ModelNotLoadedError extends Error {
  constructor() {
    super('AI model is not loaded. Download it from Setup.');
    this.name = 'ModelNotLoadedError';
  }
}

const scopeMessage =
  'LIKAS is specialized for disaster preparedness and emergency response. Ask about evacuation, first aid, typhoons, earthquakes, volcanoes, or go-bag preparation.';

const disasterKeywords = [
  'ash', 'bag', 'bleed', 'burn', 'baha', 'earthquake', 'evac', // 'flood',
  'lindol', 'quake', 'trapped', 'typhoon', 'ulan', 'volcano', 'bagyo',
  'sugat', 'abo',
];

const buildSystemPrompt = (
  profile: UserProfile,
  activeContext: DisasterContext,
): string => {
  const toolList = TOOL_REGISTRY.map(
    t => `- ${t.name}(${JSON.stringify((t.parameters as any).properties ?? {})}): ${t.description}`,
  ).join('\n');

  const conditions = Object.entries(profile.medicalConditions)
    .filter(([key, val]) => key !== 'none' && key !== 'other' && val === true)
    .map(([key]) => key);
  if (profile.medicalConditions.other) conditions.push(profile.medicalConditions.other);

  const petTypes = profile.pets.hasPets
    ? Object.entries(profile.pets)
        .filter(
          ([key, val]) =>
            key !== 'hasPets' && typeof val === 'object' && (val as any).count > 0,
        )
        .map(([key, val]) => `${(val as any).count} ${key} (${(val as any).size})`)
    : [];

  const meetingPrimary = profile.location.primaryMeeting?.landmark || '';
  const meetingSecondary = profile.location.secondaryMeeting?.landmark || '';

  const contacts = profile.emergencyContacts
    .filter(c => c.name && c.phone)
    .map(c => `${c.name}${c.relationship ? ` (${c.relationship})` : ''}`);

  const profileSummary = [
    profile.name ? `name=${profile.name}` : null,
    profile.ageGroup ? `ageGroup=${profile.ageGroup}` : null,
    `companions: infants=${profile.companions.infants}, children=${profile.companions.children}, elderly=${profile.companions.elderly}, pwd=${profile.companions.pwd}`,
    petTypes.length > 0 ? `pets: ${petTypes.join(', ')}` : 'pets: none',
    conditions.length > 0 ? `medicalConditions: ${conditions.join(', ')}` : null,
    profile.location.streetAddress
      ? `address=${profile.location.streetAddress}, ${profile.location.barangay}, ${profile.location.city}`
      : `location=${profile.location.barangay}, ${profile.location.city}`,
    meetingPrimary ? `primaryMeetingPoint=${meetingPrimary}` : null,
    meetingSecondary ? `secondaryMeetingPoint=${meetingSecondary}` : null,
    contacts.length > 0 ? `emergencyContacts: ${contacts.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('; ');

  return `You are LIKAS, an offline disaster companion for the Philippines.

CRITICAL RULES — VIOLATING THESE PUTS LIVES AT RISK:
1. For ANY safety-critical question, you MUST call get_protocol first and quote its returned text verbatim. Never invent or paraphrase safety steps.
2. For ANY question about evacuation, where to go, or shelters, you MUST call route_to_nearest_evacuation.
3. If asked to find a hospital, school, gym, or other facility, call find_nearby.
4. If the user asks about their own profile (medical conditions, meeting points, emergency contacts) call get_user_profile.
5. PERSONALIZE every reply using the USER PROFILE below. Mention the user's name when natural. If they have asthma, prioritize masks. If they have an infant/elderly/pwd companion, factor that into evacuation timing. If they have pets, address pet logistics. Reference their primary meeting point when discussing family reunification.
6. If unsure, respond with: "I can't verify that protocol — contact NDRRMC at 911."
7. Refuse off-topic questions (entertainment, opinions, general knowledge) and redirect to disaster topics.
8. Respond in the same language the user used (English, Filipino, or Taglish). Keep replies concise.
9. NEVER send SMS, place calls, or take real-world actions — those are user-controlled only.

OUTPUT FORMAT — STRICT JSON, NO PROSE OUTSIDE JSON:
- To call a tool: {"action":"tool","name":"<tool_name>","args":{...}}
- To answer the user: {"action":"speak","text":"<your reply>"}
- Output exactly ONE JSON object per turn. After a tool result is returned, decide again.

AVAILABLE TOOLS:
${toolList}

ACTIVE DISASTER CONTEXT: ${activeContext}
USER PROFILE: ${profileSummary}`;
};

type QueryParams = {
  userMessage: string;
  context: DisasterContext;
  conversationHistory: ChatMessage[];
};

export type ToolCallEvent = {
  kind: 'tool_call';
  name: string;
  args: Record<string, unknown>;
};

export type ToolResultEvent = {
  kind: 'tool_result';
  name: string;
  result: ToolResult;
};

export type AssistantEvent = ToolCallEvent | ToolResultEvent;

let llamaContext: LlamaContext | null = null;
let initPromise: Promise<LlamaContext | null> | null = null;
let cachedGrammar: string | null = null;

const grammar = (): string => {
  if (!cachedGrammar) cachedGrammar = buildGrammar();
  return cachedGrammar;
};

const fallbackResponse = (
  params: QueryParams & {
    profile: UserProfile;
    nearestCenters: EvacuationRanking[];
  },
): string => {
  const normalized = params.userMessage.toLowerCase();
  const isInScope = disasterKeywords.some(k => normalized.includes(k));
  if (!isInScope && params.conversationHistory.length > 1) return scopeMessage;
  if (normalized.includes('trapped') || normalized.includes('naipit')) {
    return 'NDRRMC guidance: stay calm, cover your mouth with cloth, avoid unnecessary movement, tap on a pipe or wall, and shout only when rescuers are nearby to conserve energy.';
  }
  if (normalized.includes('bleed') || normalized.includes('sugat')) {
    return 'NDRRMC first aid: apply firm direct pressure with clean cloth, keep pressure steady, add layers if blood soaks through, and seek emergency care when safe.';
  }
  if (
    normalized.includes('evac') ||
    normalized.includes('center') ||
    normalized.includes('shelter')
  ) {
    const best = params.nearestCenters[0];
    if (!best) {
      return 'NDRRMC guidance: move to a designated evacuation center announced by your barangay.';
    }
    return `NDRRMC guidance: your best local option is ${best.center.name}, about ${best.distanceKm.toFixed(1)} km away or ${best.estimatedWalkMinutes} minutes on foot.`;
  }
  if (params.context === 'earthquake') {
    return 'PHIVOLCS and NDRRMC guidance: DROP, COVER, AND HOLD ON. After shaking stops, check injuries, avoid elevators, watch for aftershocks.';
  }
  if (params.context === 'volcano') {
    return 'PHIVOLCS guidance: protect breathing with N95 or damp cloth, keep ash out of food and water, follow mandatory evacuation at Alert Level 4 or 5.';
  }
  if (params.context === 'typhoon') {
    return 'PAGASA and NDRRMC guidance: stay indoors, unplug appliances, and follow LGU evacuation orders for storm-surge or heavy rain.';
  }
  return 'NDRRMC guidance: prepare water, food, flashlight, radio, medicines, documents, and family meeting points.';
};

const isBatteryOk = async (): Promise<boolean> => {
  try {
    const level = await DeviceInfo.getBatteryLevel();
    if (level < 0) return true;
    if (level < BATTERY_FLOOR) throw new BatteryTooLowError(level);
    return true;
  } catch (err) {
    if (err instanceof BatteryTooLowError) throw err;
    return true;
  }
};

const ensureContext = async (): Promise<LlamaContext | null> => {
  if (llamaContext) return llamaContext;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const modelPath = await assetManager.getLocalPath(AI_MODEL_ASSET_ID);
    if (!modelPath) return null;
    try {
      const ctx = await initLlama({
        model: modelPath,
        n_ctx: 2048,
        n_threads: 4,
        n_gpu_layers: 99,
      });
      llamaContext = ctx;
      return ctx;
    } catch (err) {
      console.warn('[aiAssistantService] initLlama failed:', err);
      return null;
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
};

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
type ChatMsg = {role: ChatRole; content: string};

const seedMessages = (
  params: QueryParams,
  profile: UserProfile,
): ChatMsg[] => {
  const history = params.conversationHistory
    .filter(m => m.id !== 'welcome')
    .slice(-8)
    .map<ChatMsg>(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
  return [
    {role: 'system', content: buildSystemPrompt(profile, params.context)},
    ...history,
    {role: 'user', content: params.userMessage},
  ];
};

type ParsedAction =
  | {kind: 'speak'; text: string}
  | {kind: 'tool'; name: string; args: Record<string, any>}
  | {kind: 'invalid'; raw: string};

/**
 * Streaming JSON peeker for the grammar-constrained envelope. Detects whether
 * the response is `{"action":"speak", ...}` or `{"action":"tool", ...}`. For
 * speak responses, emits the value of `text` character-by-character as the
 * model produces tokens. For tool responses, swallows everything (the dispatch
 * loop handles them after completion).
 */
const createSpeakStreamer = (emit: (chunk: string) => void) => {
  let buffer = '';
  let mode: 'detect' | 'speak-pre' | 'speak-text' | 'tool' | 'done' = 'detect';
  let emittedChars = 0;
  let escapeNext = false;
  // Accumulate \u escape sequences.
  let unicodeBuf = '';
  let inUnicode = false;

  const trySwitchMode = () => {
    // Strip leading whitespace.
    const s = buffer.replace(/^[\s\n\r\t]+/, '');
    if (s.length === 0) return;
    // Look for the action discriminator.
    const speakIdx = s.search(/"action"\s*:\s*"speak"/);
    if (speakIdx !== -1) {
      mode = 'speak-pre';
      // Look for the start of the text field.
      const textMatch = /"text"\s*:\s*"/.exec(s);
      if (textMatch) {
        const startOfText = textMatch.index + textMatch[0].length;
        buffer = s.slice(startOfText);
        mode = 'speak-text';
      }
      return;
    }
    const toolIdx = s.search(/"action"\s*:\s*"tool"/);
    if (toolIdx !== -1) {
      mode = 'tool';
      buffer = '';
    }
  };

  const processSpeakChar = (ch: string) => {
    if (inUnicode) {
      unicodeBuf += ch;
      if (unicodeBuf.length === 4) {
        const codePoint = parseInt(unicodeBuf, 16);
        if (!Number.isNaN(codePoint)) {
          const out = String.fromCharCode(codePoint);
          emit(out);
          emittedChars += out.length;
        }
        inUnicode = false;
        unicodeBuf = '';
      }
      return;
    }
    if (escapeNext) {
      escapeNext = false;
      if (ch === 'u') {
        inUnicode = true;
        unicodeBuf = '';
        return;
      }
      const map: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
      };
      const out = map[ch] ?? ch;
      emit(out);
      emittedChars += out.length;
      return;
    }
    if (ch === '\\') {
      escapeNext = true;
      return;
    }
    if (ch === '"') {
      mode = 'done';
      return;
    }
    emit(ch);
    emittedChars += ch.length;
  };

  return {
    push: (chunk: string) => {
      if (mode === 'tool' || mode === 'done') return;
      buffer += chunk;
      if (mode === 'detect' || mode === 'speak-pre') trySwitchMode();
      if (mode !== 'speak-text') return;
      // Drain buffer character by character so escape parsing is correct.
      while (buffer.length > 0 && (mode as string) === 'speak-text') {
        const ch = buffer[0];
        buffer = buffer.slice(1);
        processSpeakChar(ch);
      }
    },
    /** Returns trailing characters from the final decoded text that streaming missed. */
    remainder: (fullText: string): string => {
      if (mode === 'tool') return '';
      if (emittedChars >= fullText.length) return '';
      return fullText.slice(emittedChars);
    },
  };
};

// Extract the first balanced JSON object from a string, ignoring junk before/after.
// Handles cases where Gemma 4 emits reasoning prefixes like `<think>...</think>{...}`
// or chat-template artifacts that shouldn't be there but sometimes are.
const extractJsonObject = (raw: string): string | null => {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
};

const KNOWN_TOOL_NAMES = new Set(TOOL_REGISTRY.map(t => t.name));

const parseAction = (raw: string): ParsedAction => {
  const json = extractJsonObject(raw) ?? raw.trim();
  try {
    const obj = JSON.parse(json);
    if (obj?.action === 'speak' && typeof obj.text === 'string') {
      return {kind: 'speak', text: obj.text};
    }
    if (obj?.action === 'tool' && typeof obj.name === 'string') {
      return {kind: 'tool', name: obj.name, args: obj.args ?? {}};
    }
    // Tolerate the common malformed shape: {"action":"<tool_name>", "name":"<tool_name>", "args":{}}
    if (
      typeof obj?.action === 'string' &&
      typeof obj?.name === 'string' &&
      obj.action === obj.name &&
      KNOWN_TOOL_NAMES.has(obj.name)
    ) {
      return {kind: 'tool', name: obj.name, args: obj.args ?? {}};
    }
    if (typeof obj?.name === 'string' && KNOWN_TOOL_NAMES.has(obj.name)) {
      return {kind: 'tool', name: obj.name, args: obj.args ?? {}};
    }
    return {kind: 'invalid', raw};
  } catch {
    return {kind: 'invalid', raw};
  }
};

export const aiAssistantService = {
  initialize: async () => {
    await ensureContext();
  },

  isReady: async (): Promise<boolean> => {
    if (llamaContext) return true;
    return assetManager.isInstalled(AI_MODEL_ASSET_ID);
  },

  release: async () => {
    if (!llamaContext) return;
    try {
      await releaseAllLlama();
    } finally {
      llamaContext = null;
    }
  },

  getImmediateAction: (context: DisasterContext) => disasterActions[context],

  getContextualChips: (context: DisasterContext) => contextualChips[context],

  /**
   * Runs a tool-aware dispatch loop. Yields the final `speak.text` as a single
   * chunk, and emits AssistantEvent values for tool_call / tool_result so the UI
   * can show "Looking up..." affordances. On any failure, falls back to the
   * rule-based responder so the user always gets *something*.
   */
  query: async function* (
    params: QueryParams & {
      profile: UserProfile;
      nearestCenters: EvacuationRanking[];
    },
    onEvent?: (event: AssistantEvent) => void,
  ): AsyncIterableIterator<string> {
    await isBatteryOk();

    const trivialGreeting =
      /^(hi+|hello+|hey+|yo|kumusta|kamusta|good\s+(morning|evening|afternoon|day)|magandang\s+(umaga|hapon|gabi)|salamat|thanks|thank\s+you)[!.\s]*$/i;
    if (trivialGreeting.test(params.userMessage.trim())) {
      const rawName = params.profile.name?.trim() ?? '';
      const displayName = rawName
        ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
        : '';
      const name = displayName ? `, ${displayName}` : '';
      yield `Hello${name}. I'm LIKAS, your offline disaster companion. Ask me about evacuation, first aid, typhoons, earthquakes, or volcanoes.`;
      return;
    }

    const ctx = await ensureContext();
    if (!ctx) {
      yield fallbackResponse(params);
      return;
    }

    const messages = seedMessages(params, params.profile);
    const toolContext = {profile: params.profile, activeContext: params.context};

    for (let turn = 0; turn <= MAX_TOOL_CALLS_PER_TURN; turn++) {
      console.log(`[AI] Starting turn ${turn}...`);
      let raw = '';
      const streamQueue: string[] = [];
      let streamDone = false;
      let resolveStream: ((v: IteratorResult<string>) => void) | null = null;
      const streamer = createSpeakStreamer(chunk => {
        if (resolveStream) {
          const r = resolveStream;
          resolveStream = null;
          r({value: chunk, done: false});
        } else {
          streamQueue.push(chunk);
        }
      });

      const grammarStr = grammar();
      console.log('[AI] Starting completion. Grammar length:', grammarStr.length);
      console.log('[AI] Grammar head:', grammarStr.slice(0, 300));
      try {
        const formatted = await (ctx as any).getFormattedChat(messages, undefined, {
          jinja: true,
          enable_thinking: false,
          reasoning_format: 'none',
        });
        console.log('[AI] Formatted chat type:', formatted?.type, '| prompt head:', String(formatted?.prompt ?? '').slice(0, 200));
      } catch (e) {
        console.warn('[AI] getFormattedChat probe failed:', e);
      }
      const completionPromise = ctx
        .completion(
          {
            messages: messages as any,
            jinja: true,
            enable_thinking: false,
            reasoning_format: 'none',
            ...SAMPLING,
            grammar: grammarStr,
            stop: [
              '<end_of_turn>',
              '<|eot_id|>',
              '</s>',
              '<|channel>',
              '<channel|>',
            ],
          },
          tok => {
            if (tok?.token) {
              raw += tok.token;
              console.log(`[AI] Token: ${JSON.stringify(tok.token)}`);
              streamer.push(tok.token);
            }
          },
        )
        .then(result => {
          raw = (result as any)?.text ?? raw;
          console.log(`[AI] Completion finished. Raw output length: ${raw.length}`);
        })
        .catch(err => {
          console.warn('[aiAssistantService] completion error:', err);
        })
        .finally(() => {
          streamDone = true;
          if (resolveStream) {
            const r = resolveStream;
            resolveStream = null;
            r({value: '', done: true});
          }
        });

      // Drain the streamer while completion runs. If the action turns out to be
      // a tool, the streamer never emits anything (suppressed) and we just wait.
      while (true) {
        if (streamQueue.length > 0) {
          yield streamQueue.shift()!;
          continue;
        }
        if (streamDone) break;
        const next = await new Promise<IteratorResult<string>>(resolve => {
          resolveStream = resolve;
        });
        if (next.done) break;
        if (next.value) yield next.value;
      }
      await completionPromise;

      console.log(`[AI] Parsing action from raw: ${raw}`);
      const action = parseAction(raw);
      console.log(`[AI] Parsed action kind: ${action.kind}`);
      if (action.kind === 'speak') {
        // Text already streamed via the token callback. Emit any trailing
        // characters the streamer missed (cheap idempotency guard).
        const remaining = streamer.remainder(action.text);
        if (remaining) yield remaining;
        return;
      }
      if (action.kind === 'invalid') {
        // Grammar should make this impossible, but guard anyway. Never leak raw JSON to the UI.
        console.warn('[AI] Invalid action from model. Raw head:', raw.slice(0, 300));
        yield fallbackResponse(params);
        return;
      }

      // Tool call path
      if (turn === MAX_TOOL_CALLS_PER_TURN) {
        yield 'I gathered enough info but ran out of tool turns. Please rephrase your question.';
        return;
      }
      const tool = findTool(action.name);
      if (!tool) {
        messages.push({
          role: 'tool',
          content: JSON.stringify({error: `Unknown tool: ${action.name}`}),
        });
        continue;
      }
      onEvent?.({kind: 'tool_call', name: action.name, args: action.args});
      let toolResult: ToolResult;
      try {
        toolResult = await tool.handler(action.args, toolContext);
      } catch (err) {
        toolResult = {
          summary: `Tool ${action.name} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        };
      }
      onEvent?.({kind: 'tool_result', name: action.name, result: toolResult});

      // Inject the tool call we made + its result back into the dialog so the
      // next generation sees them.
      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          action: 'tool',
          name: action.name,
          args: action.args,
        }),
      });
      messages.push({
        role: 'tool',
        content: JSON.stringify({
          name: action.name,
          result: toolResult.summary,
        }),
      });
    }

    yield fallbackResponse(params);
  },
};
