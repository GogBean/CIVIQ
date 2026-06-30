import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../lib/auth-store';
import '../global.css';

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, loading, initialized, initialize } = useAuthStore();

  // Initialize Auth store listener
  useEffect(() => {
    initialize();
  }, []);

  // Handle redirects based on authentication and onboarding states
  useEffect(() => {
    if (!initialized || loading) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'onboarding';

    if (!session?.user) {
      // Not logged in -> Redirect to Login (but allow signup page too)
      if (segments[0] !== 'login' && segments[0] !== 'signup') {
        router.replace('/login');
      }
    } else if (!profile?.ward_id) {
      // Logged in but profile incomplete -> Redirect to Onboarding
      if (segments[0] !== 'onboarding') {
        router.replace('/onboarding');
      }
    } else if (inAuthGroup) {
      // Logged in and profile complete -> Redirect to Home
      router.replace('/');
    }
  }, [session, profile, loading, initialized, segments]);

  if (!initialized || loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0284c7',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
    </Stack>
  );
}
