/** "2026-11-20T14:03:12" (EXIF 현지 시각) → "2026년 11월 20일 14:03" */
export function formatTakenAt(takenAt: string): string {
  const m = takenAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return takenAt;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 ${m[4]}:${m[5]}`;
}

/** ISO 시각 → 기기 시간대 기준 "2026년 11월 20일" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatCoord(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(5)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(5)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}
