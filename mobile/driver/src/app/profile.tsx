import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { supabase } from '../courier';
import { useDriver } from '../driver-context';
import { colors } from '../theme';
import { Banner, BottomNav, ActionButton, styles } from '../ui';
export default function ProfileScreen() {
  const { session, profile, routes, stops, routeError, loading, refresh } = useDriver();
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/" />;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>FAST DROP · DRIVER</Text><Text style={styles.title}>My profile</Text>
    <View style={[styles.card, { backgroundColor: colors.paleGreen, alignItems: 'center', paddingVertical: 30 }]}>
      <View style={[styles.sequence, { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, marginRight: 0 }]}><Text style={[styles.sequenceText, { fontSize: 28 }]}>{profile.full_name.trim().slice(0, 1).toUpperCase()}</Text></View>
      <Text style={[styles.person, { marginTop: 14 }]}>{profile.full_name}</Text><Text style={styles.muted}>{session.user.email}</Text>
      <Text style={styles.collect}>Delivery driver</Text>
    </View>
    <View style={styles.card}><Text style={styles.person}>Your assignments</Text><Text style={styles.muted}>{routes.length} active routes · {stops.length} pending stops</Text>
      <ActionButton label={loading ? 'Refreshing…' : 'Refresh assignments'} outline disabled={loading} onPress={() => { void refresh(); }} /><Banner text={routeError} error /></View>
    <View style={styles.card}><Text style={styles.person}>Need help with a delivery?</Text><Text style={styles.muted}>Contact your dispatch team for assignment or address changes.</Text></View>
    <ActionButton label="Sign out" outline onPress={() => { void supabase?.auth.signOut(); }} />
  </ScrollView><BottomNav /></SafeAreaView>;
}
