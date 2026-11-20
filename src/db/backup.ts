import type { SQLiteDatabase } from 'expo-sqlite';

import type { ExistingIds } from '@/lib/backupArchive';
import type { Album, Photo, Pin } from '@/lib/types';
import { toAlbum, type AlbumRow } from './albums';
import { toPhoto, toPin, type PhotoRow, type PinRow } from './pins';

export async function readAllForBackup(
  db: SQLiteDatabase,
): Promise<{ albums: Album[]; pins: Pin[]; photos: Photo[] }> {
  const albums = await db.getAllAsync<AlbumRow>('SELECT * FROM albums ORDER BY created_at');
  const pins = await db.getAllAsync<PinRow>('SELECT * FROM pins ORDER BY created_at');
  const photos = await db.getAllAsync<PhotoRow>('SELECT * FROM photos ORDER BY pin_id, sort_order');
  return { albums: albums.map(toAlbum), pins: pins.map(toPin), photos: photos.map(toPhoto) };
}

export async function getExistingIds(db: SQLiteDatabase): Promise<ExistingIds> {
  const ids = async (table: 'albums' | 'pins' | 'photos') =>
    new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`)).map((r) => r.id));
  return { albumIds: await ids('albums'), pinIds: await ids('pins'), photoIds: await ids('photos') };
}

/** 백업에서 가져온 행을 한 트랜잭션으로 넣는다. 이미 있는 ID는 건너뛰고, 실제로 넣은 수를 돌려준다. */
export async function insertImportedRows(
  db: SQLiteDatabase,
  rows: { albums: Album[]; pins: Pin[]; photos: Photo[] },
): Promise<{ albums: number; pins: number; photos: number }> {
  const counts = { albums: 0, pins: 0, photos: 0 };
  await db.withTransactionAsync(async () => {
    for (const a of rows.albums) {
      const r = await db.runAsync(
        'INSERT OR IGNORE INTO albums (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        a.id,
        a.name,
        a.createdAt,
        a.updatedAt,
      );
      counts.albums += r.changes;
    }
    for (const p of rows.pins) {
      const r = await db.runAsync(
        `INSERT OR IGNORE INTO pins
           (id, title, memo, latitude, longitude, album_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.title,
        p.memo,
        p.latitude,
        p.longitude,
        p.albumId,
        p.createdAt,
        p.updatedAt,
      );
      counts.pins += r.changes;
    }
    for (const ph of rows.photos) {
      const r = await db.runAsync(
        `INSERT OR IGNORE INTO photos
           (id, pin_id, file_name, width, height, taken_at, latitude, longitude, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ph.id,
        ph.pinId,
        ph.fileName,
        ph.width,
        ph.height,
        ph.takenAt,
        ph.gps?.latitude ?? null,
        ph.gps?.longitude ?? null,
        ph.sortOrder,
        ph.createdAt,
      );
      counts.photos += r.changes;
    }
  });
  return counts;
}
