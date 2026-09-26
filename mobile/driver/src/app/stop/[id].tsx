import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { reasons, saveDeliveryResult } from '../../courier';
import { useDriver } from '../../driver-context';
import { colors } from '../../theme';
import { Banner, Button, money, styles } from '../../ui';

export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile, stops, currency, refresh, setNotice } = useDriver();
  const stop = stops.find((item) => String(item.id) === id);
  const [outcome, setOutcome] = useState<'delivered' | 'undelivered' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/" />;
  if (!stop) return <SafeAreaView style={styles.safe}><View style={styles.center}>
    <Banner text="This stop is no longer pending on your route. Refresh or contact dispatch." error />
    <Button label="Back to route" onPress={() => router.replace('/')} />
  </View></SafeAreaView>;

  const activeStop = stop;
  const shipment = activeStop.shipments;
  const address = [shipment.consignee_address, shipment.consignee_area, shipment.consignee_city, shipment.consignee_country_code].filter(Boolean).join(', ');
  async function takePhoto() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setError('Allow camera access to take a proof photo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.55, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64 || (asset.mimeType && asset.mimeType !== 'image/jpeg')) {
      setError('Take a JPG photo with the camera.'); return;
    }
    if (Math.floor(asset.base64.length * 0.75) > 5 * 1024 * 1024) {
      setError('Photo is over 5 MB. Retake it at a lower resolution.'); return;
    }
    setPhoto({ uri: asset.uri, base64: asset.base64 });
  }
  async function save() {
    if (!profile || !outcome || !photo || saving) return;
    if (outcome === 'undelivered' && !reason) { setError('Select an undelivered reason.'); return; }
    setSaving(true); setError(null);
    try {
      await saveDeliveryResult({ profile, stop: activeStop, outcome, reason, notes, photoBase64: photo.base64 });
      setNotice('Result and proof saved for ' + shipment.tracking_number + '.');
      await refresh();
      router.replace('/');
    } catch (caught) { setError((caught as Error).message); }
    finally { setSaving(false); }
  }
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}><Text style={styles.headerSmall}>DELIVERY STOP · #{stop.stop_sequence ?? '—'}</Text>
        <Text style={styles.heroAwb}>{shipment.tracking_number}</Text><Text style={styles.heroSub}>Attempt #{shipment.delivery_attempt_count + 1}</Text></View>
      <View style={styles.card}><Text style={styles.caption}>DELIVER TO</Text><Text style={styles.person}>{shipment.consignee_name}</Text>
        <Text style={styles.muted}>{address}</Text>{shipment.consignee_landmark ? <Text style={styles.muted}>Landmark: {shipment.consignee_landmark}</Text> : null}
        <View style={styles.rowGap}><View style={styles.flex}><Button label="Call customer" outline onPress={() => { void Linking.openURL('tel:' + shipment.consignee_phone); }} /></View>
          <View style={styles.flex}><Button label="Open map" outline onPress={() => { void Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)); }} /></View></View></View>
      <View style={styles.card}><Text style={styles.caption}>COLLECT</Text>
        <Text style={styles.money}>{money(shipment.cod_amount, shipment.currency || currency)}</Text>
        <Text style={styles.muted}>{shipment.payment_type === 'cod' ? 'Cash on delivery' : 'Prepaid · no cash collection'}</Text></View>
      {shipment.delivery_instructions ? <View style={styles.instructions}><Text style={styles.label}>Delivery instructions</Text><Text style={styles.muted}>{shipment.delivery_instructions}</Text></View> : null}
      <Text style={styles.section}>Complete this attempt</Text><Text style={styles.label}>Result</Text>
      <View style={styles.rowGap}><View style={styles.flex}><Button label="Delivered" outline={outcome !== 'delivered'} disabled={saving}
        onPress={() => { setOutcome('delivered'); setReason(null); }} /></View>
        <View style={styles.flex}><Button label="Undelivered" outline={outcome !== 'undelivered'} danger={outcome === 'undelivered'} disabled={saving}
          onPress={() => setOutcome('undelivered')} /></View></View>
      {outcome === 'undelivered' ? <><Text style={styles.label}>Undelivered reason</Text><View style={styles.chips}>
        {reasons.map(([value, label]) => <Pressable key={value} accessibilityRole="radio"
          accessibilityState={{ selected: reason === value, disabled: saving }} disabled={saving}
          onPress={() => setReason(value)} style={[styles.chip, reason === value && styles.chipSelected]}>
          <Text style={{ color: reason === value ? '#fff' : colors.ink, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </View></> : null}
      <Text style={styles.label}>Proof photo · required for both results</Text>
      <Button label={photo ? 'Retake proof photo' : 'Take proof photo'} outline disabled={saving} onPress={() => { void takePhoto(); }} />
      {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityLabel="Proof photo preview" /> : null}
      <Text style={styles.label}>Notes · optional</Text>
      <TextInput accessibilityLabel="Delivery notes" multiline maxLength={500} editable={!saving}
        value={notes} onChangeText={setNotes} style={[styles.input, styles.notes]} placeholder="Add useful delivery details" />
      <Banner text={error} error />
      <Button label={saving ? 'Uploading and saving…' : 'Save delivery result'}
        disabled={saving || !outcome || !photo || (outcome === 'undelivered' && !reason)} onPress={() => { void save(); }} />
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
