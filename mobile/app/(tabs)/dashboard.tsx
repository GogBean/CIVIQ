import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { IssueDetails } from '../../lib/issues';
import { Ionicons } from '@expo/vector-icons';

export default function Dashboard() {
  const [issues, setIssues] = useState<IssueDetails[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch & Subscribe to Issues
  const fetchIssues = async () => {
    try {
      const { data, error } = await supabase.from('issues').select('*');
      if (error) throw error;
      setIssues(data || []);
    } catch (err) {
      console.error('Error fetching dashboard issues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();

    const channel = supabase
      .channel('dashboard-realtime')
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. Calculations
  const stats = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let resolved = 0;
    let escalated = 0;
    let overdue = 0;
    let totalResolutionTimeMs = 0;
    let resolvedWithDurationCount = 0;
    const now = new Date();

    const categoryCounts: Record<string, number> = {
      Pothole: 0,
      'Water Leakage': 0,
      Streetlight: 0,
      Waste: 0,
      'Road Damage': 0,
      Flooding: 0,
      Other: 0,
    };

    issues.forEach((issue) => {
      // Increment category count
      const cat = issue.category in categoryCounts ? issue.category : 'Other';
      categoryCounts[cat]++;

      // Status count
      switch (issue.status) {
        case 'pending':
        case 'open':
          open++;
          break;
        case 'in_progress':
          inProgress++;
          break;
        case 'pending_verification':
        case 'verified_resolved':
        case 'closed':
          resolved++;
          break;
        case 'escalated':
          escalated++;
          break;
      }

      // Overdue Check
      const isResolved = ['verified_resolved', 'closed'].includes(issue.status);
      const deadline = issue.sla_deadline ? new Date(issue.sla_deadline) : null;
      const isOverdue = !!deadline && deadline < now && !isResolved;
      if (isOverdue) {
        overdue++;
      }

      // Resolution Time Check
      if (isResolved && issue.resolved_at) {
        const created = new Date(issue.created_at).getTime();
        const resolvedAt = new Date(issue.resolved_at).getTime();
        const duration = resolvedAt - created;
        if (duration > 0) {
          totalResolutionTimeMs += duration;
          resolvedWithDurationCount++;
        }
      }
    });

    // Avg Resolution Time in Hours
    let avgResolutionTimeStr = '—';
    if (resolvedWithDurationCount > 0) {
      const avgHours = totalResolutionTimeMs / (1000 * 60 * 60) / resolvedWithDurationCount;
      if (avgHours < 24) {
        avgResolutionTimeStr = `${avgHours.toFixed(1)} hrs`;
      } else {
        const avgDays = avgHours / 24;
        avgResolutionTimeStr = `${avgDays.toFixed(1)} days`;
      }
    }

    // Prepare Category Data
    const categoryData = Object.keys(categoryCounts).map((key) => ({
      category: key,
      count: categoryCounts[key],
    })).sort((a, b) => b.count - a.count);

    return {
      open,
      inProgress,
      resolved,
      escalated,
      overdue,
      avgResolutionTimeStr,
      categoryData,
    };
  }, [issues]);

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0284c7" />
        <Text className="text-slate-400 text-xs font-semibold mt-3">Loading ward dashboard...</Text>
      </View>
    );
  }

  // Find max category count for chart scaling
  const maxCategoryCount = Math.max(...stats.categoryData.map((d) => d.count), 1);

  return (
    <ScrollView className="flex-1 bg-slate-50" showsVerticalScrollIndicator={false}>
      <View className="p-6 gap-6">
        
        {/* Top Header Card */}
        <View className="bg-primary rounded-3xl p-5 shadow-sm">
          <Text className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Ward 4 Overview</Text>
          <Text className="text-white text-2xl font-black mb-4">Performance Dashboard</Text>
          
          <View className="flex-row justify-between bg-white/10 rounded-2xl p-4">
            <View className="items-center flex-1">
              <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider mb-1">Avg Resolution</Text>
              <Text className="text-white text-lg font-black">{stats.avgResolutionTimeStr}</Text>
            </View>
            <View className="w-[1] bg-white/20 h-8 self-center" />
            <View className="items-center flex-1">
              <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider mb-1">Overdue Issues</Text>
              <Text className="text-red-300 text-lg font-black">{stats.overdue}</Text>
            </View>
          </View>
        </View>

        {/* Status Count Grid */}
        <View className="flex-row flex-wrap gap-4">
          {/* Open */}
          <View className="bg-white rounded-3xl border border-slate-100 p-4 flex-1 min-w-[45%] shadow-sm">
            <View className="w-8 h-8 bg-amber-50 rounded-xl items-center justify-center mb-3">
              <Ionicons name="folder-open" size={16} color="#d97706" />
            </View>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Open</Text>
            <Text className="text-slate-800 text-xl font-black">{stats.open}</Text>
          </View>

          {/* In Progress */}
          <View className="bg-white rounded-3xl border border-slate-100 p-4 flex-1 min-w-[45%] shadow-sm">
            <View className="w-8 h-8 bg-sky-50 rounded-xl items-center justify-center mb-3">
              <Ionicons name="git-branch" size={16} color="#0284c7" />
            </View>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">In Progress</Text>
            <Text className="text-slate-800 text-xl font-black">{stats.inProgress}</Text>
          </View>

          {/* Resolved */}
          <View className="bg-white rounded-3xl border border-slate-100 p-4 flex-1 min-w-[45%] shadow-sm">
            <View className="w-8 h-8 bg-emerald-50 rounded-xl items-center justify-center mb-3">
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
            </View>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Resolved</Text>
            <Text className="text-slate-800 text-xl font-black">{stats.resolved}</Text>
          </View>

          {/* Escalated */}
          <View className="bg-white rounded-3xl border border-slate-100 p-4 flex-1 min-w-[45%] shadow-sm">
            <View className="w-8 h-8 bg-rose-50 rounded-xl items-center justify-center mb-3">
              <Ionicons name="warning" size={16} color="#e11d48" />
            </View>
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Escalated</Text>
            <Text className="text-slate-800 text-xl font-black">{stats.escalated}</Text>
          </View>
        </View>

        {/* Category breakdown bar chart */}
        <View className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Category Distribution</Text>
          
          <View className="gap-4">
            {stats.categoryData.map((item) => {
              const percentage = Math.round((item.count / maxCategoryCount) * 100);
              
              return (
                <View key={item.category}>
                  <View className="flex-row justify-between items-center mb-1.5">
                    <Text className="text-xs font-bold text-slate-700">{item.category}</Text>
                    <Text className="text-xs font-extrabold text-slate-500">{item.count}</Text>
                  </View>
                  <View className="bg-slate-100 rounded-full h-2 overflow-hidden w-full">
                    <View 
                      className="bg-primary h-2 rounded-full" 
                      style={{ width: `${percentage}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

      </View>
    </ScrollView>
  );
}
