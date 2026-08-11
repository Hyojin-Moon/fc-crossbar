import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { loginIdToEmail } from '@/lib/login-id';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export type SignUpInput = {
  loginId: string;
  password: string;
  name: string;
  phone?: string;
};

type AuthContextValue = {
  /** 최초 세션 복원이 끝났는지. false 인 동안은 스플래시를 유지한다. */
  initializing: boolean;
  session: Session | null;
  profile: Profile | null;
  /** 세션은 있는데 profiles 행을 아직 못 읽은 상태 */
  profileLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signIn: (loginId: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!mounted.current) return;
    if (error) {
      console.warn('[auth] 프로필 조회 실패:', error.message);
      setProfile(null);
    } else {
      setProfile(data ?? null);
    }
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;

    // 1) 저장된 세션 복원 (자동 로그인). 만료되었으면 supabase-js 가 refresh 를 시도한다.
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted.current) return;
        setSession(data.session);
        if (data.session) await loadProfile(data.session.user.id);
      })
      .finally(() => {
        if (mounted.current) setInitializing(false);
      });

    // 2) 이후 로그인/로그아웃/토큰갱신을 구독.
    //    refresh 가 최종 실패하면 SIGNED_OUT 이 와서 로그인 화면으로 되돌아간다.
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted.current) return;
      setSession(nextSession);

      if (!nextSession) {
        setProfile(null);
        return;
      }
      // TOKEN_REFRESHED 마다 다시 읽을 필요는 없다.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void loadProfile(nextSession.user.id);
      }
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (loginId: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(loginId),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: loginIdToEmail(input.loginId),
      password: input.password,
      // handle_new_user 트리거가 이 값으로 profiles 행을 만든다.
      options: {
        data: {
          name: input.name.trim(),
          phone: input.phone?.trim() ?? '',
        },
      },
    });
    if (error) throw error;
    // 이메일 확인이 켜져 있으면 session 이 null 로 온다.
    return { needsEmailConfirm: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await loadProfile(session.user.id);
  }, [session?.user.id, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      profile,
      profileLoading,
      isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
      isSuperAdmin: profile?.role === 'super_admin',
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [initializing, session, profile, profileLoading, signIn, signUp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
