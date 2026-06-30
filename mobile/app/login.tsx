import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(
        "Missing Information",
        "Please enter both email and password."
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      // Navigation is handled automatically by the auth listener in _layout.tsx
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send verification email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-12">
          {/* Brand Header */}
          <View className="items-center mb-10">
            <View className="w-16 h-16 bg-primary rounded-2xl items-center justify-center shadow-md shadow-sky-200 mb-4">
              <Text className="text-white text-3xl font-black">Q</Text>
            </View>
            <Text className="text-3xl font-black text-slate-800 tracking-tight">CIVIQ</Text>
            <Text className="text-slate-500 text-center mt-2 px-6 text-sm">
              Hyperlocal Civic Accountability Platform
            </Text>
          </View>

          {/* Login Form Card */}
          <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <View>
              <Text className="text-xl font-bold text-slate-800 mb-2">
                Get Started
              </Text>

              <Text className="text-slate-400 text-sm mb-6">
                Enter your email and password
              </Text>

              <View className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-row items-center mb-6">
                <Text className="text-slate-500 font-medium mr-2">@</Text>
                <View className="w-[1] h-6 bg-slate-300 mr-3" />

                <TextInput
                  className="flex-1 text-slate-800 font-semibold text-base py-0"
                  placeholder="Enter your email"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                />
              </View>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mt-4"
                placeholder="Password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />

              <TouchableOpacity
                className="bg-primary rounded-xl py-3.5 items-center shadow-sm"
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base">
                    Login
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/signup")}
                className="mt-4 items-center"
              >
                <Text className="text-primary font-semibold">
                  Don't have an account? Create one
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
