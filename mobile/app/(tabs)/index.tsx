import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../lib/auth-store';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { IssueDetails, Vote, toggleUpvote } from '../../lib/issues';
import * as Location from 'expo-location';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  if (d < 1) {
    return `${Math.round(d * 1000)} m`;
  }
  return `${d.toFixed(1)} km`;
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

export default function Home() {
  const { profile } = useAuthStore();
  const [issues, setIssues] = useState<IssueDetails[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [wardName, setWardName] = useState<string | null>(null);

  // 0. Fetch Ward Name from DB
  useEffect(() => {
    if (!profile?.ward_id) {
      setWardName(null);
      return;
    }
    supabase
      .from('wards')
      .select('ward_number, ward_name')
      .eq('id', profile.ward_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setWardName(`${data.ward_number}: ${data.ward_name}`);
        }
      });
  }, [profile?.ward_id]);

  // 1. Fetch Location
  useEffect(() => {
    const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation(loc);
        }
      } catch (err) {
        // Location is optional for the feed; keep the screen usable without it.
      }
    };
    getUserLocation();
  }, []);

  // 2. Fetch and Subscribe to Issues & Votes
  const fetchIssues = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data || []);
    } catch (err) {
      console.error('Error fetching issues:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVotes = async () => {
    try {
      const { data, error } = await supabase
        .from('issue_votes')
        .select('*')
        .eq('type', 'upvote');

      if (error) throw error;
      setVotes(data || []);
    } catch (err) {
      console.error('Error fetching votes:', err);
    }
  };

  useEffect(() => {
    fetchIssues();
    fetchVotes();

    // Subscribe to realtime issues changes
    const channel = supabase
      .channel('home-feed-realtime')
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
          } else if (payload.eventType === 'DELETE') {
            setIssues((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to realtime votes changes
    const votesChannel = supabase
      .channel('home-votes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'issue_votes',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setVotes((prev) => {
              if (prev.some((v) => v.id === payload.new.id)) return prev;
              return [...prev, payload.new as Vote];
            });
          } else if (payload.eventType === 'DELETE') {
            setVotes((prev) => prev.filter((v) => v.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(votesChannel);
    };
  }, []);

  // 3. Scorecard Metrics
  const stats = useMemo(() => {
    let openCount = 0;
    let resolvedCount = 0;
    let overdueCount = 0;
    const now = new Date();

  issues.forEach((issue) => {
    const isResolved = ['verified_resolved', 'closed'].includes(issue.status);
    const deadline = issue.sla_deadline ? new Date(issue.sla_deadline) : null;
    const isOverdue = !!deadline && deadline < now && !isResolved;

    if (!isResolved) {
      openCount++;
      } else {
        resolvedCount++;
      }

      if (isOverdue) {
        overdueCount++;
      }
    });

    return { openCount, resolvedCount, overdueCount };
  }, [issues]);

  // 4. Upvotes Count and Toggle Status Memo
  const issueVotesMap = useMemo(() => {
    const map: Record<string, { count: number; hasUpvoted: boolean }> = {};
    const userId = profile?.id;

    issues.forEach((issue) => {
      map[issue.id] = { count: 0, hasUpvoted: false };
    });

    votes.forEach((vote) => {
      if (vote.type === 'upvote') {
        if (!map[vote.issue_id]) {
          map[vote.issue_id] = { count: 0, hasUpvoted: false };
        }
        map[vote.issue_id].count++;
        if (userId && vote.user_id === userId) {
          map[vote.issue_id].hasUpvoted = true;
        }
      }
    });

    return map;
  }, [issues, votes, profile?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'open': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'escalated': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'in_progress': return 'bg-sky-50 text-primary border-sky-100';
      case 'pending_verification': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'verified_resolved': return 'bg-teal-50 text-teal-600 border-teal-100';
      case 'closed': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" showsVerticalScrollIndicator={false}>
      {/* Hero Header */}
      <View className="bg-primary px-6 pt-6 pb-12 rounded-b-[40px] shadow-sm shadow-sky-100">
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-white/80 text-xs font-bold uppercase tracking-wider">My Ward</Text>
            <Text className="text-white text-xl font-extrabold">
              {wardName ? `Ward ${wardName}` : profile?.ward_id ? 'Loading Ward...' : 'Ward Not Assigned'}
            </Text>
          </View>
          <View className="flex-row items-center bg-white/10 px-3 py-1.5 rounded-full">
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text className="text-white font-extrabold text-xs ml-1">{profile?.points || 0} pts</Text>
          </View>
        </View>

        {/* Dashboard scorecard */}
        <View className="bg-white rounded-3xl p-5 flex-row justify-between shadow-sm border border-sky-100/10">
          <View className="items-center flex-1">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Ward Open</Text>
            <Text className="text-slate-800 text-2xl font-black">{stats.openCount}</Text>
          </View>
          <View className="w-[1] h-10 bg-slate-100" />
          <View className="items-center flex-1">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Resolved</Text>
            <Text className="text-emerald-600 text-2xl font-black">{stats.resolvedCount}</Text>
          </View>
          <View className="w-[1] h-10 bg-slate-100" />
          <View className="items-center flex-1">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Overdue</Text>
            <Text className="text-red-500 text-2xl font-black">{stats.overdueCount}</Text>
          </View>
        </View>
      </View>

      {/* Main Body */}
      <View className="px-6 -mt-6">
        {/* Quick actions or banners */}
        <View className="bg-sky-50 border border-sky-100 rounded-3xl p-4 flex-row items-center mb-6">
          <View className="w-10 h-10 bg-primary/10 rounded-2xl items-center justify-center mr-3">
            <Ionicons name="megaphone" size={18} color="#0284c7" />
          </View>
          <View className="flex-1">
            <Text className="font-extrabold text-slate-800 text-sm">Need a resolution?</Text>
            <Text className="text-xs text-slate-500">Report a civic issue or upvote existing ones to push for action.</Text>
          </View>
        </View>

        {/* Section Title */}
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-black text-slate-800">Recent Ward Issues</Text>
          <TouchableOpacity onPress={fetchIssues}>
            <Ionicons name="refresh" size={16} color="#0284c7" />
          </TouchableOpacity>
        </View>

        {/* Loading / Empty States */}
        {loading && issues.length === 0 ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color="#0284c7" />
            <Text className="text-slate-400 text-xs font-semibold mt-3">Loading ward feed...</Text>
          </View>
        ) : issues.length === 0 ? (
          <View className="bg-white rounded-3xl p-8 border border-slate-100 items-center justify-center mb-6">
            <View className="w-12 h-12 bg-slate-50 rounded-full items-center justify-center mb-3">
              <Ionicons name="document-text-outline" size={24} color="#94a3b8" />
            </View>
            <Text className="text-slate-700 font-extrabold text-sm mb-1">No issues reported yet</Text>
            <Text className="text-slate-400 text-xs text-center px-4">
              Be the first to report a civic issue in your ward.
            </Text>
          </View>
        ) : (
          /* Issue Cards Feed */
          issues.map((issue) => {
            let distanceStr = '—';
            if (userLocation) {
              const issueCoords = getIssueCoords(issue.location);
              if (issueCoords) {
                distanceStr = getDistance(
                  userLocation.coords.latitude,
                  userLocation.coords.longitude,
                  issueCoords.latitude,
                  issueCoords.longitude
                );
              }
            }

            const voteInfo = issueVotesMap[issue.id] || { count: 0, hasUpvoted: false };

            const handleUpvotePress = async () => {
              if (!profile?.id) return;
              try {
                await toggleUpvote(issue.id, profile.id, voteInfo.hasUpvoted);
              } catch (err) {
                console.error('Failed to toggle upvote:', err);
              }
            };

            return (
              <View 
                key={issue.id}
                className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm mb-4"
              >
                {/* Header info */}
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-row items-center">
                    <View className="bg-slate-100 px-3 py-1 rounded-full mr-2">
                      <Text className="text-slate-600 font-extrabold text-xs">{issue.category}</Text>
                    </View>
                    <Text className="text-slate-400 text-xs">{formatRelativeTime(issue.created_at)}</Text>
                  </View>
                  
                  <View className={`px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${getStatusColor(issue.status)}`}>
                    <Text className="text-[10px] font-black">{issue.status.replace('_', ' ')}</Text>
                  </View>
                </View>

                {/* Description */}
                <Text className="text-slate-700 font-medium text-sm mb-3">
                  {issue.summary || issue.description || 'No description provided.'}
                </Text>

                {/* Location details & Distance */}
                <View className="flex-row justify-between items-center mb-4">
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="location-sharp" size={12} color="#94a3b8" />
                    <Text className="text-slate-400 text-xs ml-1 font-medium" numberOfLines={1}>
                      {issue.ward_id ? `Ward Assigned` : 'Pending Ward'}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="navigate" size={12} color="#0284c7" />
                    <Text className="text-primary text-xs ml-1 font-bold">{distanceStr}</Text>
                  </View>
                </View>

                {/* Severity bar */}
                <View className="flex-row items-center mb-4">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mr-2">Severity:</Text>
                  <View className="flex-row gap-1">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <View 
                        key={lvl}
                        className={`w-6 h-1.5 rounded-full ${
                          lvl <= issue.severity 
                            ? (issue.severity >= 4 ? 'bg-red-500' : 'bg-amber-400') 
                            : 'bg-slate-100'
                        }`}
                      />
                    ))}
                  </View>
                </View>

                <View className="h-[1] bg-slate-100 mb-3" />

                {/* Card footer interaction */}
                <View className="flex-row justify-between items-center">
                  <TouchableOpacity 
                    onPress={handleUpvotePress}
                    className={`flex-row items-center border px-3.5 py-1.5 rounded-full ${
                      voteInfo.hasUpvoted 
                        ? 'bg-primary/10 border-primary/20' 
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <Ionicons 
                      name={voteInfo.hasUpvoted ? "arrow-up" : "arrow-up-outline"} 
                      size={14} 
                      color={voteInfo.hasUpvoted ? "#0284c7" : "#64748b"} 
                    />
                    <Text className={`font-extrabold text-xs ml-1 ${
                      voteInfo.hasUpvoted ? 'text-primary' : 'text-slate-600'
                    }`}>
                      Upvote ({voteInfo.count})
                    </Text>
                  </TouchableOpacity>
                  
                  <View className="flex-row items-center opacity-50">
                    <Ionicons name="chatbubble-outline" size={14} color="#94a3b8" />
                    <Text className="text-slate-500 font-bold text-xs ml-1">Discussion</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
