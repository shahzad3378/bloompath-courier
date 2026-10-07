import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { Merriweather_700Bold } from '@expo-google-fonts/merriweather/700Bold';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DriverProvider } from '../driver-context';
import { colors } from '../theme';

export default function RootLayout() {
  const [ready, fontError] = useFonts({ DMSans_400Regular, Merriweather_700Bold, ...Feather.font });
  if (!ready && !fontError) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.green} /></View>;
  return <DriverProvider><StatusBar style="dark" /><Stack screenOptions={{
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.ink,
    contentStyle: { backgroundColor: colors.background },
    headerBackTitle: 'Route',
  }}>
    <Stack.Screen name="index" options={{ title: 'Fast Drop', headerShown: false }} />
    <Stack.Screen name="routes" options={{ title: 'My routes', headerShown: false }} />
    <Stack.Screen name="profile" options={{ title: 'Driver profile', headerShown: false }} />
    <Stack.Screen name="login" options={{ title: 'Driver sign in', headerShown: false }} />
    <Stack.Screen name="scan" options={{ title: 'Scan AWB' }} />
    <Stack.Screen name="stop/[id]" options={{ title: 'Delivery stop' }} />
  </Stack></DriverProvider>;
}

