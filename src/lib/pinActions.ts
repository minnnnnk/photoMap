import type { SQLiteDatabase } from 'expo-sqlite';

import { deletePinRows, insertPin } from '@/db/pins';
import { deletePhotoFiles, importPhoto } from './photoStorage';
import type { Coord } from './types';

export type DraftPhoto = {
  id: string;
  /** 사진 선택기가 준 임시 경로 (캐시) */
  sourceUri: string;
  width: number;
  height: number;
  takenAt: string | null;
  gps: Coord | null;
};

export type NewPinInput = Coord & {
  id: string;
  title: string;
  memo: string;
  photos: DraftPhoto[];
};

/** 사진 파일을 앱 폴더로 복사한 뒤 DB에 기록한다. 중간에 실패하면 복사한 파일을 되돌린다. */
export async function savePin(db: SQLiteDatabase, input: NewPinInput): Promise<void> {
  const copied: string[] = [];
  try {
    const photos = [];
    for (const [index, draft] of input.photos.entries()) {
      const fileName = await importPhoto(draft.sourceUri, draft.id);
      copied.push(fileName);
      photos.push({
        id: draft.id,
        fileName,
        width: draft.width,
        height: draft.height,
        takenAt: draft.takenAt,
        sortOrder: index,
      });
    }
    await insertPin(db, {
      id: input.id,
      title: input.title,
      memo: input.memo,
      latitude: input.latitude,
      longitude: input.longitude,
      photos,
    });
  } catch (e) {
    deletePhotoFiles(copied);
    throw e;
  }
}

export async function removePin(db: SQLiteDatabase, id: string): Promise<void> {
  const fileNames = await deletePinRows(db, id);
  deletePhotoFiles(fileNames);
}
