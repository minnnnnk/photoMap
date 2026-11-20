import type { SQLiteDatabase } from 'expo-sqlite';

import type { Album, AlbumSummary } from '@/lib/types';

type AlbumRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type AlbumSummaryRow = AlbumRow & {
  pin_count: number;
};

const toAlbum = (r: AlbumRow): Album => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toSummary = (r: AlbumSummaryRow): AlbumSummary => ({
  ...toAlbum(r),
  pinCount: r.pin_count,
});

const SUMMARY_SELECT = `
  SELECT a.*, (SELECT COUNT(*) FROM pins p WHERE p.album_id = a.id) AS pin_count
  FROM albums a
`;

/** 최근에 만든 앨범부터 */
export async function listAlbums(db: SQLiteDatabase): Promise<AlbumSummary[]> {
  const rows = await db.getAllAsync<AlbumSummaryRow>(`${SUMMARY_SELECT} ORDER BY a.created_at DESC`);
  return rows.map(toSummary);
}

export async function getAlbum(db: SQLiteDatabase, id: string): Promise<AlbumSummary | null> {
  const row = await db.getFirstAsync<AlbumSummaryRow>(`${SUMMARY_SELECT} WHERE a.id = ?`, id);
  return row ? toSummary(row) : null;
}

export async function insertAlbum(db: SQLiteDatabase, id: string, name: string): Promise<Album> {
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO albums (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id,
    name,
    now,
    now,
  );
  return { id, name, createdAt: now, updatedAt: now };
}

export async function updateAlbumName(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  const result = await db.runAsync(
    'UPDATE albums SET name = ?, updated_at = ? WHERE id = ?',
    name,
    new Date().toISOString(),
    id,
  );
  if (result.changes === 0) throw new Error('앨범을 찾을 수 없어요');
}

/** 앨범만 지운다. 들어 있던 핀은 외래 키(ON DELETE SET NULL)로 앨범에서 빠진다. */
export async function deleteAlbumRow(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM albums WHERE id = ?', id);
}
