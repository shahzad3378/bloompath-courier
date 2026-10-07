import { useCallback,useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator,ScrollView,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDriver } from '../driver-context';
import { loadHistory } from '../driver-features';
import { useDriverQuery } from '../use-driver-query';
import { ActionButton,Banner,Pager,styles } from '../ui';
export default function History(){const {session,profile}=useDriver();const [page,setPage]=useState(0);const [kind,setKind]=useState('all');const query=useDriverQuery(useCallback(p=>loadHistory(p,page,kind),[page,kind]));if(!session)return <Redirect href="/login"/>;if(!profile)return <Redirect href="/"/>;
return <SafeAreaView style={styles.safe} edges={['left','right','bottom']}><ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>My history</Text><Text style={styles.muted}>Completed delivery attempts and seller returns.</Text><View style={styles.chips}>{['all','delivered','undelivered'].map(k=><ActionButton key={k} label={k==='all'?'All attempts':k==='delivered'?'Delivered':'Failed'} outline={kind!==k} onPress={()=>{setKind(k);setPage(0);}}/>)}</View><Banner text={query.error} error/>{query.loading?<ActivityIndicator/>:null}<ActionButton label="Refresh history" outline disabled={query.loading} onPress={()=>{void query.refresh();}}/>
{query.data?.attempts.map(a=><View key={a.id} style={styles.card}><Text style={styles.awb}>{a.shipments?.tracking_number}</Text><Text style={styles.person}>{a.shipments?.consignee_name}</Text><Text style={styles.collect}>{a.outcome==='delivered'?'Delivered':a.undelivered_reason==='reschedule_requested'?'Reschedule requested':'Failed'}</Text>{a.undelivered_reason?<Text style={styles.muted}>{a.undelivered_reason.replaceAll('_',' ')}</Text>:null}<Text style={styles.mutedSmall}>Attempt {a.attempt_number} · {new Date(a.created_at).toLocaleString()}</Text></View>)}
{query.data?.returns.map(a=><View key={'return'+a.id} style={styles.card}><Text style={styles.awb}>{a.shipments?.tracking_number}</Text><Text style={styles.person}>{a.shipments?.sender_name}</Text><Text style={styles.collect}>Returned to seller</Text><Text style={styles.mutedSmall}>{new Date(a.completed_at).toLocaleString()}</Text></View>)}
{query.data&&!query.data.attempts.length&&!query.data.returns.length?<View style={styles.empty}><Text style={styles.person}>No records in this view</Text><Text style={styles.muted}>Completed work will appear here after it is saved.</Text></View>:null}{query.data?<Pager page={page} count={Math.max(query.data.count,query.data.returnCount)} onChange={setPage}/>:null}</ScrollView></SafeAreaView>;
}
