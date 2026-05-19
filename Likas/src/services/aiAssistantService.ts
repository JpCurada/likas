import DeviceInfo from 'react-native-device-info';
import {initLlama, LlamaContext, releaseAllLlama} from 'llama.rn';

import {contextualChips, disasterActions} from '../data/seedData';
import type {
  ChatMessage,
  DisasterContext,
  EvacuationRanking,
  LatLng,
  UserProfile,
} from '../types';
import {assetManager} from './assetManager';
import {TOOL_REGISTRY, ToolResult, findTool} from './aiTools';
import {buildGrammar} from './aiGrammar';
import {routingService, GraphNotLoadedError, NoRouteError} from './routingService';

const AI_MODEL_ASSET_ID = 'ai-model-gemma-4-e2b';
const BATTERY_FLOOR = 0.15;

// Total KV-cache window. Must comfortably hold:
//   system prompt (~1.5k tokens) + recent history + user turn +
//   tool call + tool result + speak reply.
// Matches notebooks/Likas_Sample_Prompts.ipynb (n_ctx=4096) so on-device
// behavior mirrors the GPU reference. 2048 was overflowing on tool-result
// turns and producing truncated / silent generations.
const DEFAULT_CONTEXT_SIZE = 4096;
const MAX_TOOL_CALLS_PER_TURN = 3;
const SAMPLING = {
  temperature: 0.4,
  top_p: 0.85,
  top_k: 40,
  repeat_penalty: 1.1,
  // Generation cap per turn. Doubled from 512 → 1024 so multi-paragraph
  // protocol answers + Tagalog/English bilingual replies don't get cut
  // off mid-sentence. We deliberately keep an upper bound (vs. -1 =
  // unlimited): on-device CPU runs ~5 tok/sec, so an unbounded reply
  // could hang for 3+ minutes on a complex question. 1024 tokens =
  // ~3 minutes worst case, ~30 s typical.
  n_predict: 1024,
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
2. For ANY question about evacuation, where to go, shelters, or "where is the nearest evacuation center" (English or Filipino: "saan pupunta", "saan ang pinakamalapit na evacuation"), you MUST call route_to_nearest_evacuation. This also makes the map app draw a route to the best center.
3. For ANY question that asks for the nearest place of interest — hospital, school, gym, multi-purpose hall, or covered court — you MUST call find_nearby with the correct category. The app will automatically drop pins on the map.
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

TOOL-PICKING EXAMPLES:
- User: "where is the nearest hospital?" → {"action":"tool","name":"find_nearby","args":{"category":"hospital"}}
- User: "saan ang pinakamalapit na ospital?" → {"action":"tool","name":"find_nearby","args":{"category":"hospital"}}
- User: "find the closest school" → {"action":"tool","name":"find_nearby","args":{"category":"school"}}
- User: "pinakamalapit na gym/covered court" → {"action":"tool","name":"find_nearby","args":{"category":"gymnasium"}} (or "covered_court")
- User: "where should I evacuate?" / "saan pupunta?" → {"action":"tool","name":"route_to_nearest_evacuation","args":{}}
- User: "family meeting point / communication plan" → {"action":"tool","name":"get_protocol","args":{"disaster":"earthquake","phase":"before"}}
- After a find_nearby or route_to_nearest_evacuation result, ALWAYS speak with a short summary AND tell the user the pins/route are already shown on the Map tab. Example speak text: "I found 3 nearby hospitals. The closest is X (1.2 km). I've placed pins on the map — open the Map tab to see them."

AVAILABLE TOOLS:
${toolList}

ACTIVE DISASTER CONTEXT: ${activeContext}
USER PROFILE: ${profileSummary}`;
};

type QueryParams = {
  userMessage: string;
  context: DisasterContext;
  conversationHistory: ChatMessage[];
  /**
   * The user's current GPS position, when available. Tools that rank
   * "nearest X" prefer this over the onboarded home coordinates so the
   * ranking reflects where the user actually is. Null/undefined when
   * location permission is denied or no fix has arrived yet — callers
   * must tolerate the absence.
   */
  liveLocation?: LatLng | null;
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
      console.log(`[aiAssistantService] Native initLlama start with model: ${modelPath}`);
      const ctx = await initLlama({
        model: modelPath,
        n_ctx: DEFAULT_CONTEXT_SIZE,
        n_threads: 4,
        n_gpu_layers: 99,
      });
      console.log('[aiAssistantService] Native initLlama SUCCESS');
      llamaContext = ctx;
      return ctx;
    } catch (err) {
      console.warn('[aiAssistantService] Native initLlama FAILED:', err);
      return null;
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
};

// Gemma's chat template only knows `user` and `assistant` roles, strictly
// alternating. There is NO `system` role and NO `tool` role — sending either
// raises `Conversation roles must alternate user/assistant/...` from Jinja
// the moment a follow-up turn is rendered. So we mirror the reference
// notebook (notebooks/Likas_Sample_Prompts.ipynb, dispatch / dispatch_loop):
//
//   - System prompt is PREPENDED to the first user message.
//   - Tool results are injected as a `user` turn with an explicit prefix
//     ("Tool result for X: ... Now respond to my original request using
//     this result.") instead of a `tool` role.
type ChatRole = 'user' | 'assistant';
type ChatMsg = {role: ChatRole; content: string};

const SYSTEM_USER_SEPARATOR = '\n\n---\n\n';

const seedMessages = (
  params: QueryParams,
  profile: UserProfile,
): ChatMsg[] => {
  const systemPrompt = buildSystemPrompt(profile, params.context);
  const history = params.conversationHistory
    .filter(m => m.id !== 'welcome')
    .slice(-8)
    .map<ChatMsg>(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

  const messages: ChatMsg[] = [];

  if (history.length === 0) {
    // No prior conversation: this user turn carries the system prompt.
    messages.push({
      role: 'user',
      content: `${systemPrompt}${SYSTEM_USER_SEPARATOR}${params.userMessage}`,
    });
    return messages;
  }

  // History exists: prepend the system prompt to whichever message is first.
  // Per the notebook, this guarantees the system context still reaches the
  // model and the user/assistant alternation that Gemma requires stays
  // intact regardless of where the user picks up the conversation.
  const [head, ...rest] = history;
  messages.push({
    role: head.role,
    content: `${systemPrompt}${SYSTEM_USER_SEPARATOR}${head.content}`,
  });
  messages.push(...rest);
  messages.push({role: 'user', content: params.userMessage});
  return messages;
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

/**
 * Fixes occasional malformed tool envelopes from grammar/token boundaries
 * (e.g. `{"action":"tool",...,"args:{}}` with a missing `"` before `args`).
 */
const repairAssistantJson = (s: string): string => {
  let out = s;
  out = out.replace(/"args:\{/g, '"args":{');
  out = out.replace(/,args:\{/g, ',"args":{');
  return out;
};

/** Flatten nested enum shapes like {"type":"earthquake"} → "earthquake". */
const normalizeToolArgValue = (value: unknown): unknown => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.type === 'string') return obj.type.trim();
    if (typeof obj.disaster === 'string') return obj.disaster.trim();
    if (typeof obj.phase === 'string') return obj.phase.trim();
    if (typeof obj.category === 'string') return obj.category.trim();
  }
  return value;
};

const normalizeToolArgs = (
  args: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = normalizeToolArgValue(value);
  }
  return out;
};

const parseArgsField = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeToolArgs(value as Record<string, unknown>);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeToolArgs(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore — fall through to empty
    }
  }
  return {};
};

/** Collect args from `args`, top-level fields, or both (top-level wins). */
const extractToolArgs = (obj: Record<string, unknown>): Record<string, unknown> => {
  const reserved = new Set(['action', 'name', 'text', 'args']);
  const topLevel: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!reserved.has(key)) topLevel[key] = normalizeToolArgValue(value);
  }
  const nested = parseArgsField(obj.args);
  return normalizeToolArgs({...nested, ...topLevel});
};

const KNOWN_TOOL_NAMES = new Set(TOOL_REGISTRY.map(t => t.name));

const resolveKnownToolName = (name: unknown): string | null => {
  if (typeof name !== 'string' || !name.trim()) return null;
  const trimmed = name.trim();
  if (KNOWN_TOOL_NAMES.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const toolName of KNOWN_TOOL_NAMES) {
    if (toolName === lower) return toolName;
  }
  return null;
};

const parseToolEnvelope = (
  obj: Record<string, unknown>,
  toolName: unknown,
): ParsedAction | null => {
  const name = resolveKnownToolName(toolName);
  if (!name) return null;
  return {kind: 'tool', name, args: extractToolArgs(obj)};
};

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

/**
 * Deterministic intent detector for the rescue path.
 *
 * The fine-tuned model is reliable but *inconsistent*: for evacuation / POI
 * questions it sometimes emits a clean tool envelope and sometimes narrates
 * the tool inside a `speak` reply ("...kailangan kong gamitin ang
 * route_to_nearest_evacuation"). When it narrates, no tool runs and nothing
 * reaches the map. This maps the same casual English/Filipino phrasing the
 * no-model fallback already handles to a concrete tool call, so the route /
 * pins land on the map regardless of which shape the model chose.
 *
 * Returns null for anything that isn't an unambiguous evac/POI ask — refusals
 * ("write me a poem"), protocol questions, and profile questions are left to
 * the model so we never force a tool onto an off-topic turn.
 */
const POI_KEYWORD_MAP: Array<{re: RegExp; category: string; label: string}> = [
  {re: /(hospital|ospital|emergency room|\ber\b)/i, category: 'hospital', label: 'hospitals'},
  {re: /(school|paaralan|eskwela)/i, category: 'school', label: 'schools'},
  {re: /(gym|gymnasium|himnasyo)/i, category: 'gymnasium', label: 'gymnasiums'},
  {re: /(covered court|kubierta)/i, category: 'covered_court', label: 'covered courts'},
  {re: /(multi[- ]?purpose|hall)/i, category: 'multi_purpose_hall', label: 'multi purpose halls'},
];

const EVAC_RE =
  /(evac|shelter|lilikas|lumikas|pupunta|saan.*(pumunta|ligtas|safe)|nearest evacuation|pinakamalapit na evac)/i;

export type ForcedTool =
  | {tool: 'route_to_nearest_evacuation'; args: Record<string, never>}
  | {tool: 'find_nearby'; args: {category: string}; label: string};

const detectForcedTool = (userMessage: string): ForcedTool | null => {
  const msg = userMessage.toLowerCase();
  if (EVAC_RE.test(msg)) {
    return {tool: 'route_to_nearest_evacuation', args: {}};
  }
  const asksNearest = /(nearest|closest|nearby|pinakamalapit|malapit|saan|where)/i.test(
    userMessage,
  );
  if (asksNearest) {
    const hit = POI_KEYWORD_MAP.find(p => p.re.test(userMessage));
    if (hit) {
      return {tool: 'find_nearby', args: {category: hit.category}, label: hit.label};
    }
  }
  return null;
};

const parseAction = (raw: string): ParsedAction => {
  const trimmed = raw.trim();
  if (!trimmed) return {kind: 'invalid', raw};

  // Prefer a balanced {...} span; Gemma sometimes prefixes thinking/whitespace.
  const extracted = extractJsonObject(trimmed);
  const jsonCandidate = extracted ?? trimmed;

  try {
    const obj = JSON.parse(repairAssistantJson(jsonCandidate)) as Record<
      string,
      unknown
    >;
    if (obj?.action === 'speak' && typeof obj.text === 'string') {
      return {kind: 'speak', text: obj.text};
    }
    if (obj?.action === 'tool') {
      const parsed = parseToolEnvelope(obj, obj.name);
      if (parsed) return parsed;
    }
    // Tolerate {action: "<tool_name>", ...args} with args at the top level.
    if (
      typeof obj?.action === 'string' &&
      obj.action !== 'tool' &&
      obj.action !== 'speak'
    ) {
      const parsed = parseToolEnvelope(obj, obj.action);
      if (parsed) return parsed;
    }
    // Tolerate {"action":"<tool_name>", "name":"<tool_name>", ...}
    if (
      typeof obj?.action === 'string' &&
      typeof obj?.name === 'string' &&
      obj.action === obj.name
    ) {
      const parsed = parseToolEnvelope(obj, obj.name);
      if (parsed) return parsed;
    }
    // Tolerate {"name":"<tool_name>", ...args} without action.
    if (typeof obj?.name === 'string') {
      const parsed = parseToolEnvelope(obj, obj.name);
      if (parsed) return parsed;
    }
    return {kind: 'invalid', raw};
  } catch {
    // The system prompt tells the model to say e.g. "I can't verify that protocol..."
    // for safety — models often emit that line as plain prose instead of wrapping
    // it in {"action":"speak","text":"..."}. If there is no JSON object to parse at
    // all, treat the whole string as spoken text so the user still sees the reply.
    const looksLikeProse = extracted === null && !trimmed.startsWith('{');
    if (looksLikeProse) {
      return {kind: 'speak', text: trimmed};
    }
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
    // Always clear the in-flight init promise so a failed/again-needed load
    // can be retried — otherwise a single early failure (e.g. model not yet
    // downloaded) would cache a null context for the rest of the process and
    // the AI would never come back even after the asset is installed.
    initPromise = null;
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
      const normalized = params.userMessage.toLowerCase();
      if (
        normalized.includes('evac') ||
        normalized.includes('center') ||
        normalized.includes('shelter') ||
        normalized.includes('saan pupunta')
      ) {
        const best = params.nearestCenters[0];
        if (best) {
          onEvent?.({
            kind: 'tool_call',
            name: 'route_to_nearest_evacuation',
            args: {},
          });
          const destination = {
            latitude: best.center.latitude,
            longitude: best.center.longitude,
          };
          let route = null;
          let routeNote = '';
          const evacOrigin =
            params.liveLocation ?? params.profile.location.coordinates;
          try {
            route = await routingService.route(evacOrigin, destination);
            routeNote = `\n\nRoute to ${best.center.name}: ${(route.distanceMeters / 1000).toFixed(2)} km along walkable roads, ~${route.durationMinutesWalking} min walking.`;
          } catch (err) {
            if (err instanceof GraphNotLoadedError) {
              routeNote = '\n\n(Road-following route unavailable — pedestrian map data not installed.)';
            } else if (err instanceof NoRouteError) {
              routeNote = '\n\n(Could not snap your location to a walkable road. Use the straight-line direction shown on the map.)';
            }
          }
          onEvent?.({
            kind: 'tool_result',
            name: 'route_to_nearest_evacuation',
            result: {
              summary: `Nearest option: ${best.center.name}${routeNote}`,
              payload: {
                kind: 'evacuation_ranking',
                centers: [best],
                route: route
                  ? {
                      destinationName: best.center.name,
                      destination,
                      polyline: route.polyline,
                      distanceMeters: route.distanceMeters,
                      durationMinutesWalking: route.durationMinutesWalking,
                    }
                  : null,
              },
            },
          });
          yield `NDRRMC guidance: your best local option is ${best.center.name}, about ${best.distanceKm.toFixed(1)} km away or ${best.estimatedWalkMinutes} minutes on foot.${routeNote}`;
          return;
        }
      }

      // No-LLM smart fallback for "where is the nearest <POI>?" type queries.
      // Maps casual English/Filipino phrasing to the same find_nearby tool the
      // LLM would normally invoke, so pins still land on the map.
      const poiKeywordMap: Array<{re: RegExp; category: string; label: string}> = [
        {re: /(hospital|ospital|emergency room|er)/i, category: 'hospital', label: 'hospitals'},
        {re: /(school|paaralan|eskwela)/i, category: 'school', label: 'schools'},
        {re: /(gym|gymnasium|himnasyo)/i, category: 'gymnasium', label: 'gymnasiums'},
        {re: /(covered court|kubierta)/i, category: 'covered_court', label: 'covered courts'},
        {re: /(multi[- ]?purpose|hall)/i, category: 'multi_purpose_hall', label: 'multi purpose halls'},
      ];
      const asksNearest = /(nearest|closest|nearby|pinakamalapit|malapit)/i.test(
        params.userMessage,
      );
      if (asksNearest) {
        const hit = poiKeywordMap.find(p => p.re.test(params.userMessage));
        if (hit) {
          const tool = findTool('find_nearby');
          if (tool) {
            onEvent?.({
              kind: 'tool_call',
              name: 'find_nearby',
              args: {category: hit.category},
            });
            try {
              const toolResult = await tool.handler(
                {category: hit.category},
                {
                  profile: params.profile,
                  activeContext: params.context,
                  liveLocation: params.liveLocation ?? null,
                },
              );
              onEvent?.({
                kind: 'tool_result',
                name: 'find_nearby',
                result: toolResult,
              });
              const pl = toolResult.payload as any;
              if (pl?.results?.length > 0) {
                const top = pl.results[0];
                yield `Found ${pl.results.length} nearby ${hit.label}. Closest is ${top.name} (~${top.distanceKm.toFixed(1)} km). I've placed pins on the map — open the Map tab to see them.`;
                return;
              }
              yield toolResult.summary;
              return;
            } catch (err) {
              console.warn('[aiAssistantService] fallback find_nearby failed:', err);
            }
          }
        }
      }

      yield fallbackResponse(params);
      return;
    }

    const messages = seedMessages(params, params.profile);
    const toolContext = {
      profile: params.profile,
      activeContext: params.context,
      liveLocation: params.liveLocation ?? null,
    };
    // Tools the model actually invoked this query — used to decide whether the
    // deterministic rescue needs to fire when the model ends on a speak turn.
    const calledTools = new Set<string>();

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

        // Rescue: the model chose to *narrate* a tool instead of emitting the
        // envelope (a known inconsistency — see detectForcedTool). If the user
        // clearly asked for evacuation/POI and the matching tool never ran,
        // run it deterministically so the route/pins still reach the map.
        const forced = detectForcedTool(params.userMessage);
        if (forced && !calledTools.has(forced.tool)) {
          const tool = findTool(forced.tool);
          if (tool) {
            onEvent?.({kind: 'tool_call', name: forced.tool, args: forced.args});
            let rescued: ToolResult;
            try {
              rescued = await tool.handler(forced.args, toolContext);
            } catch (err) {
              rescued = {
                summary: `Tool ${forced.tool} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
              };
            }
            onEvent?.({kind: 'tool_result', name: forced.tool, result: rescued});
            const note =
              forced.tool === 'route_to_nearest_evacuation'
                ? "\n\nI've drawn the route on the map — it's shown beside this chat."
                : `\n\nI've placed the nearby ${forced.label} as pins on the map beside this chat.`;
            yield note;
          }
        }
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
        // Gemma only knows user/assistant. Surface the unknown-tool error
        // as a user observation so role alternation stays valid.
        messages.push({
          role: 'user',
          content: `Tool result for ${action.name}:\n(unknown tool — no such handler registered)\n\nNow respond to my original request using this result.`,
        });
        continue;
      }
      calledTools.add(action.name);
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

      // Mirror the production loop documented in
      // notebooks/Likas_Sample_Prompts.ipynb (Section IX dispatch_loop):
      //   - The model's tool call is echoed back as the `assistant` turn.
      //   - The tool's textual `summary` comes back as a `user` turn with
      //     an explicit "Now respond..." nudge so the model knows the next
      //     valid envelope is a `speak`, not another tool call.
      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          action: 'tool',
          name: action.name,
          args: action.args,
        }),
      });
      messages.push({
        role: 'user',
        content: `Tool result for ${action.name}:\n${toolResult.summary}\n\nNow respond to my original request using this result.`,
      });
    }

    yield fallbackResponse(params);
  },
};

/**
 * Internal helpers exposed for unit tests only. Not part of the public API —
 * do not import this from product code.
 */
export const __testables = {
  parseAction,
  extractJsonObject,
  createSpeakStreamer,
  detectForcedTool,
  repairAssistantJson,
  extractToolArgs,
};
