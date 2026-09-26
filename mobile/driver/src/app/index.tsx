import { Redirect, router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, Text, View } from 'react-native';
import { supabase } from '../courier';
import { useDriver } from '../driver-context';
import { colors } from '../theme';
import { Banner, Button, money, styles } from '../ui';

export default function RouteScreen() {
  const { session, starting, profile, accessError, retryProfile, routes, stops, currency, loading, routeError, notice, refresh } = useDriver();
  if (starting) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.green} /></View></SafeAreaView>;
  if (!session) return <Redirect href="/login" />;
  if (accessError) return <SafeAreaView style={styles.safe}><View style={styles.center}>
    <Banner text={accessError} error />
    <Button label="Check account again" onPress={() => { void retryProfile(); }} />
    <Button label="Sign out" outline onPress={() => { void supabase?.auth.signOut(); }} />
  </View></SafeAreaView>;
  if (!profile) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.green} /><Text style={styles.muted}>Checking driver account…</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><FlatList data={stops} keyExtractor={(item) => String(item.id)}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh(); }} tintColor={colors.green} />}
    contentContainerStyle={styles.list}
    ListHeaderComponent={<>
      <Text style={styles.greeting}>Hello, {profile.full_name}</Text>
      <Text style={styles.muted}>Only handed over routes and pending stops are shown.</Text>
      <View style={styles.summary}><Text style={styles.summaryNumber}>{stops.length}</Text><View><Text style={styles.summaryText}>Pending stops</Text><Text style={styles.summaryMinor}>{routes.length} active route(s)</Text></View></View>
      <Button label="Scan or enter AWB" onPress={() => router.push('/scan')} />
      <Banner text={notice} /><Banner text={routeError} error />
      {routeError ? <Button label="Retry loading route" outline onPress={() => { void refresh(); }} /> : null}
      <View style={styles.rowGap}><View style={styles.flex}><Text style={styles.section}>Stops in route order</Text></View>
        <Pressable accessibilityRole="button" onPress={() => { void supabase?.auth.signOut(); }}><Text style={styles.collect}>Sign out</Text></Pressable></View>
    </>}
    ListEmptyComponent={!loading && !routeError ? <View style={styles.empty}><Text style={styles.person}>No pending delivery stops</Text><Text style={styles.muted}>Pull to refresh after dispatch hands over a route.</Text></View> : null}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={'Open AWB ' + item.shipments.tracking_number}
      onPress={() => router.push({ pathname: '/stop/[id]', params: { id: String(item.id) } })}
      style={({ pressed }) => [styles.stop, pressed && styles.pressed]}>
      <View style={styles.row}><View style={styles.sequence}><Text style={styles.sequenceText}>{item.stop_sequence ?? '—'}</Text></View>
        <View style={styles.flex}><Text style={styles.awb}>{item.shipments.tracking_number}</Text><Text style={styles.mutedSmall}>{routes.find((route) => route.id === item.run_id)?.run_number ?? 'Assigned route'}</Text></View>
        <Text style={styles.chevron}>›</Text></View>
      <Text style={styles.person}>{item.shipments.consignee_name}</Text>
      <Text style={styles.muted} numberOfLines={2}>{item.shipments.consignee_address}, {item.shipments.consignee_city}</Text>
      <View style={styles.footer}><Text style={styles.collect}>{money(item.shipments.cod_amount, item.shipments.currency || currency)}</Text><Text style={styles.mutedSmall}>Attempt #{item.shipments.delivery_attempt_count + 1}</Text></View>
    </Pressable>} /></SafeAreaView>;
}
