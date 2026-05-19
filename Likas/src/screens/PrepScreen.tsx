import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from '../components/Icon';
import { loadPrepChecklist, savePrepChecklist } from '../database/storage';
import { EARTHQUAKE_STEPS, TYPHOON_STEPS } from '../data/disasterSteps';

// ─── Data ─────────────────────────────────────────────────────────────────────

interface CheckItem {
  id: string;
  label: string;
  note?: string;
}
interface CheckSection {
  id: string;
  icon: string;
  title: string;
  items: CheckItem[];
}

const CHECKLISTS: CheckSection[] = [
  {
    id: 'gobag',
    icon: 'bag-personal',
    title: 'Go-Bag Essentials',
    items: [
      {
        id: 'water',
        label: 'Water (3-day supply)',
        note: '1 liter/person/day',
      },
      {
        id: 'food',
        label: 'Non-perishable food',
        note: '3-day supply, easy to open',
      },
      {
        id: 'meds',
        label: 'Prescription medicines',
        note: '7-day supply minimum',
      },
      { id: 'firstaid', label: 'First aid kit', note: 'With manual/guide' },
      {
        id: 'flashlight',
        label: 'Flashlight + extra batteries',
        note: 'Or hand-crank/solar',
      },
      {
        id: 'radio',
        label: 'Battery/hand-crank radio',
        note: 'For PAGASA/NDRRMC updates',
      },
      { id: 'whistle', label: 'Whistle', note: 'To signal for help' },
      { id: 'mask', label: 'Dust/face masks', note: 'N95 or cloth mask' },
      {
        id: 'plastic',
        label: 'Plastic sheeting + tape',
        note: 'For shelter-in-place',
      },
      {
        id: 'moneybag',
        label: 'Cash (small bills)',
        note: 'ATMs may not work',
      },
      {
        id: 'docs',
        label: 'Copies of important IDs/docs',
        note: 'In a waterproof bag',
      },
      {
        id: 'charger',
        label: 'Power bank (fully charged)',
        note: 'For phones',
      },
      { id: 'clothes', label: 'Change of clothes + rain gear' },
      { id: 'blanket', label: 'Emergency blanket / sleeping bag' },
      { id: 'tools', label: 'Multi-tool / Swiss army knife' },
      {
        id: 'garbage',
        label: 'Garbage bags (large)',
        note: 'Waterproof, multiple uses',
      },
    ],
  },
  {
    id: 'homeprep',
    icon: 'home',
    title: 'Home Preparation',
    items: [
      {
        id: 'drains',
        label: 'Clean gutters and drains',
        note: 'Prevent flooding',
      },
      {
        id: 'furniture',
        label: 'Strap heavy furniture to walls',
        note: 'Bookshelves, cabinets, ref',
      },
      {
        id: 'shutoff',
        label: 'Know gas/water/electric shutoffs',
        note: 'Label them clearly',
      },
      {
        id: 'roof',
        label: 'Inspect and secure roof',
        note: 'Before typhoon season',
      },
      { id: 'windows', label: 'Have boards/tape for windows' },
      { id: 'meetplan', label: 'Family has memorized meeting points' },
      {
        id: 'escape',
        label: 'Two escape routes per room',
        note: 'Practice fire drills',
      },
      { id: 'insurance', label: 'Home insurance is updated' },
      { id: 'numbers', label: 'Emergency numbers posted on fridge' },
      {
        id: 'neighbors',
        label: 'Know which neighbors need help',
        note: 'Elderly, PWD, solo',
      },
    ],
  },
  {
    id: 'pets',
    icon: 'paw',
    title: 'Pet Needs',
    items: [
      {
        id: 'petfood',
        label: 'Pet food (3-day supply)',
        note: 'In waterproof container',
      },
      {
        id: 'petwater',
        label: 'Water for pets',
        note: 'Separate from human supply',
      },
      {
        id: 'petmeds',
        label: 'Pet medications',
        note: 'With copies of prescriptions',
      },
      {
        id: 'carrier',
        label: 'Pet carrier / leash',
        note: 'Most shelters require carriers',
      },
      { id: 'vetdocs', label: 'Vet records / vaccination docs' },
      { id: 'petid', label: 'ID tag on collar with your number' },
      {
        id: 'petphoto',
        label: 'Recent photo of pets',
        note: 'In case you get separated',
      },
      { id: 'litter', label: 'Cat litter / waste bags' },
    ],
  },
  {
    id: 'seniors',
    icon: 'human-cane',
    title: 'For Elderly & PWD',
    items: [
      { id: 'walkaid', label: 'Walker / wheelchair / cane packed' },
      { id: 'hearing', label: 'Hearing aids + extra batteries' },
      { id: 'glasses', label: 'Extra eyeglasses / contacts' },
      { id: 'oxygen', label: 'Portable oxygen supply', note: 'If prescribed' },
      {
        id: 'dialysis',
        label: 'Dialysis schedule noted',
        note: 'Nearest clinic identified',
      },
      { id: 'medlist', label: 'Written list of all medications + doses' },
      { id: 'specialfood', label: 'Special dietary food' },
      {
        id: 'comfort',
        label: 'Comfort items',
        note: 'Familiar objects reduce anxiety',
      },
    ],
  },
];

interface FirstAidGuide {
  id: string;
  icon: string;
  title: string;
  steps: string[];
  warning?: string;
}

const FIRST_AID: FirstAidGuide[] = [
  {
    id: 'cpr',
    icon: 'heart-pulse',
    title: 'CPR (Adult)',
    warning:
      'Only perform if person is unresponsive and not breathing normally.',
    steps: [
      'Call for help or ask someone to call 911/8911 immediately.',
      'Lay the person flat on their back on a firm surface.',
      'Place heel of hand on center of chest (lower half of breastbone).',
      'Push down hard and fast — at least 5 cm deep, 100–120 times per minute.',
      'After 30 compressions, give 2 rescue breaths (tilt head, lift chin, seal mouth).',
      'Repeat 30:2 ratio until help arrives or the person starts breathing.',
    ],
  },
  {
    id: 'bleeding',
    icon: 'water-alert',
    title: 'Severe Bleeding',
    steps: [
      'Press firmly on the wound with a clean cloth or bandage.',
      'Do NOT remove the cloth — if soaked, add more on top.',
      'Elevate the injured limb above heart level if possible.',
      'Maintain pressure for at least 10 minutes without peeking.',
      'For limb wounds: consider tourniquet 5 cm above wound as last resort.',
      'Seek medical help immediately.',
    ],
  },
  {
    id: 'burns',
    icon: 'fire',
    title: 'Burns',
    steps: [
      'Cool the burn with cool (not cold/icy) running water for 10–20 minutes.',
      'Do NOT use ice, butter, toothpaste, or any creams.',
      'Remove jewelry/tight items near the burn before swelling starts.',
      'Cover loosely with a clean non-stick bandage or cling wrap.',
      'Do NOT pop blisters.',
      'Seek medical help for burns larger than your palm or on face/hands/feet.',
    ],
  },
  {
    id: 'fracture',
    icon: 'bone',
    title: 'Suspected Fracture',
    steps: [
      'Do NOT move the injured area. Immobilize it in the position found.',
      'Splint the injury using stiff material (board, rolled newspaper, cardboard).',
      'Pad the splint with cloth for comfort. Secure above and below the fracture.',
      'Check circulation (pulse, color, temperature) below the injury.',
      'Apply ice pack wrapped in cloth to reduce swelling.',
      'Seek immediate medical attention.',
    ],
  },
  {
    id: 'choking',
    icon: 'account-alert',
    title: 'Choking (Adult)',
    warning: 'If person can cough forcefully, encourage them to keep coughing.',
    steps: [
      'Ask "Are you choking?" — if they cannot speak, act immediately.',
      'Stand behind the person and lean them slightly forward.',
      'Give 5 firm back blows between shoulder blades with heel of hand.',
      'Give 5 abdominal thrusts (Heimlich): hands above navel, sharp upward thrust.',
      'Alternate 5 back blows and 5 abdominal thrusts.',
      'If unconscious: call for help and begin CPR.',
    ],
  },
  {
    id: 'heatstroke',
    icon: 'thermometer-alert',
    title: 'Heat Stroke',
    warning: 'Life-threatening emergency. Call for help immediately.',
    steps: [
      'Move person to a cool, shaded area immediately.',
      'Remove excess clothing.',
      'Cool rapidly: wet skin with cool water, fan vigorously.',
      'Apply ice packs to neck, armpits, and groin.',
      'If conscious, give cool water to drink slowly.',
      'Do NOT give fever medication — it will not help heat stroke.',
      'Monitor breathing. Get to a hospital as fast as possible.',
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const PrepScreen: React.FC = () => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'checklist' | 'firstaid' | 'education'>(
    'checklist',
  );
  const [expandedSection, setExpandedSection] = useState<string | null>(
    'gobag',
  );
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [searchFA, setSearchFA] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadPrepChecklist().then(setChecked);
    }, []),
  );

  const toggle = async (id: string) => {
    const updated = { ...checked, [id]: !checked[id] };
    setChecked(updated);
    await savePrepChecklist(updated);
  };

  const getSectionProgress = (section: CheckSection) => {
    const done = section.items.filter(i => checked[i.id]).length;
    return {
      done,
      total: section.items.length,
      pct: Math.round((done / section.items.length) * 100),
    };
  };

  const totalDone = CHECKLISTS.flatMap(s => s.items).filter(
    i => checked[i.id],
  ).length;
  const totalItems = CHECKLISTS.flatMap(s => s.items).length;
  const totalPct = Math.round((totalDone / totalItems) * 100);

  const filteredGuides = FIRST_AID.filter(g =>
    g.title.toLowerCase().includes(searchFA.toLowerCase()),
  );

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="bag-personal" size={28} color={COLORS.darkGreen} /><Text style={st.headerTitle}>Prep Zone</Text></View>
        <Text style={st.headerSub}>Be ready before disaster strikes</Text>
      </View>

      {/* Tabs */}
      <View style={st.tabRow}>
        <TouchableOpacity
          style={[st.tabBtn, activeTab === 'checklist' && st.tabBtnActive]}
          onPress={() => setActiveTab('checklist')}
        >
          <Text
            style={[st.tabTxt, activeTab === 'checklist' && st.tabTxtActive]}
          >
            Checklists
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.tabBtn, activeTab === 'firstaid' && st.tabBtnActive]}
          onPress={() => setActiveTab('firstaid')}
        >
          <Text
            style={[st.tabTxt, activeTab === 'firstaid' && st.tabTxtActive]}
          >
            First Aid
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.tabBtn, activeTab === 'education' && st.tabBtnActive]}
          onPress={() => setActiveTab('education')}
        >
          <Text
            style={[st.tabTxt, activeTab === 'education' && st.tabTxtActive]}
          >
            Education
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'checklist' ? (
        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Emergency numbers */}
          <View style={st.emrgCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Icon name="phone-classic" size={16} color={COLORS.darkGreen} style={{ marginRight: 6 }} />
              <Text style={[st.emrgTitle, { marginBottom: 0 }]}>Emergency Hotlines</Text>
            </View>
            {[
              { label: 'NDRRMC', number: '8911' },
              { label: 'Red Cross', number: '143' },
              { label: 'Bureau of Fire', number: '8-426-0219' },
              { label: 'PNP Hotline', number: '117' },
            ].map(({ label, number }) => (
              <TouchableOpacity
                key={label}
                style={st.emrgRow}
                onPress={() => Linking.openURL(`tel:${number}`)}
              >
                <Text style={st.emrgLabel}>{label}</Text>
                <Text style={st.emrgNum}>{number} <Icon name="phone" size={14} color={COLORS.primaryGreen} /></Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Overall progress */}
          <View style={st.overallCard}>
            <View style={st.overallTop}>
              <Text style={st.overallTitle}>Overall Preparedness</Text>
              <Text style={st.overallPct}>{totalPct}%</Text>
            </View>
            <View style={st.progressTrack}>
              <View
                style={[st.progressFill, { width: `${totalPct}%` as any }]}
              />
            </View>
            <Text style={st.overallSub}>
              {totalDone} of {totalItems} items completed
            </Text>
          </View>

          {/* Sections */}
          {CHECKLISTS.map(section => {
            const { done, total, pct } = getSectionProgress(section);
            const isOpen = expandedSection === section.id;
            return (
              <View key={section.id} style={st.section}>
                <TouchableOpacity
                  style={st.sectionHeader}
                  onPress={() => setExpandedSection(isOpen ? null : section.id)}
                  activeOpacity={0.7}
                >
                  <Icon name={section.icon} size={28} color={COLORS.primaryGreen} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.sectionTitle}>{section.title}</Text>
                    <View style={st.sectionProgress}>
                      <View style={st.sectionTrack}>
                        <View
                          style={[
                            st.sectionFill,
                            {
                              width: `${pct}%` as any,
                              backgroundColor:
                                pct === 100
                                  ? COLORS.primaryGreen
                                  : COLORS.accentGreen,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          st.sectionPct,
                          pct === 100 && st.sectionPctDone,
                        ]}
                      >
                        {done}/{total}
                      </Text>
                    </View>
                  </View>
                  <Text style={[st.sectionChevron, isOpen && st.chevronOpen]}>
                    ›
                  </Text>
                </TouchableOpacity>

                {isOpen && (
                  <View style={st.sectionBody}>
                    {section.items.map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={st.checkRow}
                        onPress={() => toggle(item.id)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            st.checkbox,
                            checked[item.id] && st.checkboxOn,
                          ]}
                        >
                          {checked[item.id] && (
                            <Text style={st.checkmark}>✓</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              st.checkLabel,
                              checked[item.id] && st.checkLabelDone,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {item.note && (
                            <Text style={st.checkNote}>{item.note}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 30 }} />
        </ScrollView>
      ) : activeTab === 'firstaid' ? (
        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            style={st.faSearch}
            placeholder="Search first aid topics..."
            placeholderTextColor={COLORS.gray}
            value={searchFA}
            onChangeText={setSearchFA}
          />
          <Text style={st.faHint}>
            Tap any topic for step-by-step instructions.
          </Text>

          {filteredGuides.map(guide => {
            const isOpen = expandedGuide === guide.id;
            return (
              <View key={guide.id} style={st.guideCard}>
                <TouchableOpacity
                  style={st.guideHeader}
                  onPress={() => setExpandedGuide(isOpen ? null : guide.id)}
                  activeOpacity={0.7}
                >
                  <Icon name={guide.icon} size={32} color={COLORS.error} />
                  <Text style={st.guideTitle}>{guide.title}</Text>
                  <Text style={[st.sectionChevron, isOpen && st.chevronOpen]}>
                    ›
                  </Text>
                </TouchableOpacity>

                {isOpen && (
                  <View style={st.guideBody}>
                    {guide.warning && (
                      <View style={st.warningBox}>
                        <View style={st.warningRow}>
                          <Icon
                            name="alert"
                            size={16}
                            color="#92400e"
                            style={st.warningIcon}
                          />
                          <Text style={st.warningTxt}>{guide.warning}</Text>
                        </View>
                      </View>
                    )}
                    {guide.steps.map((step, i) => (
                      <View key={i} style={st.stepRow}>
                        <View style={st.stepNum}>
                          <Text style={st.stepNumTxt}>{i + 1}</Text>
                        </View>
                        <View style={st.stepTextWrap}>
                          <Text style={st.stepTxt}>{step}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {filteredGuides.length === 0 && (
            <Text style={st.noResults}>No results for "{searchFA}"</Text>
          )}
          <View style={{ height: 30 }} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
        >
          {[
            { title: 'Earthquake', data: EARTHQUAKE_STEPS },
            { title: 'Typhoon', data: TYPHOON_STEPS },
          ].map((cat, i) => (
             <View key={i} style={st.section}>
                <View style={{ padding: 16 }}>
                    <Text style={{ fontFamily: FONTS.primaryBold, fontSize: SIZES.body, color: COLORS.darkGreen }}>{cat.title} Preparedness</Text>
                </View>
                {cat.data.map((section, idx) => (
                    <View key={idx} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                        <View style={[st.phaseTag, { backgroundColor: section.color }]}>
                            <Text style={st.phaseTagTxt}>{section.phase}</Text>
                        </View>
                        {section.items.map((item, idy) => (
                            <View key={idy} style={st.stepCard}>
                                <Icon name={item.icon} size={28} color={COLORS.darkGreen} style={{ marginTop: 2 }} />
                                <View style={st.stepBody}>
                                    <Text style={st.stepTitle}>{item.title}</Text>
                                    <Text style={st.stepDesc}>{item.desc}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                ))}
             </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  headerTitle: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
  },
  headerSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.padding,
    paddingBottom: 12,
    paddingTop: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: COLORS.darkGreen },
  tabTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  tabTxtActive: { color: COLORS.white },
  scroll: { padding: SIZES.padding, gap: 10 },
  emrgCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    marginBottom: 6,
  },
  emrgTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    marginBottom: 6,
  },
  emrgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  emrgLabel: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  emrgNum: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  overallCard: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: SIZES.radius + 4,
    padding: 20,
    gap: 8,
  },
  overallTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overallTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.white,
  },
  overallPct: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 28,
    color: COLORS.accentGreen,
  },
  progressTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accentGreen,
    borderRadius: 5,
  },
  overallSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  sectionEmoji: { fontSize: 24 },
  sectionTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    marginBottom: 6,
  },
  sectionProgress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTrack: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sectionFill: { height: '100%', borderRadius: 3 },
  sectionPct: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
    minWidth: 30,
  },
  sectionPctDone: { color: COLORS.primaryGreen },
  sectionChevron: { fontSize: 24, color: COLORS.gray },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  sectionBody: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
    gap: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0fdf4',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: FONTS.primaryBold,
  },
  checkLabel: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  checkLabelDone: { textDecorationLine: 'line-through', color: COLORS.gray },
  checkNote: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  faSearch: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  faHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
  },
  guideCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    overflow: 'hidden',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  guideEmoji: { fontSize: 28 },
  guideTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
    flex: 1,
  },
  guideBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
    paddingTop: 12,
    gap: 10,
  },
  warningBox: {
    backgroundColor: '#fff8e1',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  warningIcon: { marginTop: 3 },
  warningTxt: {
    flex: 1,
    flexShrink: 1,
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: '#92400e',
    lineHeight: 24,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumTxt: {
    fontFamily: FONTS.primaryBold,
    fontSize: 13,
    color: COLORS.white,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  stepTextWrap: {
    flex: 1,
    flexShrink: 1,
  },
  stepTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    lineHeight: 24,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  noResults: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
  phaseTag: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 10,
  },
  phaseTagTxt: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 12,
    color: COLORS.white,
    letterSpacing: 1.5,
  },
  stepCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    marginBottom: 10,
  },
  stepBody: { flex: 1, gap: 4 },
  stepTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  stepDesc: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    lineHeight: 24,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
});

export default PrepScreen;
