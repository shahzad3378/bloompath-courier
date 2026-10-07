import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, Text, View } from 'react-native';
import { supabase } from '../courier';
import { useDriver } from '../driver-context';
import { colors } from '../theme';
import { Banner, BottomNav, ActionButton, money, styles } from '../ui';

export default function RouteScreen({ routesOnly = false }: { routesOnly?: boolean }) {
  const [query, setQuery] = useState('');
  const { session, starting, profile, accessError, retryProfile, routes, stops, currency, loading, routeError, notice, refresh } = useDriver();
  if (starting) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.green} /></View></SafeAreaView>;
  if (!session) return <Redirect href="/login" />;
  if (accessError) return <SafeAreaView style={styles.safe}><View style={styles.center}>
    <Banner text={accessError} error />
    <ActionButton label="Check account again" onPress={() => { void retryProfile(); }} />
    <ActionButton label="Sign out" outline onPress={() => { void supabase?.auth.signOut(); }} />
  </View></SafeAreaView>;
  if (!profile) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.green} /><Text style={styles.muted}>Checking driver account…</Text></View></SafeAreaView>;

  const shownStops = stops.filter(item => [item.shipments.tracking_number, item.shipments.consignee_name, item.shipments.consignee_city].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  return <SafeAreaView style={styles.safe}><FlatList data={shownStops} keyExtractor={(item) => String(item.id)}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh(); }} tintColor={colors.green} />}
    contentContainerStyle={styles.list}
    ListHeaderComponent={<>
      <Text style={styles.eyebrow}>FAST DROP · DRIVER</Text>
      <Text style={[styles.greeting, { marginTop: 14 }]}>{routesOnly ? 'My delivery route' : 'Hello, ' + profile.full_name.split(' ')[0]}</Text>
      <Text style={styles.muted}>Your next delivery starts here.</Text>
      <View style={styles.summary}><Text style={styles.summaryNumber}>{stops.length}</Text><View><Text style={styles.summaryText}>Pending stops</Text><Text style={styles.summaryMinor}>{routes.length} active {routes.length === 1 ? 'route' : 'routes'}</Text></View></View>
      <View style={styles.rowGap}><TextInput accessibilityLabel="Search assigned stops" placeholder="Search AWB, recipient or city" value={query} onChangeText={setQuery} style={[styles.input, styles.flex]} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.headerAction}><Text style={styles.collect}>Clear</Text></Pressable> : null}</View>
      <View style={styles.rowGap}><View style={styles.flex}><ActionButton label="Scan AWB" onPress={() => router.push('/scan')} /></View><View style={styles.flex}><ActionButton label={routesOnly ? 'Refresh route' : 'My routes'} outline disabled={loading && routesOnly} onPress={() => { if (routesOnly) void refresh(); else router.navigate('/routes'); }} /></View></View>
      <Banner text={notice} /><Banner text={routeError} error />
      {routeError ? <ActionButton label="Retry loading route" outline onPress={() => { void refresh(); }} /> : null}
      <View style={styles.rowGap}><View style={styles.flex}><Text style={styles.section}>Assigned deliveries</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/profile')} style={styles.headerAction}><Text style={styles.collect}>Profile</Text></Pressable></View>
    </>}
    ListEmptyComponent={!loading && !routeError ? <View style={styles.empty}><Text style={styles.person}>{query ? 'No matching stops' : 'All clear for now'}</Text><Text style={styles.muted}>{query ? 'Try another AWB, name or city.' : 'Your deliveries will appear when dispatch hands over a route.'}</Text></View> : null}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={'Open AWB ' + item.shipments.tracking_number}
      onPress={() => router.push({ pathname: '/stop/[id]', params: { id: String(item.id) } })}
      style={({ pressed }) => [styles.stop, pressed && styles.pressed]}>
      <View style={styles.row}><View style={styles.sequence}><Text style={styles.sequenceText}>{item.stop_sequence ?? '—'}</Text></View>
        <View style={styles.flex}><Text style={styles.awb}>{item.shipments.tracking_number}</Text><Text style={styles.mutedSmall}>{routes.find((route) => route.id === item.run_id)?.run_number ?? 'Assigned route'}</Text></View>
        <Text style={styles.chevron}>›</Text></View>
      <Text style={styles.person}>{item.shipments.consignee_name}</Text>
      <Text style={styles.muted} numberOfLines={2}>{item.shipments.consignee_address}, {item.shipments.consignee_city}</Text>
      <View style={styles.footer}><Text style={styles.collect}>{money(item.shipments.cod_amount, item.shipments.currency || currency)}</Text><Text style={styles.mutedSmall}>Attempt #{item.shipments.delivery_attempt_count + 1}</Text></View>
    </Pressable>} /><BottomNav /></SafeAreaView>;
}

