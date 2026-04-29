import React, {useMemo, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {firstAidTopics, prepChecklist} from './src/data/seedData';
import {aiAssistantService} from './src/services/aiAssistantService';
import {emergencyService, formatSOSMessage} from './src/services/emergencyService';
import {evacuationService} from './src/services/evacuationService';
import {defaultProfile, useAppStore} from './src/stores/appStore';
import {colors, spacing} from './src/theme';
import type {DisasterContext, UserProfile} from './src/types';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const hasCompletedOnboarding = useAppStore(
    state => state.hasCompletedOnboarding,
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={[styles.appShell, {paddingTop: safeAreaInsets.top + 12}]}>
        {hasCompletedOnboarding ? <Dashboard /> : <Onboarding />}
      </View>
    </KeyboardAvoidingView>
  );
}

function Onboarding() {
  const updateProfile = useAppStore(state => state.updateProfile);
  const completeOnboarding = useAppStore(state => state.completeOnboarding);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(defaultProfile);

  const setDependents = (
    key: keyof UserProfile['dependents'],
    value: number | boolean | string,
  ) => {
    setDraft(current => ({
      ...current,
      dependents: {...current.dependents, [key]: value},
    }));
  };

  const save = () => {
    updateProfile(draft);
    completeOnboarding();
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.eyebrow}>Offline-first disaster companion</Text>
      <Text style={styles.title}>Set up LIKAS</Text>
      <Text style={styles.body}>
        Five quick steps help LIKAS tailor evacuation, first aid, and emergency
        SMS guidance while keeping data local to this device.
      </Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {width: `${((step + 1) / 5) * 100}%`}]} />
      </View>

      {step === 0 && (
        <Card title="1. Identity">
          <Field
            label="Name"
            value={draft.name}
            onChangeText={name => setDraft(current => ({...current, name}))}
            placeholder="Juan Dela Cruz"
          />
          <Text style={styles.label}>Age Group</Text>
          <View style={styles.rowWrap}>
            {(['minor', 'adult', 'senior'] as const).map(ageGroup => (
              <Chip
                key={ageGroup}
                label={ageGroup.toUpperCase()}
                selected={draft.ageGroup === ageGroup}
                onPress={() => setDraft(current => ({...current, ageGroup}))}
              />
            ))}
          </View>
        </Card>
      )}

      {step === 1 && (
        <Card title="2. Dependents">
          <Counter
            label="Infants"
            value={draft.dependents.infants}
            onChange={value => setDependents('infants', value)}
          />
          <Counter
            label="Children"
            value={draft.dependents.children}
            onChange={value => setDependents('children', value)}
          />
          <Counter
            label="Elderly"
            value={draft.dependents.elderly}
            onChange={value => setDependents('elderly', value)}
          />
          <Counter
            label="PWD / Mobility needs"
            value={draft.dependents.pwd}
            onChange={value => setDependents('pwd', value)}
          />
          <Chip
            label="Household has pets"
            selected={draft.dependents.hasPets}
            onPress={() =>
              setDependents('hasPets', !draft.dependents.hasPets)
            }
          />
          {draft.dependents.hasPets && (
            <Field
              label="Pet details"
              value={draft.dependents.petDetails}
              onChangeText={petDetails =>
                setDependents('petDetails', petDetails)
              }
              placeholder="2 dogs, 1 cat"
            />
          )}
        </Card>
      )}

      {step === 2 && (
        <Card title="3. Health">
          <Text style={styles.body}>
            Select conditions LIKAS should consider for first aid and evacuation
            advice.
          </Text>
          <View style={styles.rowWrap}>
            {['Asthma', 'Diabetes', 'Hypertension', 'Pregnancy'].map(
              condition => (
                <Chip
                  key={condition}
                  label={condition}
                  selected={draft.healthConditions.includes(condition)}
                  onPress={() =>
                    setDraft(current => ({
                      ...current,
                      healthConditions: current.healthConditions.includes(
                        condition,
                      )
                        ? current.healthConditions.filter(
                            item => item !== condition,
                          )
                        : [...current.healthConditions, condition],
                    }))
                  }
                />
              ),
            )}
          </View>
        </Card>
      )}

      {step === 3 && (
        <Card title="4. Location and Meeting Points">
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Skipping location is allowed, but route accuracy depends on it.
            </Text>
          </View>
          <Field
            label="City"
            value={draft.location.city}
            onChangeText={city =>
              setDraft(current => ({
                ...current,
                location: {...current.location, city},
              }))
            }
            placeholder="Manila"
          />
          <Field
            label="Barangay"
            value={draft.location.barangay}
            onChangeText={barangay =>
              setDraft(current => ({
                ...current,
                location: {...current.location, barangay},
              }))
            }
            placeholder="Ermita"
          />
          <Field
            label="Primary meeting place"
            value={draft.meetingPoints.primary}
            onChangeText={primary =>
              setDraft(current => ({
                ...current,
                meetingPoints: {...current.meetingPoints, primary},
              }))
            }
            placeholder="Barangay hall"
          />
          <Field
            label="Secondary meeting place"
            value={draft.meetingPoints.secondary}
            onChangeText={secondary =>
              setDraft(current => ({
                ...current,
                meetingPoints: {...current.meetingPoints, secondary},
              }))
            }
            placeholder="School gate"
          />
        </Card>
      )}

      {step === 4 && (
        <Card title="5. Emergency Contacts">
          {draft.emergencyContacts.map((contact, index) => (
            <View key={contact.id} style={styles.contactBlock}>
              <Field
                label={`Contact ${index + 1} name`}
                value={contact.name}
                onChangeText={name =>
                  setDraft(current => ({
                    ...current,
                    emergencyContacts: current.emergencyContacts.map(item =>
                      item.id === contact.id ? {...item, name} : item,
                    ),
                  }))
                }
                placeholder="Name"
              />
              <Field
                label={`Contact ${index + 1} phone`}
                value={contact.phone}
                keyboardType="phone-pad"
                onChangeText={phone =>
                  setDraft(current => ({
                    ...current,
                    emergencyContacts: current.emergencyContacts.map(item =>
                      item.id === contact.id ? {...item, phone} : item,
                    ),
                  }))
                }
                placeholder="+63..."
              />
            </View>
          ))}
        </Card>
      )}

      <View style={styles.footerActions}>
        <Pressable
          accessibilityRole="button"
          disabled={step === 0}
          onPress={() => setStep(current => Math.max(0, current - 1))}
          style={[styles.secondaryButton, step === 0 && styles.disabledButton]}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => (step === 4 ? save() : setStep(step + 1))}
          style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {step === 4 ? 'Finish Setup' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Dashboard() {
  const profile = useAppStore(state => state.profile);
  const activeContext = useAppStore(state => state.activeContext);
  const setActiveContext = useAppStore(state => state.setActiveContext);
  const [activeTab, setActiveTab] = useState<
    'assistant' | 'evacuation' | 'prep' | 'profile'
  >('assistant');

  const rankings = useMemo(
    () =>
      evacuationService.getRankedCenters({
        origin: profile.location.coordinates,
        profile,
        type: activeContext === 'volcano' ? 'volcano' : 'typhoon',
      }),
    [activeContext, profile],
  );

  const triggerSOS = async () => {
    const message = formatSOSMessage({
      location: profile.location.coordinates,
      profile,
      disasterContext: activeContext,
    });

    try {
      await emergencyService.triggerSOS({
        location: profile.location.coordinates,
        profile,
        disasterContext: activeContext,
      });
    } catch {
      Alert.alert('SOS message ready', message);
    }
  };

  const chooseContext = (context: DisasterContext) => {
    setActiveContext(context);
    setActiveTab('assistant');
  };

  return (
    <View style={styles.dashboard}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusHeader}>
          <View>
            <Text style={styles.eyebrow}>Offline mode active</Text>
            <Text style={styles.headerTitle}>
              {profile.location.barangay}, {profile.location.city}
            </Text>
          </View>
          <Text style={styles.battery}>Battery 82%</Text>
        </View>

        <View style={styles.bigButtonGrid}>
          <BigContextButton
            title="EARTHQUAKE"
            subtitle="Drop, cover, hold"
            tone="alert"
            onPress={() => chooseContext('earthquake')}
          />
          <BigContextButton
            title="TYPHOON"
            subtitle="Flood and evacuation"
            tone="primary"
            onPress={() => chooseContext('typhoon')}
          />
        </View>

        <View style={styles.rowWrap}>
          <Chip
            label="Volcano"
            selected={activeContext === 'volcano'}
            onPress={() => chooseContext('volcano')}
          />
          <Chip
            label="Prep Zone"
            selected={activeContext === 'prep'}
            onPress={() => chooseContext('prep')}
          />
        </View>

        <View style={styles.tabBar}>
          {(['assistant', 'evacuation', 'prep', 'profile'] as const).map(tab => (
            <Pressable
              accessibilityRole="button"
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.activeTab]}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeTabText,
                ]}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'assistant' && <AssistantPanel rankings={rankings} />}
        {activeTab === 'evacuation' && <EvacuationPanel rankings={rankings} />}
        {activeTab === 'prep' && <PrepPanel />}
        {activeTab === 'profile' && <ProfilePanel />}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={triggerSOS}
        style={styles.sosButton}>
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>
    </View>
  );
}

function AssistantPanel({
  rankings,
}: {
  rankings: ReturnType<typeof evacuationService.getRankedCenters>;
}) {
  const activeContext = useAppStore(state => state.activeContext);
  const chatMessages = useAppStore(state => state.chatMessages);
  const addChatMessage = useAppStore(state => state.addChatMessage);
  const [message, setMessage] = useState('');
  const chips = aiAssistantService.getContextualChips(activeContext);

  const submitMessage = (text: string) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      text: trimmed,
    };
    const assistantMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant' as const,
      text: aiAssistantService.createOfflineResponse({
        userMessage: trimmed,
        context: activeContext,
        nearestCenters: rankings,
        conversationHistory: chatMessages,
      }),
    };

    addChatMessage(userMessage);
    addChatMessage(assistantMessage);
    setMessage('');
  };

  return (
    <Card title="Always-On AI Assistant">
      <View style={styles.immediateAction}>
        <Text style={styles.immediateLabel}>First step</Text>
        <Text style={styles.immediateText}>
          {aiAssistantService.getImmediateAction(activeContext)}
        </Text>
      </View>
      <View style={styles.rowWrap}>
        {chips.map(chip => (
          <Chip
            key={chip}
            label={chip}
            selected={false}
            onPress={() => submitMessage(chip)}
          />
        ))}
      </View>
      <View style={styles.chatList}>
        {chatMessages.slice(-5).map(chat => (
          <View
            key={chat.id}
            style={[
              styles.chatBubble,
              chat.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}>
            <Text style={styles.chatRole}>
              {chat.role === 'user' ? 'You' : 'LIKAS'}
            </Text>
            <Text style={styles.chatText}>{chat.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Ask LIKAS"
          value={message}
          onChangeText={setMessage}
          placeholder="Ask about evacuation or first aid"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => submitMessage(message)}
          style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function EvacuationPanel({
  rankings,
}: {
  rankings: ReturnType<typeof evacuationService.getRankedCenters>;
}) {
  const profile = useAppStore(state => state.profile);

  return (
    <Card title="Go-To Evacuation Routes">
      <Text style={styles.body}>
        Top local options are ranked by distance, capacity, PWD/elderly access,
        and pet support. Offline MapLibre tiles and pedestrian routing will plug
        into this list next.
      </Text>
      {rankings.map(ranking => (
        <View key={ranking.center.id} style={styles.centerCard}>
          <View style={styles.centerHeader}>
            <Text style={styles.centerName}>{ranking.center.name}</Text>
            {ranking.isBestMatch && (
              <Text style={styles.bestMatch}>Best Match</Text>
            )}
          </View>
          <Text style={styles.body}>{ranking.center.address}</Text>
          <Text style={styles.meta}>
            {ranking.distanceKm.toFixed(1)} km · {ranking.estimatedWalkMinutes}{' '}
            min walk · Capacity {ranking.center.capacity}
          </Text>
          <Text style={styles.meta}>
            {ranking.center.facilityType} · PWD{' '}
            {ranking.center.isPwdFriendly ? 'yes' : 'no'} · Pets{' '}
            {ranking.center.isPetFriendly ? 'yes' : 'no'}
          </Text>
          {ranking.warnings.map(warning => (
            <Text key={warning} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      ))}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Meeting points: {profile.meetingPoints.primary || 'Primary not set'} /{' '}
          {profile.meetingPoints.secondary || 'Secondary not set'}
        </Text>
      </View>
    </Card>
  );
}

function PrepPanel() {
  const profile = useAppStore(state => state.profile);
  const packedItems = useAppStore(state => state.packedItems);
  const togglePackedItem = useAppStore(state => state.togglePackedItem);
  const requiredItems = prepChecklist.filter(item => {
    if (!item.requiredFor) {
      return true;
    }

    return item.requiredFor.some(requirement => {
      if (requirement === 'infants') {
        return profile.dependents.infants > 0;
      }

      if (requirement === 'elderly') {
        return profile.dependents.elderly > 0;
      }

      if (requirement === 'pwd') {
        return profile.dependents.pwd > 0;
      }

      return profile.dependents.hasPets;
    });
  });
  const packedCount = requiredItems.filter(item => packedItems[item.id]).length;
  const completion = requiredItems.length
    ? Math.round((packedCount / requiredItems.length) * 100)
    : 0;

  return (
    <Card title="Prep Zone">
      <Text style={styles.progressText}>Go-Bag: {completion}% complete</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {width: `${completion}%`}]} />
      </View>
      {requiredItems.map(item => (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{checked: !!packedItems[item.id]}}
          key={item.id}
          onPress={() => togglePackedItem(item.id)}
          style={styles.checklistRow}>
          <Text style={styles.checkbox}>
            {packedItems[item.id] ? '[x]' : '[ ]'}
          </Text>
          <Text style={styles.checklistText}>{item.label}</Text>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>First-Aid Library</Text>
      {firstAidTopics.map(topic => (
        <View key={topic.id} style={styles.firstAidCard}>
          <Text style={styles.centerName}>{topic.title}</Text>
          <Text style={styles.meta}>Authority: {topic.authority}</Text>
          {topic.steps.map((step, index) => (
            <Text key={step} style={styles.body}>
              {index + 1}. {step}
            </Text>
          ))}
        </View>
      ))}
    </Card>
  );
}

function ProfilePanel() {
  const profile = useAppStore(state => state.profile);

  return (
    <Card title="Settings and Profile">
      <Text style={styles.sectionTitle}>{profile.name || 'LIKAS User'}</Text>
      <Text style={styles.body}>
        Household: {profile.dependents.infants} infants,{' '}
        {profile.dependents.children} children, {profile.dependents.elderly}{' '}
        elderly, {profile.dependents.pwd} PWD/mobility needs.
      </Text>
      <Text style={styles.body}>
        Health: {profile.healthConditions.join(', ') || 'None selected'}
      </Text>
      <Text style={styles.body}>
        Emergency contacts:{' '}
        {profile.emergencyContacts.filter(contact => contact.phone).length} saved
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Next setup step: persist this profile in SQLite and expose edit screens.
        </Text>
      </View>
    </Card>
  );
}

function BigContextButton({
  title,
  subtitle,
  tone,
  onPress,
}: {
  title: string;
  subtitle: string;
  tone: 'alert' | 'primary';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.bigButton,
        tone === 'alert' ? styles.alertButton : styles.primaryBigButton,
      ]}>
      <Text style={styles.bigButtonText}>{title}</Text>
      <Text style={styles.bigButtonSubtext}>{subtitle}</Text>
    </Pressable>
  );
}

function Card({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  placeholder,
  keyboardType,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad';
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.textInput}
      />
    </View>
  );
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.counterRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.counterControls}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(Math.max(0, value - 1))}
          style={styles.counterButton}>
          <Text style={styles.counterText}>-</Text>
        </Pressable>
        <Text style={styles.counterValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(value + 1)}
          style={styles.counterButton}>
          <Text style={styles.counterText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected && styles.selectedChip]}>
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appShell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dashboard: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 112,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm,
  },
  statusHeader: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  battery: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '800',
  },
  bigButtonGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  bigButton: {
    borderRadius: 24,
    flex: 1,
    minHeight: 128,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  alertButton: {
    backgroundColor: colors.alert,
  },
  primaryBigButton: {
    backgroundColor: colors.primary,
  },
  bigButtonText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  bigButtonSubtext: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  tabBar: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 18,
    flexDirection: 'row',
    marginVertical: spacing.lg,
    padding: spacing.xs,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    padding: spacing.sm,
  },
  activeTab: {
    backgroundColor: colors.primaryDark,
  },
  tabText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  activeTabText: {
    color: colors.white,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  field: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  textInput: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    padding: spacing.md,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
  },
  selectedChipText: {
    color: colors.white,
  },
  progressTrack: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 999,
    height: 12,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: '100%',
  },
  progressText: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    flex: 1,
    padding: spacing.lg,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderRadius: 18,
    flex: 1,
    padding: spacing.lg,
  },
  disabledButton: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  counterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  counterControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  counterButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  counterText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '900',
  },
  counterValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    minWidth: 24,
    textAlign: 'center',
  },
  contactBlock: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  notice: {
    backgroundColor: '#FFF3D6',
    borderColor: '#F1B84B',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  immediateAction: {
    backgroundColor: colors.alert,
    borderRadius: 20,
    padding: spacing.lg,
  },
  immediateLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    opacity: 0.85,
    textTransform: 'uppercase',
  },
  immediateText: {
    color: colors.white,
    fontSize: 25,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  chatList: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chatBubble: {
    borderRadius: 18,
    padding: spacing.md,
  },
  userBubble: {
    backgroundColor: colors.surfaceStrong,
  },
  assistantBubble: {
    backgroundColor: '#E0F2E9',
  },
  chatRole: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  chatText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    padding: spacing.md,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sendText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  centerCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  centerHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  centerName: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  bestMatch: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  warningText: {
    color: colors.warning,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  checklistRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  checklistText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: spacing.lg,
  },
  firstAidCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  sosButton: {
    alignItems: 'center',
    backgroundColor: colors.alert,
    borderRadius: 999,
    bottom: spacing.xl,
    elevation: 6,
    height: 78,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xl,
    shadowColor: '#000',
    shadowOffset: {height: 4, width: 0},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    width: 78,
  },
  sosText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
});

export default App;
