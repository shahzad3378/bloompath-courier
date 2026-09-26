import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function Button({ label, onPress, outline = false, danger = false, disabled = false }: {
  label: string; onPress: () => void; outline?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, outline ? styles.outline : danger ? styles.danger : styles.primary,
      disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, outline && styles.outlineText]}>{label}</Text>
  </Pressable>;
}

export function Banner({ text, error = false }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return <View accessibilityRole="alert" style={[styles.banner, error ? styles.errorBanner : styles.successBanner]}>
    <Text style={{ color: error ? colors.red : colors.green, fontWeight: '700', lineHeight: 20 }}>{text}</Text>
  </View>;
}

export function money(amount: number, currency: string) {
  const number = Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? currency.toUpperCase() + ' ' + number : number;
}

export const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  login: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoLetter: { fontSize: 34, fontWeight: '900', color: '#fff' },
  eyebrow: { color: colors.green, fontSize: 12, letterSpacing: 1.4, fontWeight: '800' },
  title: { fontSize: 32, fontWeight: '800', color: colors.ink, marginTop: 8, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  mutedSmall: { color: colors.muted, fontSize: 12, marginTop: 3 },
  label: { color: colors.ink, fontWeight: '700', fontSize: 13, marginTop: 16, marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  notes: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 18, marginTop: 16, gap: 4 },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
  primary: { backgroundColor: colors.green }, danger: { backgroundColor: colors.red },
  outline: { borderWidth: 1, borderColor: colors.green, backgroundColor: '#fff' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  outlineText: { color: colors.green }, disabled: { opacity: 0.48 }, pressed: { opacity: 0.75 },
  banner: { borderRadius: 12, borderWidth: 1, padding: 12, marginVertical: 8 },
  errorBanner: { backgroundColor: '#fff1f1', borderColor: '#efc7c7' },
  successBanner: { backgroundColor: '#e8f6ee', borderColor: '#bfe3cf' },
  header: { backgroundColor: colors.darkGreen, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSmall: { fontSize: 10, letterSpacing: 1.1, color: '#72d49c', fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 4 },
  headerAction: { padding: 10, minHeight: 44, justifyContent: 'center' },
  headerActionText: { color: '#fff', fontWeight: '700' },
  list: { padding: 18, paddingBottom: 40 }, greeting: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  summary: { backgroundColor: colors.darkGreen, borderRadius: 18, padding: 20, marginTop: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 18 },
  summaryNumber: { color: '#6fdda1', fontSize: 48, fontWeight: '900' },
  summaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  summaryMinor: { color: '#bfd4c6', fontSize: 12, marginTop: 3 },
  section: { fontSize: 19, color: colors.ink, fontWeight: '800', marginTop: 26, marginBottom: 12 },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  stop: { borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rowGap: { flexDirection: 'row', gap: 10, marginTop: 12 },
  sequence: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleGreen, marginRight: 12 },
  sequenceText: { fontWeight: '900', color: colors.green },
  awb: { fontSize: 15, color: colors.ink, fontWeight: '900' },
  chevron: { fontSize: 28, color: colors.green },
  person: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 5 },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 14, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  collect: { color: colors.green, fontWeight: '900' },
  page: { padding: 18, paddingBottom: 42 },
  cameraFrame: { height: 260, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.darkGreen },
  scanLine: { position: 'absolute', left: 32, right: 32, top: '50%', height: 2, backgroundColor: '#6fdda1' },
  hero: { backgroundColor: colors.darkGreen, borderRadius: 18, padding: 20 },
  heroAwb: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 10 },
  heroSub: { color: '#bfd4c6', marginTop: 6 },
  caption: { color: colors.muted, fontSize: 11, letterSpacing: 1, fontWeight: '800', marginBottom: 10 },
  money: { fontSize: 26, color: colors.green, fontWeight: '900', marginBottom: 4 },
  instructions: { backgroundColor: '#fff9ed', padding: 16, borderRadius: 14, marginTop: 14, borderWidth: 1, borderColor: '#eadfc9' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, backgroundColor: '#fff', minHeight: 44, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.darkGreen, borderColor: colors.darkGreen },
  preview: { height: 180, width: '100%', borderRadius: 12, marginTop: 12, backgroundColor: colors.line },
});
