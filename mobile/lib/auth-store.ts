import { create } from 'zustand';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  ward_id: string | null;
  language: string;
  points: number;
  push_token: string | null;
}

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: Session | null) => void;
  loadProfile: (userId: string) => Promise<UserProfile | null>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  setSession: (session) => {
    set({ session });
    if (session?.user) {
      get().loadProfile(session.user.id);
    } else {
      set({ profile: null, loading: false });
    }
  },

  loadProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      set({ profile: data, loading: false });
      return data;
    } catch (err) {
      console.error('Error loading user profile:', err);
      set({ loading: false });
      return null;
    }
  },

  updateProfile: async (updates) => {
    const profile = get().profile;
    if (!profile) return false;

    try {
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', profile.id);

      if (error) throw error;
      set({ profile: { ...profile, ...updates } });
      return true;
    } catch (err) {
      console.error('Error updating user profile:', err);
      return false;
    }
  },

  signOut: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    set({ session: null, profile: null, loading: false });
  },

  initialize: async () => {
    if (get().initialized) return;

    // Listen to auth state changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      get().setSession(session);
    });

    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    set({ session, initialized: true });
    if (session?.user) {
      await get().loadProfile(session.user.id);
    } else {
      set({ loading: false });
    }
  },
}));
