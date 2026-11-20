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

export type NewPinRecord = Omit<Pin, 'createdAt' | 'updatedAt'> & {
  photos: Omit<Photo, 'pinId' | 'createdAt'>[];
};

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
    for (const p of record.photos) {
      await db.runAsync(
        `INSERT INTO photos (id, pin_id, file_name, width, height, taken_at, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        record.id,
        p.fileName,
        p.width,
        p.height,
        p.takenAt,
        p.sortOrder,
        now,
      );
    }
  });
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
