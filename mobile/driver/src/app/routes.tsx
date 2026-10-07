import { useState } from 'react';
import { Redirect,router } from 'expo-router';
import { Linking,Platform,ScrollView,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import assets from '../map-assets.json';
import { useDriver } from '../driver-context';
import { suggestOrder,validPoint,mapHtml,navigationUrl } from '../route-tools';
import { ActionButton,Banner,BottomNav,styles } from '../ui';
export default function Routes() {
 const {session,profile,routes,stops,routeError,loading,refresh}=useDriver();const [selected,setSelected]=useState<number|null>(null);const [suggested,setSuggested]=useState(false);const [mapError,setMapError]=useState(false);
 if(!session)return <Redirect href="/login"/>;if(!profile)return <Redirect href="/"/>;
 const active=selected!==null?routes.find(r=>r.id===selected):routes[0];const assigned=stops.filter(s=>s.run_id===active?.id);
 const points=assigned.filter(s=>validPoint(s.shipments.delivery_latitude,s.shipments.delivery_longitude)).map(s=>({id:s.id,latitude:s.shipments.delivery_latitude!,longitude:s.shipments.delivery_longitude!,awb:s.shipments.tracking_number,stop:s}));
 const ordered=suggested?suggestOrder(points):points;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
  <Text style={styles.eyebrow}>PLAN YOUR STOPS</Text><Text style={styles.title}>My route</Text><Text style={styles.muted}>Dispatch order is the saved route. Open navigation for driving directions.</Text>
  <View style={styles.chips}>{routes.map(r=><ActionButton key={r.id} label={r.run_number} outline={active?.id!==r.id} onPress={()=>{setSelected(r.id);setSuggested(false);setMapError(false);}}/>)}</View>
  <Banner text={routeError} error/>{mapError?<Banner text="Map could not load. Check connection; the stop list and navigation are still available." error/>:null}
  {points.length && Platform.OS!=='web'?<View style={[styles.cameraFrame,{marginTop:18,height:320}]}><WebView key={String(active?.id)+String(suggested)} source={{html:mapHtml(ordered,assets),baseUrl:'https://www.openstreetmap.org'}} originWhitelist={['*']} onError={()=>setMapError(true)} onHttpError={()=>setMapError(true)} onShouldStartLoadWithRequest={r=>r.url==='about:blank'||r.url.startsWith('data:')||r.url==='https://www.openstreetmap.org/'||r.url==='https://www.openstreetmap.org'} /></View>:<View style={styles.card}><Text style={styles.muted}>{points.length?'Map preview is available in the Android app.':'No mapped delivery stops. Contact dispatch to map these addresses.'}</Text></View>}
  <Text style={[styles.mutedSmall,{marginTop:10}]}>{points.length} mapped · {assigned.length-points.length} awaiting coordinates</Text>
  <ActionButton label={suggested?'Use dispatch order':'Suggest nearby stop order'} outline disabled={points.length<2} onPress={()=>setSuggested(!suggested)}/>
  {suggested?<Text style={styles.mutedSmall}>Distance-based suggestion from the first mapped stop. It does not change dispatch records or calculate road traffic.</Text>:null}
  {ordered.map((p,i)=><View key={p.id} style={styles.card}><Text style={styles.caption}>STOP {i+1}</Text><Text style={styles.awb}>{p.awb}</Text><Text style={styles.person}>{p.stop.shipments.consignee_name}</Text><Text style={styles.muted}>{p.stop.shipments.consignee_address}, {p.stop.shipments.consignee_city}</Text><ActionButton label="Navigate" onPress={()=>{void Linking.openURL(navigationUrl([p.stop.shipments.consignee_address,p.stop.shipments.consignee_city,p.stop.shipments.consignee_country_code].filter(Boolean).join(', ')));}}/><ActionButton label="Open delivery" outline onPress={()=>router.push({pathname:'/stop/[id]',params:{id:String(p.id)}})}/></View>)}
  <ActionButton label={loading?'Refreshing…':'Refresh route'} outline disabled={loading} onPress={()=>{void refresh();}}/>
 </ScrollView><BottomNav/></SafeAreaView>;
}
