import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuthStore } from '../../lib/auth-store';
import { Ionicons } from '@expo/vector-icons';

export default function Profile() {
  const { profile, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out from Civiq?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ]
    );
  };

  const mockBadges = [
    { id: '1', title: 'Road Warrior', desc: 'Reported 10 potholes', icon: 'car-sport', color: 'bg-amber-100 text-amber-700' },
    { id: '2', title: 'Water Watch', desc: 'Reported 5 water leaks', icon: 'water', color: 'bg-sky-100 text-sky-700' },
    { id: '3', title: 'Streak', desc: 'Active for 7 straight days', icon: 'flash', color: 'bg-orange-100 text-orange-700' },
  ];

  return (
    <ScrollView className="flex-1 bg-slate-50" showsVerticalScrollIndicator={false}>
      <View className="bg-white px-6 py-8 items-center border-b border-slate-100 mb-6">
        <View className="w-20 h-20 bg-slate-100 rounded-full items-center justify-center mb-4 border-2 border-slate-200">
          <Ionicons name="person" size={40} color="#64748b" />
        </View>
        <Text className="text-xl font-black text-slate-800">{profile?.phone || 'No Phone Number'}</Text>
        <Text className="text-slate-400 text-xs mt-1">Citizen (Reporter)</Text>
      </View>

      <View className="px-6 gap-6">
        <View className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Ward Configuration</Text>

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="w-8 h-8 bg-sky-50 rounded-xl items-center justify-center mr-3">
                <Ionicons name="business" size={16} color="#0284c7" />
              </View>
              <View>
                <Text className="font-bold text-slate-800 text-sm">Assigned Ward</Text>
                <Text className="text-slate-400 text-xs">Ward 4: HSR Layout</Text>
              </View>
            </View>
            <View className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Text className="text-slate-500 font-bold text-xs">Auto-assigned</Text>
            </View>
          </View>
        </View>

        <View className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            Points & Badges (Placeholder)
          </Text>

          <View className="flex-row items-center bg-amber-50/50 border border-amber-100/50 rounded-2xl p-4 mb-4">
            <View className="w-10 h-10 bg-amber-100 rounded-full items-center justify-center mr-3">
              <Ionicons name="trophy" size={20} color="#f59e0b" />
            </View>
            <View>
              <Text className="text-amber-800 font-extrabold text-base">Earned Score: {profile?.points || 0} Points</Text>
              <Text className="text-amber-600 text-xs font-medium">Contribute more reports to earn badges!</Text>
            </View>
          </View>

          <View className="gap-3">
            {mockBadges.map((badge) => (
              <View key={badge.id} className="flex-row items-center justify-between py-2 border-b border-slate-50">
                <View className="flex-row items-center">
                  <View className={`w-8 h-8 rounded-xl items-center justify-center mr-3 ${badge.color}`}>
                    <Ionicons name={badge.icon as any} size={16} color="currentColor" />
                  </View>
                  <View>
                    <Text className="font-bold text-slate-800 text-sm">{badge.title}</Text>
                    <Text className="text-slate-400 text-xs">{badge.desc}</Text>
                  </View>
                </View>
                <Ionicons name="checkmark-circle-sharp" size={18} color="#059669" />
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          className="bg-red-50 border border-red-100 rounded-3xl py-4 items-center flex-row justify-center mb-10"
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color="#ef4444" className="mr-2" />
          <Text className="text-red-500 font-black text-sm ml-1.5">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
