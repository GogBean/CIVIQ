import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Platform, View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Region } from 'react-native-maps';
import { supabase } from '../../lib/supabase';
import { IssueDetails } from '../../lib/issues';
import * as Location from 'expo-location';

const MapView = Platform.OS === 'web' ? null : require('react-native-maps').default;
const Marker = Platform.OS === 'web' ? null : require('react-native-maps').Marker;

function getCategoryColor(category: string): string {
  switch (category) {
    case 'Pothole': return '#ef4444';
    case 'Water Leakage': return '#3b82f6';
    case 'Streetlight': return '#eab308';
    case 'Waste': return '#854d0e';
    case 'Road Damage': return '#a855f7';
    case 'Flooding': return '#06b6d4';
    default: return '#64748b';
  }
}

function getIssueCoords(location: any): { latitude: number; longitude: number } | null {
  if (!location) return null;
  if (typeof location === 'object' && Array.isArray(location.coordinates)) {
    const [lon, lat] = location.coordinates;
    return { latitude: lat, longitude: lon };
  }
  if (typeof location === 'string') {
    const wktMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wktMatch) {
      return { latitude: parseFloat(wktMatch[2]), longitude: parseFloat(wktMatch[1]) };
    }
  }
  return null;
}

function getDistanceStr(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  if (d < 1) return `${Math.round(d * 1000)} m`;
  return `${d.toFixed(1)} km`;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MapScreen() {
  const mapRef = useRef<any>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [issues, setIssues] = useState<IssueDetails[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<IssueDetails | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  const categories = ['All', 'Pothole', 'Streetlight', 'Waste', 'Water Leakage', 'Flooding', 'Road Damage', 'Other'];

  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation(loc);

          const newRegion = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          };
          setMapRegion(newRegion);
          mapRef.current?.animateToRegion(newRegion, 600);
        }
      } catch {
        // Location is optional for the map; continue without centering.
      }
    };
    getUserLocation();
  }, []);

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const { data, error } = await supabase.from('issues').select('*');
        if (error) throw error;
        setIssues(data || []);
      } catch (err) {
        console.error('Error loading issues for map:', err);
      }
    };

    fetchIssues();

    const channel = supabase
      .channel('map-realtime-issues')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'issues',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setIssues((prev) => [payload.new as IssueDetails, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setIssues((prev) =>
              prev.map((item) => (item.id === payload.new.id ? (payload.new as IssueDetails) : item))
            );
            setSelectedIssue((prev) =>
              prev?.id === payload.new.id ? (payload.new as IssueDetails) : prev
            );
          } else if (payload.eventType === 'DELETE') {
            setIssues((prev) => prev.filter((item) => item.id !== payload.old.id));
            setSelectedIssue((prev) => (prev?.id === payload.old.id ? null : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredIssues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...issues]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((issue) => activeCategory === 'All' || issue.category === activeCategory)
      .filter((issue) => {
        if (!query) return true;
        const searchable = [
          issue.category,
          issue.status.replace(/_/g, ' '),
          issue.summary || '',
          issue.description || '',
          issue.ward_id || '',
        ].join(' ').toLowerCase();
        return searchable.includes(query);
      });
  }, [issues, activeCategory, searchQuery]);

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.coords.latitude,
          longitude: userLocation.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        600
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'open': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'escalated': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'in_progress': return 'bg-sky-50 text-primary border-sky-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const selectedDistanceStr = useMemo(() => {
    if (!selectedIssue || !userLocation) return '—';
    const coords = getIssueCoords(selectedIssue.location);
    if (!coords) return '—';
    return getDistanceStr(
      userLocation.coords.latitude,
      userLocation.coords.longitude,
      coords.latitude,
      coords.longitude
    );
  }, [selectedIssue, userLocation]);

  return (
    <View className="flex-1 bg-slate-100">
      <View className="flex-[0.54] relative">
        {MapView && Marker ? (
          <MapView
            ref={mapRef}
            className="flex-1"
            region={mapRegion}
            onRegionChangeComplete={setMapRegion}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {filteredIssues.map((issue) => {
              const coords = getIssueCoords(issue.location);
              if (!coords) return null;

              return (
                <Marker
                  key={issue.id}
                  coordinate={coords}
                  onPress={() => setSelectedIssue(issue)}
                >
                  <View
                    className="items-center justify-center p-1.5 rounded-full shadow-md border-2 border-white"
                    style={{ backgroundColor: getCategoryColor(issue.category) }}
                  >
                    <Text className="text-white text-[10px] font-black px-1 py-0.5">
                      {issue.severity || 3}
                    </Text>
                  </View>
                </Marker>
              );
            })}
          </MapView>
        ) : (
          <View className="flex-1 items-center justify-center bg-slate-200 px-8">
            <Ionicons name="map-outline" size={36} color="#94a3b8" />
            <Text className="text-slate-700 font-black text-base mt-3 text-center">Map preview is unavailable on web</Text>
            <Text className="text-slate-500 text-xs text-center mt-2 leading-5">
              Browse the latest reports below and use search to filter the feed.
            </Text>
          </View>
        )}

        <View className="absolute top-4 left-4 right-4 z-10">
          <View className="bg-white rounded-2xl shadow-md border border-slate-100 px-4 py-3 mb-2">
            <View className="flex-row items-center">
              <Ionicons name="search" size={18} color="#94a3b8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search reports..."
                placeholderTextColor="#94a3b8"
                className="flex-1 text-slate-700 text-sm ml-2 py-0"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} className="ml-2">
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-row"
            contentContainerStyle={{ gap: 8 }}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                className={`px-4 py-2 rounded-full shadow-sm border ${
                  activeCategory === cat
                    ? 'bg-primary border-primary'
                    : 'bg-white border-slate-100'
                }`}
                onPress={() => setActiveCategory(cat)}
              >
                <Text className={`text-xs font-bold ${activeCategory === cat ? 'text-white' : 'text-slate-600'}`}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View className="absolute bottom-6 right-4 gap-3 z-10">
          <TouchableOpacity
            className="w-12 h-12 bg-white border border-slate-100 rounded-2xl shadow-md items-center justify-center"
            onPress={centerOnUser}
          >
            <Ionicons name="locate" size={20} color="#0284c7" />
          </TouchableOpacity>
        </View>

        {selectedIssue && (
          <View className="absolute bottom-6 left-4 right-20 bg-white border border-slate-100 rounded-3xl p-5 shadow-lg z-20 flex-row">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center justify-between mb-2">
                <View className="bg-slate-100 px-2.5 py-0.5 rounded-full mr-2">
                  <Text className="text-slate-600 font-extrabold text-[10px] uppercase">
                    {selectedIssue.category}
                  </Text>
                </View>
                <View className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${getStatusColor(selectedIssue.status)}`}>
                  <Text className="text-[9px] font-black">{selectedIssue.status.replace('_', ' ')}</Text>
                </View>
              </View>

              <Text className="text-slate-700 font-medium text-xs mb-3 leading-4" numberOfLines={2}>
                {selectedIssue.summary || selectedIssue.description || 'No description provided.'}
              </Text>

              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Text className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mr-1.5">Severity:</Text>
                  <View className="flex-row gap-0.5">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <Ionicons
                        key={lvl}
                        name="star"
                        size={10}
                        color={lvl <= (selectedIssue.severity || 3) ? '#f59e0b' : '#cbd5e1'}
                      />
                    ))}
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="navigate" size={10} color="#0284c7" />
                  <Text className="text-primary text-[10px] ml-1 font-extrabold">{selectedDistanceStr}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              className="w-7 h-7 bg-slate-50 border border-slate-100 rounded-full items-center justify-center self-start"
              onPress={() => setSelectedIssue(null)}
            >
              <Ionicons name="close" size={14} color="#64748b" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View className="flex-1 bg-white border-t border-slate-100">
        <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-lg font-black text-slate-800">Latest Reports</Text>
            <Text className="text-slate-400 text-xs mt-1">
              {filteredIssues.length} report{filteredIssues.length === 1 ? '' : 's'} shown
            </Text>
          </View>
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Feed
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          {filteredIssues.length > 0 ? (
            filteredIssues.map((issue) => {
              const coords = getIssueCoords(issue.location);
              const distance =
                coords && userLocation
                  ? getDistanceStr(
                      userLocation.coords.latitude,
                      userLocation.coords.longitude,
                      coords.latitude,
                      coords.longitude
                    )
                  : null;

              return (
                <TouchableOpacity
                  key={issue.id}
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-3"
                  onPress={() => setSelectedIssue(issue)}
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-1 pr-3">
                      <Text className="text-slate-800 font-black text-sm" numberOfLines={1}>
                        {issue.category}
                      </Text>
                      <Text className="text-slate-400 text-[11px] mt-1">
                        {formatRelativeTime(issue.created_at)}
                      </Text>
                    </View>
                    <View className={`px-2 py-0.5 rounded-full border ${getStatusColor(issue.status)}`}>
                      <Text className="text-[10px] font-black uppercase">
                        {issue.status.replace('_', ' ')}
                      </Text>
                    </View>
                  </View>

                  <Text className="text-slate-600 text-sm leading-5 mb-3" numberOfLines={2}>
                    {issue.summary || issue.description || 'No description provided.'}
                  </Text>

                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text className="text-slate-700 text-xs font-bold ml-1">
                        {issue.severity || 3}/5
                      </Text>
                    </View>
                    <Text className="text-primary text-xs font-bold">
                      {distance || (issue.ward_id ? 'Ward assigned' : 'Pending ward')}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View className="bg-slate-50 border border-slate-100 rounded-2xl p-6 items-center">
              <Ionicons name="search-outline" size={24} color="#94a3b8" />
              <Text className="text-slate-800 font-bold text-sm mt-3">No reports match your filters</Text>
              <Text className="text-slate-400 text-xs text-center mt-1">
                Try a different keyword or switch categories.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
