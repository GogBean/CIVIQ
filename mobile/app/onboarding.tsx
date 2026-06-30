import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/auth-store';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

interface Ward {
  id: string;
  ward_number: string;
  ward_name: string;
  district: string;
}

export default function Onboarding() {
  const router = useRouter();
  const { profile, updateProfile } = useAuthStore();

  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [wards, setWards] = useState<Ward[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [fetchingWards, setFetchingWards] = useState(true);
  const [detectingGps, setDetectingGps] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWards();
  }, []);

  const fetchWards = async () => {
    try {
      setFetchingWards(true);
      const { data, error } = await supabase
        .from('wards')
        .select('id, ward_number, ward_name, district')
        .order('ward_number');

      if (error) throw error;
      setWards(data || []);
    } catch (error: any) {
      console.error('Error fetching wards:', error);

      Alert.alert(
        "Error",
        JSON.stringify(error, null, 2)
      );
    } finally {
      setFetchingWards(false);
    }
  };

  const handleGpsAutoDetect = async () => {
    setDetectingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Denied',
          'Permission to access location was denied. Please select your ward manually from the list below.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { longitude, latitude } = location.coords;

      // Run RPC function ST_Contains lookup
      const { data: wardId, error } = await supabase.rpc('find_ward_by_location', {
        lon: longitude,
        lat: latitude
      });

      if (error) throw error;

      if (wardId) {
        setSelectedWardId(wardId);
        const detectedWard = wards.find(w => w.id === wardId);
        if (detectedWard) {
          Alert.alert('Ward Detected', `You are located in Ward ${detectedWard.ward_number}: ${detectedWard.ward_name}`);
        } else {
          Alert.alert('Ward Detected', 'We have located your ward successfully.');
        }
      } else {
        Alert.alert(
          'Outside Boundaries',
          'Your location does not match any ward in our database. Please select your ward manually.'
        );
      }
    } catch (error: any) {
      Alert.alert('Detection Failed', 'Failed to detect location. Please select manually.');
      console.error(error);
    } finally {
      setDetectingGps(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!selectedWardId) {
      Alert.alert('Select Ward', 'Please select a ward to continue.');
      return;
    }

    setSaving(true);
    const success = await updateProfile({
      language,
      ward_id: selectedWardId,
    });

    setSaving(false);
    if (success) {
      // Completed, redirect to root index
      router.replace('/');
    } else {
      Alert.alert('Error', 'Failed to save onboarding settings. Please try again.');
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 justify-center px-6 py-12">
        {/* Welcome message */}
        <View className="mb-8">
          <Text className="text-2xl font-black text-slate-800">Welcome to Civiq</Text>
          <Text className="text-slate-400 text-sm mt-1">
            Let's configure your preferences to connect you with your local community.
          </Text>
        </View>

        {/* Form Card */}
        <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
          {/* Language Selection */}
          <View className="mb-8">
            <Text className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
              1. Choose Language / भाषा चुनें
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 py-3.5 rounded-xl border items-center ${language === 'en'
                    ? 'border-primary bg-sky-50'
                    : 'border-slate-200 bg-white'
                  }`}
                onPress={() => setLanguage('en')}
              >
                <Text className={`font-bold ${language === 'en' ? 'text-primary' : 'text-slate-600'}`}>
                  English
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`flex-1 py-3.5 rounded-xl border items-center ${language === 'hi'
                    ? 'border-primary bg-sky-50'
                    : 'border-slate-200 bg-white'
                  }`}
                onPress={() => setLanguage('hi')}
              >
                <Text className={`font-bold ${language === 'hi' ? 'text-primary' : 'text-slate-600'}`}>
                  हिन्दी (Hindi)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Ward Selection */}
          <View className="mb-6">
            <Text className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
              2. Select Your Ward / अपना वार्ड चुनें
            </Text>

            {/* GPS Auto Detect Button */}
            <TouchableOpacity
              className="bg-sky-50 border border-sky-100 rounded-xl py-3 items-center flex-row justify-center mb-6"
              onPress={handleGpsAutoDetect}
              disabled={detectingGps}
            >
              {detectingGps ? (
                <ActivityIndicator color="#0284c7" size="small" />
              ) : (
                <Text className="text-primary font-bold text-sm">
                  🌐 Auto-Detect Ward via GPS
                </Text>
              )}
            </TouchableOpacity>

            <Text className="text-xs text-slate-400 font-semibold mb-3 uppercase tracking-wider">
              Or Choose Manually:
            </Text>

            {fetchingWards ? (
              <ActivityIndicator color="#0284c7" />
            ) : wards.length === 0 ? (
              <Text className="text-slate-400 text-center text-sm py-4">No wards seeded yet.</Text>
            ) : (
              <View className="max-h-60 border border-slate-200 rounded-xl overflow-hidden">
                <ScrollView nestedScrollEnabled={true}>
                  {wards.map((ward) => (
                    <TouchableOpacity
                      key={ward.id}
                      className={`px-4 py-3.5 border-b border-slate-100 flex-row justify-between items-center ${selectedWardId === ward.id ? 'bg-sky-50/50' : ''
                        }`}
                      onPress={() => setSelectedWardId(ward.id)}
                    >
                      <View>
                        <Text className="font-bold text-slate-800">
                          Ward {ward.ward_number}: {ward.ward_name}
                        </Text>
                        <Text className="text-xs text-slate-400">{ward.district}</Text>
                      </View>
                      {selectedWardId === ward.id && (
                        <View className="w-5 h-5 bg-primary rounded-full items-center justify-center">
                          <Text className="text-white text-xs font-bold">✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            className={`rounded-xl py-3.5 items-center mt-4 ${selectedWardId ? 'bg-primary' : 'bg-slate-300'
              }`}
            onPress={handleCompleteOnboarding}
            disabled={!selectedWardId || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">Complete Onboarding</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
