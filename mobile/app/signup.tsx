import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';

export default function Signup() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const router = useRouter();

    const handleSignup = async () => {
        if (!name || !email || !password || !confirmPassword) {
            Alert.alert("Missing Information", "Please fill all fields.");
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert("Passwords don't match");
            return;
        }

        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    data: {
                        name,
                    },
                },
            });

            if (error) throw error;

            if (!data.user) {
                throw new Error("Failed to create user.");
            }

            Alert.alert("Success", "Account created!");
            router.replace("/login");

        } catch (error: any) {
            Alert.alert("Signup Failed", error.message);
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


                    {/* Signup Form Card */}
                    <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <View>

                            <Text className="text-xl font-bold text-slate-800 mb-2">
                                Create Account
                            </Text>
                            <Text className="text-slate-400 text-sm mb-6">
                                Create your CIVIQ account
                            </Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4"
                                placeholder="Full Name"
                                value={name}
                                onChangeText={setName}
                                editable={!loading}
                            />
                            <View className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-row items-center mb-4">
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
                                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4"
                                placeholder="Password"
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                                editable={!loading}
                            />
                            <TextInput
                                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6"
                                placeholder="Confirm Password"
                                secureTextEntry
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                editable={!loading}
                            />
                            <TouchableOpacity
                                className="bg-primary rounded-xl py-3.5 items-center shadow-sm"
                                onPress={handleSignup}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text className="text-white font-bold text-base">
                                        Create Account
                                    </Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => router.push('/login')}
                                className="mt-4 items-center"
                            >
                                <Text className="text-primary font-semibold">
                                    Already have an account? Sign in
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
