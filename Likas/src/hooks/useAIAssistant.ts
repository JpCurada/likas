import {useCallback, useEffect, useRef, useState} from 'react';

import {
  AssistantEvent,
  BatteryTooLowError,
  ModelNotLoadedError,
  aiAssistantService,
} from '../services/aiAssistantService';
import {evacuationService} from '../services/evacuationService';
import {useAppStore} from '../stores/appStore';
import type {
  ChatMessage,
  ChatMessageAttachment,
  DisasterContext,
  ToolTraceEntry,
} from '../types';

export type SendResult = {
  text: string;
  attachment: ChatMessageAttachment | null;
  toolTrace: ToolTraceEntry[];
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
  toolTrace: ToolTraceEntry[];
  error: string | null;
};

export const useAIAssistant = () => {
  const profile = useAppStore(s => s.profile);
  const liveLocation = useAppStore(s => s.liveLocation);
  const setActiveRoute = useAppStore(s => s.setActiveRoute);
  const setNearbyPins = useAppStore(s => s.setNearbyPins);
  const setPendingMapFocus = useAppStore(s => s.setPendingMapFocus);
  const [state, setState] = useState<State>({
    isReady: false,
    isInitializing: true,
    isProcessing: false,
    streamingText: '',
    activeToolName: null,
    toolTrace: [],
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const ready = await aiAssistantService.isReady();
      console.log(`[AI Hook] LLM Asset Installed: ${ready}`);
      if (!mountedRef.current || cancelled) return;
      setState(s => ({...s, isReady: ready, isInitializing: !ready ? false : true}));
      if (ready) {
        console.log('[AI Hook] Starting LLM Initialization...');
        await aiAssistantService.initialize();
        if (!mountedRef.current || cancelled) return;
        const finalReady = await aiAssistantService.isReady();
        console.log(`[AI Hook] LLM Initialization finished. Ready: ${finalReady}`);
        setState(s => ({...s, isInitializing: false}));
      } else {
        console.log('[AI Hook] LLM not installed. AI will run in Smart Fallback mode.');
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
        toolTrace: [],
        error: null,
      }));

      // Prefer the user's live GPS position so "nearest X" is ranked from
      // where they actually are, not from the address they registered
      // during onboarding. Falls back to the profile coordinates while
      // the GPS watcher is still warming up (or if permission was denied).
      const origin = liveLocation ?? profile.location.coordinates;
      const nearestCenters = evacuationService.getRankedCenters({
        origin,
        profile,
      });

      let full = '';
      let attachment: ChatMessageAttachment | null = null;
      const trace: ToolTraceEntry[] = [];
      try {
        const handleEvent = (ev: AssistantEvent) => {
          if (!mountedRef.current) return;
          if (ev.kind === 'tool_call') {
            trace.push({name: ev.name, status: 'running'});
            setState(s => ({
              ...s,
              activeToolName: ev.name,
              toolTrace: [...trace],
            }));
          } else if (ev.kind === 'tool_result') {
            const last = trace[trace.length - 1];
            if (last && last.name === ev.name) last.status = 'done';
            setState(s => ({
              ...s,
              activeToolName: null,
              toolTrace: [...trace],
            }));
            const payload = ev.result.payload as any;
            if (payload?.kind === 'evacuation_ranking' && payload.route) {
              attachment = {kind: 'route', ...payload.route};
              // Pre-stage the route on the map store so the moment the user
              // navigates to the Map tab the polyline is already drawn — they
              // don't need to tap the chat card first.
              setActiveRoute({
                destinationName: payload.route.destinationName,
                destination: payload.route.destination,
                polyline: payload.route.polyline,
                distanceMeters: payload.route.distanceMeters,
                durationMinutesWalking: payload.route.durationMinutesWalking,
              });
              // Ask the map to present itself (chat sheet snaps to half) so the
              // route is visible the instant it's computed.
              setPendingMapFocus('route');
            } else if (payload?.kind === 'nearby' && payload.results.length > 0) {
              attachment = {
                kind: 'nearby',
                category: payload.category,
                label: payload.category.replace('_', ' '),
                pins: payload.results,
              };
              // Pre-stage pins on the map so they appear immediately when the
              // user switches to the Map tab.
              setNearbyPins(payload.results);
              setPendingMapFocus('nearby');
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
            liveLocation,
          },
          handleEvent,
        );
        for await (const chunk of stream) {
          full += chunk;
          if (!mountedRef.current) break;
          setState(s => ({...s, streamingText: full}));
          onChunk?.(chunk);
        }
        return {text: full, attachment, toolTrace: trace};
      } catch (err) {
        const last = trace[trace.length - 1];
        if (last && last.status === 'running') last.status = 'error';
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
          setState(s => ({...s, error: message, toolTrace: [...trace]}));
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setState(s => ({...s, isProcessing: false, activeToolName: null}));
        }
      }
    },
    [profile, liveLocation, setActiveRoute, setNearbyPins, setPendingMapFocus],
  );

  return {
    ...state,
    send,
  };
};
