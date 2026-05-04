import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from '../components/Icon';
import { loadProfile, UserProfile } from '../database/storage';

// ─── Disaster Content ─────────────────────────────────────────────────────────

const EARTHQUAKE_STEPS = [
  {
    phase: 'DURING',
    color: COLORS.error,
    items: [
      {
        icon: 'arrow-down-bold-circle-outline',
        title: 'DROP, COVER, HOLD ON',
        desc: 'Drop to hands and knees. Take cover under a sturdy table or desk. Hold on until shaking stops.',
      },
      {
        icon: 'cancel',
        title: 'Do NOT run outside',
        desc: 'Most injuries happen when people try to move or run during shaking. Stay where you are.',
      },
      {
        icon: 'window-closed-variant',
        title: 'Away from windows',
        desc: 'Move away from glass, windows, outside doors, and walls that could shatter.',
      },
      {
        icon: 'bed-empty',
        title: 'If in bed',
        desc: 'Stay there. Hold on and protect your head with a pillow. Rolling to the floor can cause injury.',
      },
    ],
  },
  {
    phase: 'AFTER',
    color: COLORS.blue,
    items: [
      {
        icon: 'fire',
        title: 'Check for fires',
        desc: 'Check for gas leaks. If you smell gas, open windows, leave the building, and do not use electrical switches.',
      },
      {
        icon: 'stethoscope',
        title: 'Check for injuries',
        desc: 'Do not move seriously injured persons unless in immediate danger. Apply first aid.',
      },
      {
        icon: 'radio',
        title: 'Listen for updates',
        desc: 'Use a battery-powered radio for official PHIVOLCS/NDRRMC updates.',
      },
      {
        icon: 'home-outline',
        title: 'Inspect your home',
        desc: 'Check for structural damage before re-entering. Watch for aftershocks.',
      },
    ],
  },
  {
    phase: 'EVACUATE IF',
    color: '#7c3aed',
    items: [
      {
        icon: 'water-alert-outline',
        title: 'Near the coast',
        desc: 'Move to high ground immediately — tsunami waves can arrive within minutes of a strong quake.',
      },
      {
        icon: 'home-off-outline',
        title: 'Building is damaged',
        desc: 'Leave if you see cracks in walls, tilting floors, or smell gas.',
      },
      {
        icon: 'fire-alert',
        title: 'Fire breaks out',
        desc: 'Evacuate immediately using stairs. Do not use elevators.',
      },
    ],
  },
];

const TYPHOON_STEPS = [
  {
    phase: 'BEFORE',
    color: COLORS.blue,
    items: [
      {
        icon: 'bag-personal',
        title: 'Prepare your Go-Bag',
        desc: 'Pack food, water (3-day supply), medicines, important documents, flashlight, and cash.',
      },
      {
        icon: 'cellphone',
        title: 'Charge all devices',
        desc: 'Charge phones, power banks, and radios. Save NDRRMC and LGU numbers.',
      },
      {
        icon: 'home',
        title: 'Secure your home',
        desc: 'Board up windows, clear drains, bring loose outdoor items inside.',
      },
      {
        icon: 'antenna',
        title: 'Monitor PAGASA alerts',
        desc: 'Signal No. 3+ means evacuate low-lying areas, coastal zones, and unstable slopes.',
      },
    ],
  },
  {
    phase: 'DURING',
    color: COLORS.error,
    items: [
      {
        icon: 'home',
        title: 'Stay indoors',
        desc: 'Stay in the strongest part of your home. Avoid upper floors if the roof is weak.',
      },
      {
        icon: 'door',
        title: 'Away from windows',
        desc: 'Strong winds can shatter glass. Move to interior rooms.',
      },
      {
        icon: 'water-alert',
        title: 'Watch for flooding',
        desc: 'If water rises rapidly, move to upper floors. Do NOT wait to evacuate if warned.',
      },
      {
        icon: 'lightning-bolt',
        title: 'Avoid floodwater',
        desc: '6 inches of water can knock you off your feet. Never walk in flowing floodwater.',
      },
    ],
  },
  {
    phase: 'EVACUATE IF',
    color: '#7c3aed',
    items: [
      {
        icon: 'image-filter-hdr',
        title: 'Near slopes or mountains',
        desc: 'Landslide risk is high during heavy rain. Leave early — do not wait for the signal.',
      },
      {
        icon: 'waves',
        title: 'In a flood-prone area',
        desc: 'If you live in a low-lying or coastal barangay, pre-emptive evacuation saves lives.',
      },
      {
        icon: 'bullhorn-outline',
        title: 'LGU orders evacuation',
        desc: 'Obey barangay evacuation orders immediately. Your life is worth more than your property.',
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

type DisasterType = 'EARTHQUAKE' | 'TYPHOON' | null;

export const HomeScreen: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [disasterModal, setDisasterModal] = useState<DisasterType>(null);
  const [sosModal, setSosModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadProfile().then(setProfile);
    }, []),
  );

  const sendSOS = (contact: { name: string; phone: string }) => {
    if (!contact.phone) return;
    const loc = profile?.location;
    const place = loc?.primaryMeeting.landmark
      ? `${loc.primaryMeeting.landmark}, ${loc.primaryMeeting.streetAddress}`
      : loc?.barangay
      ? `Brgy. ${loc.barangay}, ${loc.city}`
      : 'our agreed meeting point';
    const msg = `Hi ${contact.name}, I'm safe. My current area is ${
      loc?.barangay ? `Brgy. ${loc.barangay}, ${loc.city}` : 'unknown'
    }. I'm heading to ${place}. - ${profile?.name || 'Me'} (sent via Likas)`;
    const phone = contact.phone.replace(/\D/g, '');
    const smsUrl =
      Platform.OS === 'ios'
        ? `sms:${phone}&body=${encodeURIComponent(msg)}`
        : `sms:${phone}?body=${encodeURIComponent(msg)}`;
    Linking.openURL(smsUrl).catch(() =>
      Alert.alert('Error', 'Could not open SMS app.'),
    );
  };

  const disasterContent =
    disasterModal === 'EARTHQUAKE' ? EARTHQUAKE_STEPS : TYPHOON_STEPS;
  const contacts =
    profile?.emergencyContacts.filter(c => c.name && c.phone) ?? [];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Status Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.greeting}>
                Mabuhay, {profile?.name || 'Friend'}
              </Text>
              <Icon name="hand-wave" size={24} color={COLORS.accentGreen} />
            </View>
            <Text style={s.location}>
              <Icon name="map-marker" size={12} color={COLORS.accentGreen} />
              {profile?.location.barangay
                ? `Brgy. ${profile.location.barangay}, ${profile.location.city}`
                : 'Location not set'}
            </Text>
          </View>
          <View style={s.statusBadge}>
            <Text style={s.statusDot}>●</Text>
            <Text style={s.statusTxt}>Ready</Text>
          </View>
        </View>

        {/* Meeting point reminder */}
        {profile?.location.primaryMeeting.landmark ? (
          <View style={s.meetBanner}>
            <Icon name="map-marker" size={14} color={COLORS.lightGreen} />
            <Text style={s.meetTxt} numberOfLines={1}>
              Meeting: {profile.location.primaryMeeting.landmark}
              {profile.location.primaryMeeting.streetAddress
                ? ` · ${profile.location.primaryMeeting.streetAddress}`
                : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.prompt}>What's happening?</Text>
        <Text style={s.promptSub}>
          Tap below for instant step-by-step guidance.
        </Text>

        {/* Big Disaster Buttons */}
        <TouchableOpacity
          style={[s.bigBtn, s.eqBtn]}
          onPress={() => setDisasterModal('EARTHQUAKE')}
          activeOpacity={0.88}
        >
          <View style={s.bigBtnEmojiContainer}>
            <Icon name="earthquake" size={42} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bigBtnLabel}>EARTHQUAKE</Text>
            <Text style={s.bigBtnSub}>Lindol · Ground shaking</Text>
          </View>
          <Icon name="chevron-right" size={28} color={COLORS.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.bigBtn, s.tyBtn]}
          onPress={() => setDisasterModal('TYPHOON')}
          activeOpacity={0.88}
        >
          <View style={s.bigBtnEmojiContainer}>
            <Icon name="weather-hurricane" size={42} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bigBtnLabel}>TYPHOON</Text>
            <Text style={s.bigBtnSub}>Bagyo · Storm · Flood</Text>
          </View>
          <Icon name="chevron-right" size={28} color={COLORS.white} />
        </TouchableOpacity>

        {/* Quick info cards */}
        <View style={s.infoRow}>
          <View style={s.infoCard}>
            <Icon name="bag-personal" size={26} color={COLORS.primaryGreen} style={{ marginBottom: 4 }} />
            <Text style={s.infoLabel}>Go-Bag</Text>
            <Text style={s.infoSub}>Check Prep tab</Text>
          </View>
          <View style={s.infoCard}>
            <Icon name="map-marker-radius" size={26} color={COLORS.primaryGreen} style={{ marginBottom: 4 }} />
            <Text style={s.infoLabel}>Evacuation</Text>
            <Text style={s.infoSub}>Map tab</Text>
          </View>
          <View style={s.infoCard}>
            <Icon name="phone" size={26} color={COLORS.primaryGreen} style={{ marginBottom: 4 }} />
            <Text style={s.infoLabel}>
              {contacts.length > 0
                ? `${contacts.length} Contact${contacts.length > 1 ? 's' : ''}`
                : 'No Contacts'}
            </Text>
            <Text style={s.infoSub}>SOS ready</Text>
          </View>
        </View>

        {/* Emergency numbers */}
        <View style={s.emrgCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Icon name="phone-classic" size={16} color={COLORS.darkGreen} style={{ marginRight: 6 }} />
            <Text style={[s.emrgTitle, { marginBottom: 0 }]}>Emergency Hotlines</Text>
          </View>
          {[
            { label: 'NDRRMC', number: '8911' },
            { label: 'Red Cross', number: '143' },
            { label: 'Bureau of Fire', number: '8-426-0219' },
            { label: 'PNP Hotline', number: '117' },
          ].map(({ label, number }) => (
            <TouchableOpacity
              key={label}
              style={s.emrgRow}
              onPress={() => Linking.openURL(`tel:${number}`)}
            >
              <Text style={s.emrgLabel}>{label}</Text>
              <Text style={s.emrgNum}>{number} <Icon name="phone" size={14} color={COLORS.primaryGreen} /></Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* SOS FAB */}
      <TouchableOpacity
        style={s.sosFab}
        onPress={() => setSosModal(true)}
        activeOpacity={0.85}
      >
        <Text style={s.sosFabEmoji}>🆘</Text>
        <Text style={s.sosFabLabel}>SOS</Text>
      </TouchableOpacity>

      {/* ── DISASTER MODAL ── */}
      <Modal
        visible={disasterModal !== null}
        animationType="slide"
        transparent={false}
      >
        <SafeAreaView style={s.modalSafe} edges={['top', 'bottom']}>
          <View
            style={[
              s.modalHeader,
              disasterModal === 'EARTHQUAKE'
                ? s.modalHeaderEQ
                : s.modalHeaderTY,
            ]}
          >
            <Icon name={disasterModal === 'EARTHQUAKE' ? 'earthquake' : 'weather-hurricane'} size={36} color={COLORS.white} />
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{disasterModal}</Text>
              <Text style={s.modalSubtitle}>Step-by-step guide</Text>
            </View>
            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => setDisasterModal(null)}
            >
              <Text style={s.closeTxt}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={s.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            {disasterContent.map(section => (
              <View key={section.phase} style={s.phase}>
                <View style={[s.phaseTag, { backgroundColor: section.color }]}>
                  <Text style={s.phaseTagTxt}>{section.phase}</Text>
                </View>
                {section.items.map((item, idx) => (
                  <View key={idx} style={s.stepCard}>
                    <Text style={s.stepIcon}>{item.icon}</Text>
                    <View style={s.stepBody}>
                      <Text style={s.stepTitle}>{item.title}</Text>
                      <Text style={s.stepDesc}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {/* Quick contacts inside modal */}
            {contacts.length > 0 && (
              <View style={s.quickContacts}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="phone" size={16} color={COLORS.error} />
                  <Text style={s.quickContactsTitle}>
                    Quick SMS to Contacts
                  </Text>
                </View>
                {contacts.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    style={s.quickContactBtn}
                    onPress={() => sendSOS(c)}
                  >
                    <Text style={s.quickContactName}>{c.name}</Text>
                    <Text style={s.quickContactAction}>Send SOS SMS →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── SOS MODAL ── */}
      <Modal visible={sosModal} animationType="slide" transparent>
        <View style={s.sosOverlay}>
          <View style={s.sosSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="alert-decagram" size={24} color={COLORS.error} />
              <Text style={s.sosTitle}>Send Emergency SOS</Text>
            </View>
            <Text style={s.sosSub}>
              This opens your SMS app with a pre-filled message including your
              location and meeting point.
            </Text>

            {contacts.length === 0 ? (
              <View style={s.sosNoContacts}>
                <Text style={s.sosNoContactsTxt}>
                  No emergency contacts saved. Go to the Profile tab to add
                  them.
                </Text>
              </View>
            ) : (
              contacts.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.sosContactBtn}
                  onPress={() => {
                    sendSOS(c);
                    setSosModal(false);
                  }}
                >
                  <View>
                    <Text style={s.sosContactName}>{c.name}</Text>
                    <Text style={s.sosContactPhone}>
                      {c.phone}
                      {c.relationship ? ` · ${c.relationship}` : ''}
                    </Text>
                  </View>
                  <Text style={s.sosContactAction}><Icon name="cellphone-message" size={14} color={COLORS.error} /> SMS</Text>
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={s.sosCancelBtn}
              onPress={() => setSosModal(false)}
            >
              <Text style={s.sosCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' },
  header: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: SIZES.padding,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greeting: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h3,
    color: COLORS.white,
  },
  location: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.accentGreen,
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: { color: COLORS.accentGreen, fontSize: 10 },
  statusTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.white,
  },
  meetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  meetIcon: { fontSize: 14 },
  meetTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.lightGreen,
    flex: 1,
  },
  scroll: { padding: SIZES.padding, gap: 12 },
  prompt: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
  },
  promptSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginTop: -6,
  },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: SIZES.radius + 4,
    padding: 22,
  },
  eqBtn: { backgroundColor: COLORS.darkGreen },
  tyBtn: { backgroundColor: COLORS.blue },
  bigBtnEmojiContainer: { width: 42, alignItems: 'center' },
  bigBtnLabel: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 22,
    color: COLORS.white,
    letterSpacing: 1.5,
  },
  bigBtnSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  infoLabel: {
    fontFamily: FONTS.primaryBold,
    fontSize: 12,
    color: COLORS.darkGreen,
    textAlign: 'center',
  },
  infoSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    textAlign: 'center',
  },
  emrgCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
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
  sosFab: {
    position: 'absolute',
    bottom: 26,
    right: 20,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    gap: 1,
  },
  sosFabEmoji: { fontSize: 24 },
  sosFabLabel: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 11,
    color: COLORS.white,
    letterSpacing: 1,
  },
  // Disaster modal
  modalSafe: { flex: 1, backgroundColor: '#f8fafc' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    paddingBottom: 16,
  },
  modalHeaderEQ: { backgroundColor: COLORS.darkGreen },
  modalHeaderTY: { backgroundColor: COLORS.blue },
  modalEmoji: { fontSize: 36 },
  modalTitle: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 22,
    color: COLORS.white,
    letterSpacing: 1,
  },
  modalSubtitle: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 13,
    color: COLORS.white,
  },
  modalScroll: { padding: SIZES.padding, gap: 16 },
  phase: { gap: 10 },
  phaseTag: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 2,
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
  },
  stepIcon: { fontSize: 28, marginTop: 2 },
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
    lineHeight: 20,
  },
  quickContacts: {
    backgroundColor: '#fef2f2',
    borderRadius: SIZES.radius,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  quickContactsTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.error,
  },
  quickContactBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  quickContactName: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  quickContactAction: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.error,
  },
  // SOS modal
  sosOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sosSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  sosTitle: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.error,
    textAlign: 'center',
  },
  sosSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 20,
  },
  sosNoContacts: {
    backgroundColor: '#fff8e1',
    borderRadius: SIZES.radius,
    padding: 14,
  },
  sosNoContactsTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#92400e',
    textAlign: 'center',
    lineHeight: 20,
  },
  sosContactBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  sosContactName: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  sosContactPhone: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  sosContactAction: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.error,
  },
  sosCancelBtn: {
    backgroundColor: COLORS.lightGreen,
    borderRadius: SIZES.radius,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  sosCancelTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.primaryGreen,
  },
});

export default HomeScreen;
