import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { recordCustody } from '../driver-features';
import { useDriver } from '../driver-context';
import { Banner, ActionButton, styles } from '../ui';

export default function ScanScreen() {
  const { manifest, stage } = useLocalSearchParams<{manifest?: string;stage?: string}>();
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState<string|null>(null);
  const { session, profile, stops } = useDriver();
  const [permission, requestPermission] = useCameraPermissions();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scanLocked = useRef(false);
  const lastBarcode = useRef('');
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/" />;
  async function openAwb(raw: string) {
    if(busy)return;
    const awb = raw.trim().toUpperCase();
    if(manifest){
      if(stage!=='pickup'&&stage!=='hub_handover'){setError('Open scanning from your assigned pickup.');scanLocked.current=false;return;}
      setBusy(true);setError(null);setNotice(null);
      try{await recordCustody(Number(manifest),awb,stage);setNotice(awb+' scan saved.');setValue('');}catch(e){setError((e as Error).message);}
      finally{setBusy(false);scanLocked.current=false;}return;
    }
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
        onBarcodeScanned={({ data }) => { if (scanLocked.current || lastBarcode.current===data) return; lastBarcode.current=data; scanLocked.current = true; void openAwb(data); }} />
      <View pointerEvents="none" style={styles.scanLine} />
    </View> : <View style={styles.card}><Text style={styles.muted}>Camera access is needed for barcode scanning.</Text>
      <ActionButton label="Enable camera" onPress={() => { void requestPermission(); }} /></View>}
    <Text style={styles.label}>Or enter tracking number</Text>
    <TextInput accessibilityLabel="Tracking number" autoCapitalize="characters" autoCorrect={false}
      value={value} onChangeText={setValue} style={styles.input} placeholder="Enter AWB"
      onSubmitEditing={() => { void openAwb(value); }} />
    <ActionButton label={busy?'Saving scan…':manifest?'Record custody scan':'Open assigned shipment'} onPress={() => { void openAwb(value); }} disabled={busy||!value.trim()} />
    <Banner text={error} error /><Banner text={notice}/>{manifest?<ActionButton label="Back to pickup" outline disabled={busy} onPress={()=>router.replace({pathname:'/pickup/[id]',params:{id:manifest}})}/>:null}
  </ScrollView></SafeAreaView>;
}

