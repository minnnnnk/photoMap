import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { requireSupabase, supabase } from './supabase';

export type Profile = {
  id: string;
  nickname: string;
};

type AuthContextValue = {
  /** .env.local에 Supabase 설정이 있는지 */
  configured: boolean;
  /** 저장된 로그인 상태를 읽는 중 */
  loading: boolean;
  session: Session | null;
  /** 닉네임을 아직 정하지 않았으면 null */
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  saveNickname: (nickname: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const MAX_NICKNAME = 20;
/** Supabase 기본 최소 비밀번호 길이 */
export const MIN_PASSWORD = 6;

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, nickname')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabase != null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const client = supabase;

    const apply = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        return;
      }
      try {
        const p = await fetchProfile(next.user.id);
        if (active) setProfile(p);
      } catch (e) {
        console.warn('프로필 불러오기 실패', e);
      }
    };

    client.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .finally(() => active && setLoading(false));

    const { data } = client.auth.onAuthStateChange((event, next) => {
      // 토큰 갱신 때는 사용자가 같으므로 프로필을 다시 읽지 않는다.
      if (event === 'TOKEN_REFRESHED') {
        setSession(next);
        return;
      }
      // 콜백 안에서 Supabase를 바로 다시 부르면 막힐 수 있어 다음 틱으로 미룬다.
      setTimeout(() => apply(next), 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await requireSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  // Supabase에서 이메일 확인(Confirm email)을 꺼 두어 메일 없이 바로 로그인된다.
  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error('가입은 됐지만 이메일 확인이 필요하다고 나와요. Supabase에서 Confirm email 설정을 확인해 주세요.');
    }
  }, []);

  const saveNickname = useCallback(
    async (nickname: string) => {
      const trimmed = nickname.trim();
      if (!trimmed) throw new Error('닉네임을 적어 주세요');
      if (!session) throw new Error('먼저 로그인해 주세요');
      const { data, error } = await requireSupabase()
        .from('profiles')
        .upsert({ id: session.user.id, nickname: trimmed.slice(0, MAX_NICKNAME) })
        .select('id, nickname')
        .single();
      if (error) throw error;
      setProfile(data);
    },
    [session],
  );

  const signOut = useCallback(async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: supabase != null,
      loading,
      session,
      profile,
      signIn,
      signUp,
      saveNickname,
      signOut,
    }),
    [loading, session, profile, signIn, signUp, saveNickname, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있어요');
  return value;
}
