import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useDriver } from '../driver-context';
import { Banner, ActionButton, styles } from '../ui';

export default function ScanScreen() {
  const { session, profile, stops } = useDriver();
  const [permission, requestPermission] = useCameraPermissions();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scanLocked = useRef(false);
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/" />;
  function openAwb(raw: string) {
    const awb = raw.trim().toUpperCase();
    const match = stops.find((item) => item.shipments.tracking_number.toUpperCase() === awb);
    if (!match) {
      setError('This AWB is not pending on your assigned route. Refresh or contact dispatch.');
      setTimeout(() => { scanLocked.current = false; }, 1500);
      return;
    }
    setError(null);
    router.replace({ pathname: '/stop/[id]', params: { id: String(match.id) } });
  }
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>FIND YOUR DELIVERY</Text><Text style={styles.title}>Scan a parcel</Text><Text style={[styles.muted, { marginBottom: 20 }]}>Keep the AWB barcode inside the frame. You can also enter it below.</Text>
    {permission?.granted ? <View style={styles.cameraFrame}>
      <CameraView style={styles.flex} facing="back" barcodeScannerSettings={{ barcodeTypes: ['code39', 'code128', 'qr'] }}
        onBarcodeScanned={({ data }) => { if (scanLocked.current) return; scanLocked.current = true; openAwb(data); }} />
      <View pointerEvents="none" style={styles.scanLine} />
    </View> : <View style={styles.card}><Text style={styles.muted}>Camera access is needed for barcode scanning.</Text>
      <ActionButton label="Enable camera" onPress={() => { void requestPermission(); }} /></View>}
    <Text style={styles.label}>Or enter tracking number</Text>
    <TextInput accessibilityLabel="Tracking number" autoCapitalize="characters" autoCorrect={false}
      value={value} onChangeText={setValue} style={styles.input} placeholder="Enter AWB"
      onSubmitEditing={() => openAwb(value)} />
    <ActionButton label="Open assigned shipment" onPress={() => openAwb(value)} disabled={!value.trim()} />
    <Banner text={error} error />
  </ScrollView></SafeAreaView>;
}

