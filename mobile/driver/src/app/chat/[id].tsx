import { useCallback,useRef,useState } from 'react';
import { Redirect,useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadMessages,sendMessage } from '../../driver-features';
import { useDriverQuery } from '../../use-driver-query';
import { useDriver } from '../../driver-context';
import { ActionButton,Banner,styles } from '../../ui';
import { colors } from '../../theme';
export default function Chat(){const {id}=useLocalSearchParams<{id:string}>();const {session,profile}=useDriver();const q=useDriverQuery(useCallback(()=>loadMessages(id),[id]));const [body,setBody]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const key=useRef(Crypto.randomUUID());if(!session)return <Redirect href="/login"/>;if(!profile)return <Redirect href="/"/>;
async function send(){if(!profile||busy||!body.trim())return;setBusy(true);setError(null);try{await sendMessage(profile,id,key.current,body);key.current=Crypto.randomUUID();setBody('');await q.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
return <SafeAreaView style={styles.safe} edges={['left','right','bottom']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Text style={styles.title}>Your conversation</Text><Text style={styles.mutedSmall}>Latest 200 messages. Refresh to check for replies.</Text><Banner text={q.error||error} error/>{q.data?.map(m=><View key={m.id} style={[styles.card,{backgroundColor:m.author_id===profile.id?colors.paleGreen:colors.surface}]}><Text style={styles.caption}>{m.author_id===profile.id?'YOU':'DISPATCH'}</Text><Text style={styles.muted}>{m.body}</Text><Text style={styles.mutedSmall}>{new Date(m.created_at).toLocaleString()}</Text></View>)}<ActionButton label="Refresh replies" outline disabled={q.loading} onPress={()=>{void q.refresh();}}/><Text style={styles.label}>Message</Text><TextInput accessibilityLabel="Message to dispatch" multiline value={body} onChangeText={setBody} maxLength={2000} editable={!busy} style={[styles.input,styles.notes]} placeholder="Include a preferred date/time for a reattempt request."/><ActionButton label={busy?'Sending…':'Send message'} disabled={busy||!body.trim()} onPress={()=>{void send();}}/></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
