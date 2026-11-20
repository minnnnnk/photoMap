import { requireSupabase, SHARED_PHOTO_BUCKET } from './supabase';

/**
 * 공유 사진은 비공개 버킷에 있어서, 볼 때마다 기한이 있는 서명 URL을 받아야 한다.
 * 같은 사진에 같은 URL을 쓰면 이미지 캐시가 재사용되므로, 기한이 남은 URL은 메모리에 보관해 다시 쓴다.
 */
const EXPIRES_IN_SECONDS = 60 * 60 * 24;
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const missing = [...new Set(paths)].filter((p) => {
    const hit = cache.get(p);
    return !hit || hit.expiresAt - REFRESH_MARGIN_MS < now;
  });

  if (missing.length > 0) {
    const { data, error } = await requireSupabase()
      .storage.from(SHARED_PHOTO_BUCKET)
      .createSignedUrls(missing, EXPIRES_IN_SECONDS);
    if (error) throw error;
    for (const item of data) {
      if (item.path && item.signedUrl) {
        cache.set(item.path, { url: item.signedUrl, expiresAt: now + EXPIRES_IN_SECONDS * 1000 });
      }
    }
  }

  const result = new Map<string, string>();
  for (const p of paths) {
    const hit = cache.get(p);
    if (hit) result.set(p, hit.url);
  }
  return result;
}

/** 지운 사진의 URL을 캐시에서 뺀다. */
export function forgetSignedUrls(paths: string[]): void {
  for (const p of paths) cache.delete(p);
}
