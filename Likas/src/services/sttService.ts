// whisper.rn 0.5.x ships an "exports" map that omits the bare entry, so TS
// bundler resolution can't resolve `import 'whisper.rn'`. Metro resolves it
// fine at runtime via the top-level "react-native" field. We require() the
// value and treat the context as an opaque handle (typed locally) since the
// only methods we call are transcribeRealtime() and release().
import {assetManager} from './assetManager';

const whisperLib = require('whisper.rn');

type WhisperCtx = {
  transcribeRealtime: (opts: Record<string, unknown>) => Promise<{
    stop: () => Promise<void>;
    subscribe: (cb: (event: any) => void) => void;
  }>;
  release: () => Promise<void>;
};

type InitWhisperFn = (opts: {filePath: string}) => Promise<WhisperCtx>;

const initWhisper: InitWhisperFn = whisperLib.initWhisper;

const STT_MODEL_ASSET_ID = 'stt-whisper-small';

export class STTModelNotLoadedError extends Error {
  constructor() {
    super(
      'Speech-to-text model is not installed. Download it from Settings or sideload to /sdcard/likas/.',
    );
    this.name = 'STTModelNotLoadedError';
  }
}

type StopFn = () => Promise<string>;

let whisperContext: WhisperCtx | null = null;
let initPromise: Promise<WhisperCtx | null> | null = null;

const ensureContext = async (): Promise<WhisperCtx | null> => {
  if (whisperContext) return whisperContext;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const modelPath = await assetManager.getLocalPath(STT_MODEL_ASSET_ID);
    if (!modelPath) return null;
    try {
      const ctx = await initWhisper({filePath: modelPath});
      whisperContext = ctx;
      return ctx;
    } catch (err) {
      console.warn('[sttService] initWhisper failed:', err);
      return null;
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
};

export const sttService = {
  isReady: async (): Promise<boolean> => {
    if (whisperContext) return true;
    return assetManager.isInstalled(STT_MODEL_ASSET_ID);
  },

  initialize: async (): Promise<void> => {
    await ensureContext();
  },

  /**
   * Begin realtime mic capture + transcription. Returns a `stop` function that
   * resolves to the final transcribed text. Calls `onPartial(text)` with running
   * results while the user speaks. Throws STTModelNotLoadedError if the model
   * isn't installed.
   */
  startListening: async (
    onPartial?: (text: string) => void,
    options?: {language?: string; maxSeconds?: number},
  ): Promise<{stop: StopFn}> => {
    const ctx = await ensureContext();
    if (!ctx) throw new STTModelNotLoadedError();

    let finalText = '';
    let finished = false;
    let resolveStop: ((text: string) => void) | null = null;

    const session = await ctx.transcribeRealtime({
      language: options?.language ?? 'auto',
      realtimeAudioSec: options?.maxSeconds ?? 60,
      realtimeAudioSliceSec: 25,
    });

    session.subscribe((event: any) => {
      const text = event?.data?.result?.trim() ?? '';
      if (text && text !== finalText) {
        finalText = text;
        onPartial?.(text);
      }
      if (event?.isCapturing === false) {
        finished = true;
        if (resolveStop) {
          resolveStop(finalText);
          resolveStop = null;
        }
      }
    });

    return {
      stop: async () => {
        await session.stop();
        if (finished) return finalText;
        return new Promise<string>(resolve => {
          resolveStop = resolve;
          setTimeout(() => {
            if (resolveStop) {
              resolveStop(finalText);
              resolveStop = null;
            }
          }, 1500);
        });
      },
    };
  },

  release: async (): Promise<void> => {
    if (!whisperContext) return;
    try {
      await whisperContext.release();
    } finally {
      whisperContext = null;
    }
  },
};
