import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteAlbumRow, insertAlbum, updateAlbumName } from '@/db/albums';
import type { Album } from './types';

export const MAX_ALBUM_NAME = 40;

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('앨범 이름을 적어 주세요');
  return trimmed.slice(0, MAX_ALBUM_NAME);
}

export async function createAlbum(db: SQLiteDatabase, name: string): Promise<Album> {
  return insertAlbum(db, Crypto.randomUUID(), cleanName(name));
}

export async function renameAlbum(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await updateAlbumName(db, id, cleanName(name));
}

export async function deleteAlbum(db: SQLiteDatabase, id: string): Promise<void> {
  await deleteAlbumRow(db, id);
}
