import {useCallback, useEffect, useRef, useState} from 'react';

import {
  AssistantEvent,
  BatteryTooLowError,
  ModelNotLoadedError,
  aiAssistantService,
} from '../services/aiAssistantService';
import {evacuationService} from '../services/evacuationService';
import {useAppStore} from '../stores/appStore';
import type {ChatMessage, ChatMessageAttachment, DisasterContext} from '../types';

export type SendResult = {
  text: string;
  attachment: ChatMessageAttachment | null;
};

type SendOptions = {
  context: DisasterContext;
  history: ChatMessage[];
};

type State = {
  isReady: boolean;
  isInitializing: boolean;
  isProcessing: boolean;
  streamingText: string;
  activeToolName: string | null;
  error: string | null;
};

export const useAIAssistant = () => {
  const profile = useAppStore(s => s.profile);
  const [state, setState] = useState<State>({
    isReady: false,
    isInitializing: true,
    isProcessing: false,
    streamingText: '',
    activeToolName: null,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const ready = await aiAssistantService.isReady();
      if (!mountedRef.current || cancelled) return;
      setState(s => ({...s, isReady: ready, isInitializing: !ready ? false : true}));
      if (ready) {
        await aiAssistantService.initialize();
        if (!mountedRef.current || cancelled) return;
        setState(s => ({...s, isInitializing: false}));
      }
    })();
    return () => {
      mountedRef.current = false;
      cancelled = true;
    };
  }, []);

  const send = useCallback(
    async (
      userMessage: string,
      opts: SendOptions,
      onChunk?: (text: string) => void,
    ): Promise<SendResult> => {
      setState(s => ({
        ...s,
        isProcessing: true,
        streamingText: '',
        activeToolName: null,
        error: null,
      }));

      const nearestCenters = evacuationService.getRankedCenters({
        origin: profile.location.coordinates,
        profile,
      });

      let full = '';
      let attachment: ChatMessageAttachment | null = null;
      try {
        const handleEvent = (ev: AssistantEvent) => {
          if (!mountedRef.current) return;
          if (ev.kind === 'tool_call') {
            setState(s => ({...s, activeToolName: ev.name}));
          } else if (ev.kind === 'tool_result') {
            setState(s => ({...s, activeToolName: null}));
            const payload = ev.result.payload as any;
            if (payload?.kind === 'evacuation_ranking' && payload.route) {
              attachment = {kind: 'route', ...payload.route};
            }
          }
        };
        const stream = aiAssistantService.query(
          {
            userMessage,
            context: opts.context,
            conversationHistory: opts.history,
            profile,
            nearestCenters,
          },
          handleEvent,
        );
        for await (const chunk of stream) {
          full += chunk;
          if (!mountedRef.current) break;
          setState(s => ({...s, streamingText: full}));
          onChunk?.(chunk);
        }
        return {text: full, attachment};
      } catch (err) {
        let message = 'Generation failed. Please try again.';
        if (err instanceof BatteryTooLowError) {
          message =
            'Battery is low. The AI is paused to preserve power — using offline guidance instead.';
        } else if (err instanceof ModelNotLoadedError) {
          message = err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        if (mountedRef.current) {
          setState(s => ({...s, error: message}));
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setState(s => ({...s, isProcessing: false, activeToolName: null}));
        }
      }
    },
    [profile],
  );

  return {
    ...state,
    send,
  };
};
