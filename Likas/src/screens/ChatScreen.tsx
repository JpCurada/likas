import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import {ScrollView as GestureScrollView} from 'react-native-gesture-handler';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {BottomSheetFlatList, BottomSheetTextInput} from '@gorhom/bottom-sheet';

import {COLORS, FONTS, SIZES} from '../theme';
import {Icon} from '../components/Icon';
import {AssetMissingPrompt} from '../components/AssetMissingPrompt';
import {useAppStore} from '../stores/appStore';
import {chatPromptChipsByContext} from '../data/seedData';
import {useAIAssistant} from '../hooks/useAIAssistant';
import type {ChatMessage, ToolTraceEntry} from '../types';
import {
  ChatMarkdownText,
  chatBubbleMarkdownStyles,
} from '../utils/simpleMarkdown';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TOOL_STATUS_LABEL: Record<string, string> = {
  route_to_nearest_evacuation: 'Looking up evacuation routes…',
  get_protocol: 'Checking official protocol…',
  find_nearby: 'Finding nearby places…',
  get_user_profile: 'Checking your profile…',
};

const TOOL_DONE_LABEL: Record<string, string> = {
  route_to_nearest_evacuation: 'Checked evacuation routes',
  get_protocol: 'Checked official protocol',
  find_nearby: 'Found nearby places',
  get_user_profile: 'Checked your profile',
};

const TOOL_ICON: Record<string, string> = {
  route_to_nearest_evacuation: 'map-marker-path',
  get_protocol: 'shield-check',
  find_nearby: 'map-search',
  get_user_profile: 'account-details',
};

const traceLabel = (entry: ToolTraceEntry): string => {
  if (entry.status === 'running')
    return TOOL_STATUS_LABEL[entry.name] ?? `Using ${entry.name}…`;
  if (entry.status === 'error')
    return `${TOOL_DONE_LABEL[entry.name] ?? entry.name} (failed)`;
  return TOOL_DONE_LABEL[entry.name] ?? entry.name;
};

const ToolTraceList: React.FC<{trace: ToolTraceEntry[]}> = ({trace}) => (
  <View style={styles.traceList}>
    {trace.map((entry, idx) => (
      <View
        key={`${entry.name}-${idx}`}
        style={[
          styles.traceChip,
          entry.status === 'error' && styles.traceChipError,
        ]}>
        {entry.status === 'running' ? (
          <ActivityIndicator size="small" color={COLORS.primaryGreen} />
        ) : (
          <Icon
            name={
              entry.status === 'error'
                ? 'alert-circle-outline'
                : TOOL_ICON[entry.name] ?? 'check-circle-outline'
            }
            size={14}
            color={
              entry.status === 'error' ? COLORS.error : COLORS.primaryGreen
            }
          />
        )}
        <Text style={styles.traceChipText}>{traceLabel(entry)}</Text>
      </View>
    ))}
  </View>
);

export const ChatScreen: React.FC<{onClose?: () => void, isBottomSheet?: boolean}> = ({onClose, isBottomSheet}) => {
  const navigation = useNavigation<any>();
  const activeContext = useAppStore(s => s.activeContext);
  const chatMessages = useAppStore(s => s.chatMessages);
  const addChatMessage = useAppStore(s => s.addChatMessage);
  const setActiveRoute = useAppStore(s => s.setActiveRoute);
  const setNearbyPins = useAppStore(s => s.setNearbyPins);
  const setPendingMapFocus = useAppStore(s => s.setPendingMapFocus);
  const {
    isReady,
    isInitializing,
    isProcessing,
    streamingText,
    activeToolName,
    toolTrace,
    error,
    send,
  } = useAIAssistant();

  const promptChips = useMemo(
    () => chatPromptChipsByContext[activeContext],
    [activeContext],
  );

  const [input, setInput] = useState('');
  // Holds either a FlatList or a BottomSheetFlatList depending on `isBottomSheet`.
  // Both expose scrollToEnd, but the concrete type differs — keep it loose so
  // the auto-scroll fires in the bottom-sheet (split-screen) case too.
  const listRef = useRef<any>(null);

  useEffect(() => {
    // Defer to the next frame so the freshly appended/streamed text is laid
    // out before we scroll — otherwise scrollToEnd lands short inside the sheet.
    const id = setTimeout(() => {
      listRef.current?.scrollToEnd?.({animated: true});
    }, 0);
    return () => clearTimeout(id);
  }, [chatMessages, streamingText]);

  const handleSend = useCallback(async (forcedText?: string) => {
    const textToSend = typeof forcedText === 'string' ? forcedText : input;
    const trimmed = textToSend.trim();
    if (!trimmed || isProcessing) return;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      text: trimmed,
    };
    addChatMessage(userMsg);
    if (typeof forcedText !== 'string') {
      setInput('');
    }

    // History must be prior turns only. `aiAssistantService.seedMessages` always
    // appends `params.userMessage` as the final user message — including the
    // current message here too creates two consecutive `user` roles, which
    // breaks llama.rn's Gemma Jinja formatter ("roles must alternate") and
    // can yield empty / invalid completions.
    const historyForCall = chatMessages;
    try {
      const reply = await send(trimmed, {
        context: activeContext,
        history: historyForCall,
      });
      addChatMessage({
        id: makeId(),
        role: 'assistant',
        text: reply.text.trim() || 'No response.',
        attachment: reply.attachment ?? undefined,
        toolTrace: reply.toolTrace.length > 0 ? reply.toolTrace : undefined,
      });
    } catch {
      // useAIAssistant already exposes the error via state; surface inline.
    }
  }, [input, isProcessing, addChatMessage, chatMessages, activeContext, send]);

  const openRouteOnMap = useCallback(
    (msg: ChatMessage) => {
      if (msg.attachment?.kind !== 'route') return;
      const a = msg.attachment;
      // Always publish a fresh object so the route useEffect re-runs even if
      // an identical route is already on-screen — keeps "Show" working a
      // second time and after the chat sheet collapses.
      setActiveRoute({
        destinationName: a.destinationName,
        destination: a.destination,
        polyline: [...a.polyline],
        distanceMeters: a.distanceMeters,
        durationMinutesWalking: a.durationMinutesWalking,
      });
      setPendingMapFocus('route');
      if (onClose) {
        onClose();
      } else {
        navigation.navigate('Main', {screen: 'Map'});
      }
    },
    [navigation, setActiveRoute, setPendingMapFocus, onClose],
  );

  const openNearbyOnMap = useCallback(
    (msg: ChatMessage) => {
      if (msg.attachment?.kind !== 'nearby') return;
      // Clone the array so Zustand publishes a NEW reference even if the
      // same pins are already staged — that way `fitBounds` re-runs and the
      // camera actually flies to them when the user taps Show a second time
      // or after collapsing the chat sheet.
      setNearbyPins([...msg.attachment.pins]);
      setPendingMapFocus('nearby');
      if (onClose) {
        onClose();
      } else {
        navigation.navigate('Main', {screen: 'Map'});
      }
    },
    [navigation, setNearbyPins, setPendingMapFocus, onClose],
  );

  if (!isReady && !isInitializing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={24} color={COLORS.darkGreen} />
          </TouchableOpacity>
        )}
        <AssetMissingPrompt
          iconName="robot-outline"
          title="AI assistant not installed"
          body="Download the offline AI guide to get conversational disaster help. The rest of the app still works without it."
          ctaLabel="Download AI"
        />
      </SafeAreaView>
    );
  }

  const assistantMdProps = chatBubbleMarkdownStyles(
    StyleSheet.flatten(styles.bubbleTextAssistant) as TextStyle,
    {isUserBubble: false},
  );
  const userMdProps = chatBubbleMarkdownStyles(
    StyleSheet.flatten(styles.bubbleTextUser) as TextStyle,
    {isUserBubble: true},
  );

  const renderItem = ({item}: {item: ChatMessage}) => {
    const isUser = item.role === 'user';
    const attachment = item.attachment;
    return (
      <View style={styles.messageGroup}>
        {!isUser && item.toolTrace && item.toolTrace.length > 0 ? (
          <ToolTraceList trace={item.toolTrace} />
        ) : null}
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}>
          <ChatMarkdownText
            text={item.text}
            baseStyle={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}
            {...(isUser ? userMdProps : assistantMdProps)}
          />
        </View>
        {attachment?.kind === 'route' ? (
          <TouchableOpacity
            style={styles.routeCard}
            onPress={() => openRouteOnMap(item)}
            activeOpacity={0.85}>
            <Icon name="map-marker-path" size={22} color={COLORS.primaryGreen} />
            <View style={styles.routeCardBody}>
              <Text style={styles.routeCardTitle}>
                Route to {attachment.destinationName}
              </Text>
              <Text style={styles.routeCardSub}>
                {(attachment.distanceMeters / 1000).toFixed(2)} km · ~
                {attachment.durationMinutesWalking} min walking
              </Text>
            </View>
            <Text style={styles.routeCardCta}>View on map</Text>
          </TouchableOpacity>
        ) : null}
        {attachment?.kind === 'nearby' ? (
          <TouchableOpacity
            style={styles.routeCard}
            onPress={() => openNearbyOnMap(item)}
            activeOpacity={0.85}>
            <Icon name="map-marker-multiple" size={22} color={COLORS.primaryGreen} />
            <View style={styles.routeCardBody}>
              <Text style={styles.routeCardTitle}>
                {attachment.pins.length} nearby {attachment.label}
              </Text>
              <Text style={styles.routeCardSub}>
                Tap to view locations on map
              </Text>
            </View>
            <Text style={styles.routeCardCta}>Show</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const ListComponent = (isBottomSheet ? BottomSheetFlatList : FlatList) as any;
  const InputComponent = (isBottomSheet ? BottomSheetTextInput : TextInput) as any;

  return (
    <SafeAreaView style={styles.safe} edges={isBottomSheet ? [] : ['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!isBottomSheet && (
          <View style={styles.header}>
            <Icon name="robot" size={22} color={COLORS.primaryGreen} />
            <Text style={styles.headerTitle}>Disaster Guide</Text>
            {isInitializing ? (
              <ActivityIndicator size="small" color={COLORS.primaryGreen} />
            ) : null}
            {onClose && (
              <TouchableOpacity onPress={onClose} style={styles.closeBtnHeader}>
                <Icon name="close" size={24} color={COLORS.darkGreen} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <ListComponent
          ref={listRef}
          data={chatMessages}
          keyExtractor={(item: ChatMessage) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <>
              {isProcessing && toolTrace.length > 0 ? (
                <ToolTraceList trace={toolTrace} />
              ) : null}
              {isProcessing && streamingText ? (
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                <ChatMarkdownText
                  text={streamingText}
                  baseStyle={styles.bubbleTextAssistant}
                  {...assistantMdProps}
                />
                </View>
              ) : null}
              {isProcessing && !streamingText ? (
                <View style={[styles.bubble, styles.bubbleAssistant, styles.thinkingBubble]}>
                  <ActivityIndicator size="small" color={COLORS.primaryGreen} />
                  <Text style={styles.thinkingText}>
                    {activeToolName
                      ? TOOL_STATUS_LABEL[activeToolName] ?? `Using ${activeToolName}…`
                      : 'Thinking…'}
                  </Text>
                </View>
              ) : null}
              {error ? (
                <View style={styles.errorBubble}>
                  <Icon name="alert-circle" size={16} color={COLORS.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </>
          }
        />

        {/* Contextual quick-prompt chips (label on chip, full `prompt` sent on tap) */}
        {!isProcessing ? (
          <View
            style={[
              styles.suggestionsContainer,
              chatMessages.length > 0 && styles.suggestionsContainerInline,
            ]}>
            <GestureScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              style={styles.suggestionsScrollView}
              contentContainerStyle={styles.suggestionsScrollContent}
              keyboardShouldPersistTaps="always">
              {promptChips.map((chip, index) => (
                <TouchableOpacity
                  key={`${activeContext}-${index}-${chip.label}`}
                  style={styles.suggestionChip}
                  onPress={() => handleSend(chip.prompt)}
                  activeOpacity={0.7}>
                  <Text style={styles.suggestionChipText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </GestureScrollView>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <InputComponent
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about evacuation, first aid, protocols…"
            placeholderTextColor={COLORS.gray}
            editable={!isProcessing}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!input.trim() || isProcessing) && styles.sendButtonDisabled,
            ]}
            onPress={() => void handleSend()}
            disabled={!input.trim() || isProcessing}>
            <Icon name="send" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#f0fdf4'},
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    padding: 8,
  },
  closeBtnHeader: {
    padding: 4,
  },
  list: {
    padding: SIZES.padding,
    gap: 10,
  },
  messageGroup: {
    gap: 6,
    width: '100%',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  routeCard: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
  },
  routeCardBody: {
    flexShrink: 1,
  },
  routeCardTitle: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  routeCardSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginTop: 2,
  },
  routeCardCta: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
    marginLeft: 6,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primaryGreen,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  bubbleTextUser: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.white,
    lineHeight: 22,
  },
  bubbleTextAssistant: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
    lineHeight: 22,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  traceList: {
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 2,
  },
  traceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lightGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    maxWidth: '85%',
  },
  traceChipError: {
    backgroundColor: '#fee2e2',
  },
  traceChipText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    flexShrink: 1,
  },
  thinkingText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.gray,
  },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  errorText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.error,
    flexShrink: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SIZES.padding,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#f1f5f9',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    lineHeight: 20,
    color: COLORS.darkGreen,
    ...(Platform.OS === 'android'
      ? {includeFontPadding: false, textAlignVertical: 'center' as const}
      : null),
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray,
    opacity: 0.5,
  },
  suggestionsContainer: {
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
  },
  suggestionsContainerInline: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  suggestionsScrollView: {
    flexGrow: 0,
  },
  suggestionsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    gap: 8,
    paddingRight: SIZES.padding + 8,
  },
  suggestionChip: {
    flexShrink: 0,
    backgroundColor: COLORS.lightGreen,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 179, 114, 0.2)',
  },
  suggestionChipText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
});

export default ChatScreen;
