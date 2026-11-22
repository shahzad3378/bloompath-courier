import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { reasons, saveDeliveryResult } from '../../courier';
import { useDriver } from '../../driver-context';
import { WebView } from 'react-native-webview';
import assets from '../../map-assets.json';
import { mapHtml, navigationUrl, validPoint } from '../../route-tools';
import { colors } from '../../theme';
import { Banner, ActionButton, money, styles } from '../../ui';

export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeliveryStop key={id} id={id} />;
}

function DeliveryStop({ id }: { id: string }) {
  const { session, profile, stops, currency, refresh, setNotice, verifiedStopId, setVerifiedStopId } = useDriver();
  const stop = stops.find((item) => String(item.id) === id);
  const [outcome, setOutcome] = useState<'delivered' | 'undelivered' | null>(null);
  const [radius, setRadius] = useState<50 | 100 | 150>(100);
  const [showMap, setShowMap] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [handoff, setHandoff] = useState('');
  const [recipient, setRecipient] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/" />;
  if (!stop) return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}><View style={styles.center}>
    <Banner text="This stop is no longer pending on your route. Refresh or contact dispatch." error />
    <ActionButton label="Back to route" onPress={() => router.replace('/')} />
  </View></SafeAreaView>;

  const activeStop = stop;
  const shipment = activeStop.shipments;
  const hasCoordinates = validPoint(shipment.delivery_latitude, shipment.delivery_longitude);
  const routeStops = stops.filter((item) => item.run_id === activeStop.run_id);
  const nextStop = routeStops[routeStops.findIndex((item) => item.id === activeStop.id) + 1];
  const scanVerified = verifiedStopId === activeStop.id;
  const hasArrived = arrived || scanVerified;
  const needsRecipient = handoff === 'Concierge or security';
  const handoffNotes = outcome === 'delivered' ? [handoff, recipient.trim()].filter(Boolean).join(' · ') : '';
  const resultNotes = [handoffNotes, notes.trim()].filter(Boolean).join(' — ');
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
    if (!profile || !scanVerified || !outcome || !photo || saving) return;
    if (outcome === 'delivered' && (!handoff || (needsRecipient && !recipient.trim()))) { setError('Select how the parcel was delivered and enter the recipient when required.'); return; }
    if (outcome === 'undelivered' && !reason) { setError('Select an undelivered reason.'); return; }
    setSaving(true); setError(null);
    try {
      await saveDeliveryResult({ profile, stop: activeStop, outcome, reason, notes: resultNotes, photoBase64: photo.base64 });
      setVerifiedStopId(null);
      setNotice('Result and proof saved for ' + shipment.tracking_number + '.');
      await refresh();
      if (nextStop) router.replace({ pathname: '/stop/[id]', params: { id: String(nextStop.id) } });
      else router.replace('/routes');
    } catch (caught) { setError((caught as Error).message); }
    finally { setSaving(false); }
  }
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}><Text style={styles.headerSmall}>DELIVERY STOP · #{stop.stop_sequence ?? '—'}</Text>
        <Text style={styles.heroAwb}>{shipment.tracking_number}</Text><Text style={styles.heroSub}>Attempt #{shipment.delivery_attempt_count + 1}</Text></View>
      <View style={styles.card}><Text style={styles.caption}>DELIVER TO</Text><Text style={styles.person}>{shipment.consignee_name}</Text>
        <Text style={styles.muted}>{address}</Text>{shipment.consignee_landmark ? <Text style={styles.muted}>Landmark: {shipment.consignee_landmark}</Text> : null}
        <View style={styles.rowGap}><View style={styles.flex}><ActionButton label="Call customer" outline onPress={() => { void Linking.openURL('tel:' + shipment.consignee_phone); }} /></View>
          <View style={styles.flex}><ActionButton label="Start navigation" outline onPress={() => { void Linking.openURL(navigationUrl(address)); }} /></View></View></View>
      <View style={styles.card}><Text style={styles.caption}>COLLECT</Text>
        <Text style={styles.money}>{money(shipment.cod_amount, shipment.currency || currency)}</Text>
        <Text style={styles.muted}>{shipment.payment_type === 'cod' ? 'Cash on delivery' : 'Prepaid · no cash collection'}</Text></View>
      {shipment.delivery_instructions ? <View style={styles.instructions}><Text style={styles.label}>Delivery instructions</Text><Text style={styles.muted}>{shipment.delivery_instructions}</Text></View> : null}
      {hasCoordinates && Platform.OS !== 'web' && !scanVerified ? <>
        <ActionButton label={showMap ? 'Hide stop map' : 'View stop map'} outline onPress={() => { setShowMap(!showMap); setMapError(false); }} />
        {showMap ? <>
          <View style={styles.chips}>{([50, 100, 150] as const).map((value) =>
            <ActionButton key={value} label={`${value} m`} outline={value !== radius} onPress={() => { setRadius(value); setMapError(false); }} />)}</View>
          <View style={[styles.cameraFrame, { marginTop: 12 }]}>
            <WebView key={radius} source={{ html: mapHtml([{ id: activeStop.id, latitude: shipment.delivery_latitude!, longitude: shipment.delivery_longitude!, awb: shipment.tracking_number, sequence: activeStop.stop_sequence }], assets, colors.green, radius), baseUrl: 'https://www.openstreetmap.org' }}
              originWhitelist={['*']} onError={() => setMapError(true)} onHttpError={() => setMapError(true)}
              onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('data:') || request.url === 'https://www.openstreetmap.org/' || request.url === 'https://www.openstreetmap.org'} />
          </View>
          <Banner text={mapError ? 'Stop map could not load. Navigation by address is still available.' : null} error />
        </> : null}
      </> : null}
      <Text style={styles.section}>Arrival and AWB</Text>
      {!hasArrived ? <ActionButton label="Confirm arrival" onPress={() => setArrived(true)} /> : null}
      {hasArrived && !scanVerified ? <ActionButton label="Scan parcel for this stop" onPress={() => router.push({ pathname: '/scan', params: { stopId: id } })} /> : null}
      {scanVerified ? <Banner text="AWB verified for this stop." /> : null}
      {nextStop && !scanVerified ? <ActionButton label="Go to next stop" outline onPress={() => router.replace({ pathname: '/stop/[id]', params: { id: String(nextStop.id) } })} /> : null}
      {scanVerified ? <>
      <Text style={styles.section}>Complete this attempt</Text><Text style={styles.label}>Result</Text>
      <View style={styles.rowGap}><View style={styles.flex}><ActionButton label="Delivered" outline={outcome !== 'delivered'} disabled={saving}
        onPress={() => { setOutcome('delivered'); setReason(null); }} /></View>
        <View style={styles.flex}><ActionButton label="Undelivered" outline={outcome !== 'undelivered'} danger={outcome === 'undelivered'} disabled={saving}
          onPress={() => setOutcome('undelivered')} /></View></View>
      {outcome === 'delivered' ? <>
        <Text style={styles.label}>Delivery method</Text>
        <View style={styles.chips}>{['Customer or household member', 'Concierge or security', ...(shipment.payment_type === 'cod' ? [] : ['Safe drop · front door', 'Safe drop · locker', 'Safe drop · mailroom', 'Safe drop · other'])].map((method) =>
          <ActionButton key={method} label={method} outline={handoff !== method} disabled={saving} onPress={() => { setHandoff(method); setRecipient(''); }} />)}</View>
        {needsRecipient ? <TextInput accessibilityLabel="Recipient name" value={recipient} onChangeText={setRecipient} maxLength={80} editable={!saving} style={[styles.input, { marginTop: 12 }]} placeholder="Concierge or security name" /> : null}
      </> : null}
      {outcome === 'undelivered' ? <><Text style={styles.label}>Undelivered reason</Text><View style={styles.chips}>
        {reasons.map(([value, label]) => <Pressable key={value} accessibilityRole="radio"
          accessibilityState={{ selected: reason === value, disabled: saving }} disabled={saving}
          onPress={() => setReason(value)} style={[styles.chip, reason === value && styles.chipSelected]}>
          <Text style={{ color: reason === value ? '#fff' : colors.ink, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </View></> : null}
      <Text style={styles.label}>Proof photo · required for both results</Text>
      <ActionButton label={photo ? 'Retake proof photo' : 'Take proof photo'} outline disabled={saving} onPress={() => { void takePhoto(); }} />
      {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityLabel="Proof photo preview" /> : null}
      <Text style={styles.label}>Notes · optional</Text>
      <TextInput accessibilityLabel="Delivery notes" multiline maxLength={Math.max(0, 500 - (handoffNotes ? handoffNotes.length + 3 : 0))} editable={!saving}
        value={notes} onChangeText={setNotes} style={[styles.input, styles.notes]} placeholder="Add useful delivery details" />
      <Banner text={error} error />
      <ActionButton label={saving ? 'Uploading and saving…' : 'Save delivery result'}
        disabled={saving || !outcome || !photo || resultNotes.length > 500 || (outcome === 'undelivered' && !reason) || (outcome === 'delivered' && (!handoff || (needsRecipient && !recipient.trim())))} onPress={() => { void save(); }} />
      </> : null}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

