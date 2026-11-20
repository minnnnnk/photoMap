import type { SQLiteDatabase } from 'expo-sqlite';

import type { Photo, Pin, PinDetail, PinSummary } from '@/lib/types';

type PinRow = {
  id: string;
  title: string;
  memo: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
};

type PinSummaryRow = PinRow & {
  cover_file_name: string | null;
  photo_count: number;
};

type PhotoRow = {
  id: string;
  pin_id: string;
  file_name: string;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  sort_order: number;
  created_at: string;
};

const toPin = (r: PinRow): Pin => ({
  id: r.id,
  title: r.title,
  memo: r.memo,
  latitude: r.latitude,
  longitude: r.longitude,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toPhoto = (r: PhotoRow): Photo => ({
  id: r.id,
  pinId: r.pin_id,
  fileName: r.file_name,
  width: r.width,
  height: r.height,
  takenAt: r.taken_at,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
});

export async function listPins(db: SQLiteDatabase): Promise<PinSummary[]> {
  const rows = await db.getAllAsync<PinSummaryRow>(`
    SELECT p.*,
      (SELECT ph.file_name FROM photos ph
         WHERE ph.pin_id = p.id ORDER BY ph.sort_order LIMIT 1) AS cover_file_name,
      (SELECT COUNT(*) FROM photos ph WHERE ph.pin_id = p.id) AS photo_count
    FROM pins p
    ORDER BY p.created_at DESC
  `);
  return rows.map((r) => ({
    ...toPin(r),
    coverFileName: r.cover_file_name,
    photoCount: r.photo_count,
  }));
}

export async function getPin(db: SQLiteDatabase, id: string): Promise<PinDetail | null> {
  const pinRow = await db.getFirstAsync<PinRow>('SELECT * FROM pins WHERE id = ?', id);
  if (!pinRow) return null;
  const photoRows = await db.getAllAsync<PhotoRow>(
    'SELECT * FROM photos WHERE pin_id = ? ORDER BY sort_order',
    id,
  );
  return { pin: toPin(pinRow), photos: photoRows.map(toPhoto) };
}

type PinFields = Omit<Pin, 'createdAt' | 'updatedAt'>;
export type NewPhotoRecord = Omit<Photo, 'pinId' | 'createdAt'>;

export type NewPinRecord = PinFields & {
  photos: NewPhotoRecord[];
};

export type PinUpdateRecord = PinFields & {
  /** 남길 기존 사진과 새 순서. 여기 없는 기존 사진은 지워진다. */
  keptPhotos: { id: string; sortOrder: number }[];
  newPhotos: NewPhotoRecord[];
};

async function insertPhotoRows(
  db: SQLiteDatabase,
  pinId: string,
  photos: NewPhotoRecord[],
  now: string,
): Promise<void> {
  for (const p of photos) {
    await db.runAsync(
      `INSERT INTO photos (id, pin_id, file_name, width, height, taken_at, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      pinId,
      p.fileName,
      p.width,
      p.height,
      p.takenAt,
      p.sortOrder,
      now,
    );
  }
}

export async function insertPin(db: SQLiteDatabase, record: NewPinRecord): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO pins (id, title, memo, latitude, longitude, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      record.title,
      record.memo,
      record.latitude,
      record.longitude,
      now,
      now,
    );
    await insertPhotoRows(db, record.id, record.photos, now);
  });
}

/**
 * 핀 내용과 사진 목록을 고친다. 빠진 기존 사진의 행은 지우고 그 파일 이름을 돌려준다
 * (파일 정리는 DB 반영이 끝난 뒤 호출한 쪽에서).
 */
export async function updatePinRows(db: SQLiteDatabase, record: PinUpdateRecord): Promise<string[]> {
  const now = new Date().toISOString();
  let removedFileNames: string[] = [];

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE pins SET title = ?, memo = ?, latitude = ?, longitude = ?, updated_at = ?
       WHERE id = ?`,
      record.title,
      record.memo,
      record.latitude,
      record.longitude,
      now,
      record.id,
    );
    if (result.changes === 0) throw new Error('수정할 핀을 찾을 수 없어요');

    const existing = await db.getAllAsync<{ id: string; file_name: string }>(
      'SELECT id, file_name FROM photos WHERE pin_id = ?',
      record.id,
    );
    const keepIds = new Set(record.keptPhotos.map((p) => p.id));
    const removed = existing.filter((p) => !keepIds.has(p.id));

    for (const p of removed) {
      await db.runAsync('DELETE FROM photos WHERE id = ?', p.id);
    }
    for (const p of record.keptPhotos) {
      await db.runAsync(
        'UPDATE photos SET sort_order = ? WHERE id = ? AND pin_id = ?',
        p.sortOrder,
        p.id,
        record.id,
      );
    }
    await insertPhotoRows(db, record.id, record.newPhotos, now);

    removedFileNames = removed.map((p) => p.file_name);
  });

  return removedFileNames;
}

/** 핀과 사진 행을 지우고, 지워진 사진 파일 이름을 돌려준다 (파일 정리는 호출한 쪽에서). */
export async function deletePinRows(db: SQLiteDatabase, id: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ file_name: string }>(
    'SELECT file_name FROM photos WHERE pin_id = ?',
    id,
  );
  await db.runAsync('DELETE FROM pins WHERE id = ?', id);
  return rows.map((r) => r.file_name);
}
