import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, Pressable, View } from 'react-native';
import { configured, supabase } from '../courier';
import { useDriver } from '../driver-context';
import { Banner, ActionButton, styles } from '../ui';

export default function Login() {
  const { session, starting } = useDriver();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session) return <Redirect href="/" />;
  async function submit() {
    if (!supabase || busy) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) { setError('Could not sign in. Check your details and connection.'); setPassword(''); }
    } catch { setError('Could not connect. Check your internet and retry.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.login} keyboardShouldPersistTaps="handled">
      <View style={styles.logo}><Text style={styles.logoLetter}>F</Text></View>
      <Text style={styles.eyebrow}>FAST DROP · DRIVER</Text>
      <Text style={styles.title}>Ready for your
next delivery?</Text>
      <Text style={styles.muted}>Your assigned route, AWB scans and delivery proof in one place.</Text>
      {!configured ? <Banner text="Add the Courier Supabase URL and publishable key, then restart Expo." error /> : null}
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
          value={email} onChangeText={setEmail} style={styles.input} placeholder="driver@example.com" />
        <Text style={styles.label}>Password</Text>
        <TextInput accessibilityLabel="Password" autoComplete="current-password" secureTextEntry={!showPassword}
          value={password} onChangeText={setPassword} style={styles.input} placeholder="Password" />
        <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(!showPassword)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.collect}>{showPassword ? 'Hide password' : 'Show password'}</Text></Pressable>
        <Banner text={error} error />
        <ActionButton label={busy ? 'Signing in…' : 'Sign in'} onPress={() => { void submit(); }} disabled={busy || !configured || starting} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

