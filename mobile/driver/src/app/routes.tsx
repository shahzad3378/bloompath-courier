import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import assets from '../map-assets.json';
import type { Stop } from '../courier';
import { useDriver } from '../driver-context';
import { suggestOrder, validPoint, mapHtml } from '../route-tools';
import { colors } from '../theme';
import { ActionButton, Banner, BottomNav, styles } from '../ui';

const tabs = ['Stops', 'Packages', 'Map', 'Summary'] as const;

export default function Routes() {
  const { session, profile, routes, stops, completedStops, routeError, loading, refresh } = useDriver();
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Stops');
  const [query, setQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [mapError, setMapError] = useState(false);
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/" />;

  const active = routes.find((route) => route.id === selected) ?? routes[0];
  const pending = stops.filter((stop) => stop.run_id === active?.id);
  const completed = completedStops.filter((stop) => stop.run_id === active?.id);
  const points = pending.filter((stop) => validPoint(stop.shipments.delivery_latitude, stop.shipments.delivery_longitude))
    .map((stop) => ({ id: stop.id, latitude: stop.shipments.delivery_latitude!, longitude: stop.shipments.delivery_longitude!, awb: stop.shipments.tracking_number, sequence: stop.stop_sequence }));
  const ordered = suggested ? suggestOrder(points) : points;
  const packages = (showCompleted ? completed : pending).filter(({ shipments }) => {
    const term = query.trim().toLowerCase();
    return [shipments.tracking_number, shipments.consignee_name, shipments.consignee_address, shipments.consignee_city]
      .some((field) => field?.toLowerCase().includes(term));
  });

  function stopRow(stop: Stop, packageFirst = false) {
    const shipment = stop.shipments;
    const content = <>
      <View style={styles.sequence}><Text style={styles.sequenceText}>{stop.stop_sequence ?? '—'}</Text></View>
      <View style={styles.flex}>
        <Text style={styles.awb}>{packageFirst ? shipment.tracking_number : shipment.consignee_address}</Text>
        <Text style={styles.muted}>{shipment.consignee_city} · {shipment.consignee_name}</Text>
        <Text style={styles.mutedSmall}>{stop.completed_at ? shipment.status.replaceAll('_', ' ') : packageFirst ? shipment.consignee_address : shipment.tracking_number}</Text>
      </View>
    </>;
    return stop.completed_at
      ? <View key={stop.id} style={[styles.stop, styles.row]}>{content}</View>
      : <Pressable key={stop.id} accessibilityRole="button" style={[styles.stop, styles.row]}
          onPress={() => router.push({ pathname: '/stop/[id]', params: { id: String(stop.id) } })}>{content}<Text style={styles.chevron}>›</Text></Pressable>;
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.headerSmall}>DELIVERY ROUTE</Text>
        <Text style={styles.heroAwb}>{active?.route_name || active?.run_number || 'My routes'}</Text>
        {active ? <Text style={styles.heroSub}>{active.run_number} · {pending.length} pending · {completed.length} completed</Text> : null}
      </View>
      <View style={styles.chips}>{routes.length > 1 ? routes.map((route) =>
        <ActionButton key={route.id} label={route.run_number} outline={active?.id !== route.id}
          onPress={() => { setSelected(route.id); setSuggested(false); setMapError(false); setQuery(''); }} />) : null}</View>
      <Banner text={routeError} error />
      {active ? <>
        <View style={styles.tabs}>{tabs.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }}
          onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabSelected]}><Text style={styles.tabLabel}>{item}</Text></Pressable>)}</View>
        {tab === 'Stops' ? <>
          {pending.map((stop) => stopRow(stop))}
          {!pending.length ? <Text style={styles.muted}>No pending stops on this route.</Text> : null}
        </> : null}
        {tab === 'Packages' ? <>
          <View style={styles.chips}>
            <ActionButton label={`Pending (${pending.length})`} outline={showCompleted} onPress={() => setShowCompleted(false)} />
            <ActionButton label={`Completed (${completed.length})`} outline={!showCompleted} onPress={() => setShowCompleted(true)} />
          </View>
          <TextInput accessibilityLabel="Search packages" placeholder="Search AWB, address or recipient" value={query} onChangeText={setQuery} style={[styles.input, { marginVertical: 12 }]} />
          {packages.map((stop) => stopRow(stop, true))}
          {!packages.length ? <Text style={styles.muted}>No matching packages.</Text> : null}
        </> : null}
        {tab === 'Map' ? <>
          {mapError ? <Banner text="Map unavailable. You can still open each stop from the list." error /> : null}
          {points.length > 0 && Platform.OS !== 'web' ? <View style={[styles.cameraFrame, { height: 320 }]}>
            <WebView key={String(active.id) + String(suggested)} source={{ html: mapHtml(ordered, assets, colors.green), baseUrl: 'https://www.openstreetmap.org' }}
              originWhitelist={['*']} onError={() => setMapError(true)} onHttpError={() => setMapError(true)}
              onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('data:') || request.url === 'https://www.openstreetmap.org/' || request.url === 'https://www.openstreetmap.org'} />
          </View> : <Text style={styles.muted}>{points.length ? 'The map is available in the Android app.' : 'No pending stops have map coordinates.'}</Text>}
          <Text style={styles.mutedSmall}>{points.length} mapped · {pending.length - points.length} without coordinates</Text>
          <ActionButton label={suggested ? 'Use dispatch order' : 'Suggest nearby order'} outline disabled={points.length < 2} onPress={() => setSuggested(!suggested)} />
          {suggested ? <Text style={styles.mutedSmall}>Suggested by straight-line distance. Dispatch order is unchanged.</Text> : null}
          {(suggested ? [...ordered.map((point) => pending.find((stop) => stop.id === point.id)!), ...pending.filter((stop) => !validPoint(stop.shipments.delivery_latitude, stop.shipments.delivery_longitude))] : pending).map((stop) => stopRow(stop))}
        </> : null}
        {tab === 'Summary' ? <View style={styles.card}>
          <Text style={styles.person}>Route progress</Text>
          <Text style={styles.muted}>{pending.length + completed.length} packages assigned</Text>
          <Text style={styles.muted}>{pending.length} pending</Text>
          <Text style={styles.muted}>{completed.length} completed</Text>
          <Text style={styles.muted}>{completed.filter((stop) => stop.shipments.status === 'delivered').length} delivered</Text>
          <ActionButton label="View completed packages" outline onPress={() => { setShowCompleted(true); setTab('Packages'); }} />
        </View> : null}
      </> : <Text style={styles.muted}>Handed-over routes appear here.</Text>}
      <ActionButton label={loading ? 'Refreshing…' : 'Refresh route'} outline disabled={loading} onPress={() => { void refresh(); }} />
    </ScrollView>
    <BottomNav />
  </SafeAreaView>;
}
