import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DriverProvider } from '../driver-context';
import { colors } from '../theme';

export default function RootLayout() {
  return <DriverProvider><StatusBar style="light" /><Stack screenOptions={{
    headerStyle: { backgroundColor: colors.darkGreen },
    headerTintColor: '#ffffff',
    contentStyle: { backgroundColor: colors.background },
    headerBackTitle: 'Route',
  }}>
    <Stack.Screen name="index" options={{ title: 'My delivery route' }} />
    <Stack.Screen name="login" options={{ title: 'Driver sign in', headerShown: false }} />
    <Stack.Screen name="scan" options={{ title: 'Scan AWB' }} />
    <Stack.Screen name="stop/[id]" options={{ title: 'Delivery stop' }} />
  </Stack></DriverProvider>;
}
