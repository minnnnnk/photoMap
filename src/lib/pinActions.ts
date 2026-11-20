import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deletePinRows, insertPin, updatePinRows, type NewPhotoRecord } from '@/db/pins';
import { deletePhotoFiles, importPhoto, photoUri } from './photoStorage';
import type { Coord, PinDetail } from './types';

/** 이미 앱 폴더에 저장돼 있는 사진 (수정 화면에서) */
export type StoredFormPhoto = {
  kind: 'stored';
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  gps: Coord | null;
};

/** 방금 앨범에서 고른, 아직 저장하지 않은 사진 */
export type NewFormPhoto = {
  kind: 'new';
  id: string;
  /** 사진 선택기가 준 임시 경로 (캐시) */
  sourceUri: string;
  width: number;
  height: number;
  takenAt: string | null;
  gps: Coord | null;
};

export type FormPhoto = StoredFormPhoto | NewFormPhoto;

/** 핀 입력 양식의 값. photos의 순서가 곧 표시 순서이고, 첫 장이 대표 사진이다. */
export type PinFormValues = Coord & {
  title: string;
  memo: string;
  photos: FormPhoto[];
};

export function formPhotoUri(photo: FormPhoto): string {
  return photo.kind === 'stored' ? photoUri(photo.fileName) : photo.sourceUri;
}

export function toFormValues({ pin, photos }: PinDetail): PinFormValues {
  return {
    title: pin.title,
    memo: pin.memo,
    latitude: pin.latitude,
    longitude: pin.longitude,
    photos: photos.map((p) => ({
      kind: 'stored',
      id: p.id,
      fileName: p.fileName,
      width: p.width,
      height: p.height,
      takenAt: p.takenAt,
      gps: p.gps,
    })),
  };
}

/**
 * 새 사진은 앱 폴더로 복사하고, 기존 사진은 새 순서만 기록한다.
 * 복사한 파일 이름은 copied에 쌓아서, 실패했을 때 호출한 쪽이 되돌릴 수 있게 한다.
 */
async function importNewPhotos(photos: FormPhoto[], copied: string[]) {
  const kept: { id: string; sortOrder: number }[] = [];
  const added: NewPhotoRecord[] = [];
  for (const [index, photo] of photos.entries()) {
    if (photo.kind === 'stored') {
      kept.push({ id: photo.id, sortOrder: index });
      continue;
    }
    const fileName = await importPhoto(photo.sourceUri, photo.id);
    copied.push(fileName);
    added.push({
      id: photo.id,
      fileName,
      width: photo.width,
      height: photo.height,
      takenAt: photo.takenAt,
      gps: photo.gps,
      sortOrder: index,
    });
  }
  return { kept, added };
}

/** 새 핀을 저장하고 ID를 돌려준다. 중간에 실패하면 복사한 사진 파일을 되돌린다. */
export async function createPin(db: SQLiteDatabase, values: PinFormValues): Promise<string> {
  const copied: string[] = [];
  try {
    const { added } = await importNewPhotos(values.photos, copied);
    const id = Crypto.randomUUID();
    await insertPin(db, {
      id,
      title: values.title,
      memo: values.memo,
      latitude: values.latitude,
      longitude: values.longitude,
      photos: added,
    });
    return id;
  } catch (e) {
    deletePhotoFiles(copied);
    throw e;
  }
}

/**
 * 핀을 고친다. DB 반영이 끝난 뒤에만 빠진 사진 파일을 지우고,
 * 실패하면 새로 복사한 파일만 되돌린다 (기존 사진은 그대로).
 */
export async function editPin(db: SQLiteDatabase, id: string, values: PinFormValues): Promise<void> {
  const copied: string[] = [];
  let removedFileNames: string[];
  try {
    const { kept, added } = await importNewPhotos(values.photos, copied);
    removedFileNames = await updatePinRows(db, {
      id,
      title: values.title,
      memo: values.memo,
      latitude: values.latitude,
      longitude: values.longitude,
      keptPhotos: kept,
      newPhotos: added,
    });
  } catch (e) {
    deletePhotoFiles(copied);
    throw e;
  }
  deletePhotoFiles(removedFileNames);
}

export async function removePin(db: SQLiteDatabase, id: string): Promise<void> {
  const fileNames = await deletePinRows(db, id);
  deletePhotoFiles(fileNames);
}
