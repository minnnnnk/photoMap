import type { Coord } from './types';

type Exif = Record<string, unknown> | null | undefined;

/**
 * expo-image-picker가 주는 EXIF의 GPS 값 형태 (SDK 58 네이티브 코드 기준)
 * - iOS: GPSLatitude/GPSLongitude는 부호 없는 숫자, 방향은 GPSLatitudeRef('N'|'S'), GPSLongitudeRef('E'|'W')
 * - Android: GPSLatitude/GPSLongitude는 이미 부호가 붙은 십진수, Ref도 함께 올 수 있음
 * 그래서 Ref가 있으면 Ref로 부호를 정하고, 없으면 값을 그대로 쓴다.
 */
export function gpsFromExif(exif: Exif): Coord | null {
  if (!exif) return null;
  const lat = toDegrees(exif.GPSLatitude);
  const lng = toDegrees(exif.GPSLongitude);
  if (lat == null || lng == null) return null;

  const latitude = applyRef(lat, exif.GPSLatitudeRef, 'S');
  const longitude = applyRef(lng, exif.GPSLongitudeRef, 'W');

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 위치 정보가 지워진 사진은 0,0으로 들어오는 경우가 있다.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** EXIF 촬영 시각 "2026:11:20 14:03:12" → "2026-11-20T14:03:12" */
export function takenAtFromExif(exif: Exif): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

function applyRef(value: number, ref: unknown, negativeRef: 'S' | 'W'): number {
  if (typeof ref === 'string' && ref.trim()) {
    return ref.trim().toUpperCase().startsWith(negativeRef) ? -Math.abs(value) : Math.abs(value);
  }
  return value;
}

/** 숫자, 숫자 문자열, 또는 "37/1,33/1,1234/100" 같은 도·분·초 유리수 문자열을 십진수 도로 바꾼다. */
function toDegrees(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;

  if (value.includes('/') || value.includes(',')) {
    const parts = value.split(',').map(parseRational);
    if (parts.some((p) => p == null)) return null;
    const [d = 0, m = 0, s = 0] = parts as number[];
    return d + m / 60 + s / 3600;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRational(part: string): number | null {
  const [num, den] = part.trim().split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}
