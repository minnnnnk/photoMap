import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * 공유 기능용 Supabase 클라이언트.
 * 주소와 publishable 키는 .env.local의 EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY에서 읽는다.
 * 값이 없으면 null이고, 공유 기능만 꺼진 채로 앱의 나머지는 그대로 동작한다.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const SHARED_PHOTO_BUCKET = 'shared-photos';

export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          // expo-sqlite가 제공하는 localStorage에 로그인 상태를 보관한다.
          storage: globalThis.localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

/** 공유 기능을 쓰는 곳에서 호출한다. 설정이 없으면 사용자에게 보여 줄 오류를 던진다. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('공유 기능이 설정되지 않았어요 (.env.local 확인)');
  return supabase;
}

// 앱이 화면에 있을 때만 로그인 토큰을 자동으로 갱신한다.
if (supabase) {
  const client = supabase;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
}
