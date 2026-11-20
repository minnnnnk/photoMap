import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { contentTypeOf, extensionOf } from './photoStorage';
import type { NewFormPhoto, PinFormValues, RemoteFormPhoto } from './pinActions';
import { forgetSignedUrls } from './sharedPhotoUrls';
import { requireSupabase, SHARED_PHOTO_BUCKET } from './supabase';
import type { Coord } from './types';

export type SharedPinSummary = Coord & {
  id: string;
  albumId: string;
  authorId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  coverPath: string | null;
  firstTakenAt: string | null;
};

export type SharedPhoto = {
  id: string;
  storagePath: string;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  gps: Coord | null;
  sortOrder: number;
};

export type SharedPinDetail = {
  pin: Coord & {
    id: string;
    albumId: string;
    authorId: string | null;
    title: string;
    memo: string;
    createdAt: string;
    updatedAt: string;
  };
  photos: SharedPhoto[];
  album: { id: string; name: string; ownerId: string } | null;
  /** 올린 사람이 앨범을 나갔으면 닉네임을 볼 수 없어 null */
  authorNickname: string | null;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  sort_order: number;
};

type PinRow = {
  id: string;
  album_id: string;
  author_id: string | null;
  title: string;
  memo: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
};

const toPhoto = (r: PhotoRow): SharedPhoto => ({
  id: r.id,
  storagePath: r.storage_path,
  width: r.width,
  height: r.height,
  takenAt: r.taken_at,
  gps: r.latitude != null && r.longitude != null ? { latitude: r.latitude, longitude: r.longitude } : null,
  sortOrder: r.sort_order,
});

/** 내가 볼 수 있는 모든 공유 핀 (지도 표시용 요약) */
export async function listSharedPins(): Promise<SharedPinSummary[]> {
  const { data, error } = await requireSupabase()
    .from('shared_pins')
    .select(
      'id, album_id, author_id, title, latitude, longitude, created_at, updated_at, shared_photos(storage_path, sort_order, taken_at)',
    );
  if (error) throw error;
  type Row = Omit<PinRow, 'memo'> & {
    shared_photos: { storage_path: string; sort_order: number; taken_at: string | null }[];
  };
  return (data as Row[]).map((r) => {
    const photos = [...r.shared_photos].sort((a, b) => a.sort_order - b.sort_order);
    const takenTimes = photos.map((p) => p.taken_at).filter((t): t is string => t != null).sort();
    return {
      id: r.id,
      albumId: r.album_id,
      authorId: r.author_id,
      title: r.title,
      latitude: r.latitude,
      longitude: r.longitude,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      photoCount: photos.length,
      coverPath: photos[0]?.storage_path ?? null,
      firstTakenAt: takenTimes[0] ?? null,
    };
  });
}

export async function getSharedPin(id: string): Promise<SharedPinDetail | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('shared_pins')
    .select(
      'id, album_id, author_id, title, memo, latitude, longitude, created_at, updated_at, shared_photos(id, storage_path, width, height, taken_at, latitude, longitude, sort_order)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as PinRow & { shared_photos: PhotoRow[] };

  const { data: album, error: albumError } = await client
    .from('shared_albums')
    .select('id, name, owner_id')
    .eq('id', row.album_id)
    .maybeSingle();
  if (albumError) throw albumError;

  let authorNickname: string | null = null;
  if (row.author_id) {
    const { data: profile } = await client
      .from('profiles')
      .select('nickname')
      .eq('id', row.author_id)
      .maybeSingle();
    authorNickname = (profile?.nickname as string | undefined) ?? null;
  }

  return {
    pin: {
      id: row.id,
      albumId: row.album_id,
      authorId: row.author_id,
      title: row.title,
      memo: row.memo,
      latitude: row.latitude,
      longitude: row.longitude,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    photos: row.shared_photos.map(toPhoto).sort((a, b) => a.sortOrder - b.sortOrder),
    album: album ? { id: album.id as string, name: album.name as string, ownerId: album.owner_id as string } : null,
    authorNickname,
  };
}

const storagePathFor = (albumId: string, photo: NewFormPhoto) =>
  `${albumId}/${photo.id}.${extensionOf(photo.sourceUri)}`;

/** Uint8Array를 정확한 크기의 ArrayBuffer로 (업로드 본문용) */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * 공유 앨범에 핀을 올린다: 핀 행 → 사진 업로드 → 사진 행 순서.
 * 중간에 실패하면 올린 사진과 핀 행을 지워 되돌린다.
 */
export async function createSharedPin(
  albumId: string,
  values: PinFormValues,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const client = requireSupabase();
  const bucket = client.storage.from(SHARED_PHOTO_BUCKET);
  const pinId = Crypto.randomUUID();
  const newPhotos = values.photos.filter((p): p is NewFormPhoto => p.kind === 'new');

  const { error: pinError } = await client.from('shared_pins').insert({
    id: pinId,
    album_id: albumId,
    title: values.title,
    memo: values.memo,
    latitude: values.latitude,
    longitude: values.longitude,
  });
  if (pinError) throw pinError;

  const uploaded: string[] = [];
  try {
    const rows = [];
    for (const [index, photo] of values.photos.entries()) {
      if (photo.kind !== 'new') continue;
      const path = storagePathFor(albumId, photo);
      const bytes = await new File(photo.sourceUri).bytes();
      const { error } = await bucket.upload(path, toArrayBuffer(bytes), {
        contentType: contentTypeOf(path),
        upsert: false,
      });
      if (error) throw error;
      uploaded.push(path);
      onProgress?.(uploaded.length, newPhotos.length);
      rows.push({
        id: photo.id,
        pin_id: pinId,
        album_id: albumId,
        storage_path: path,
        width: photo.width,
        height: photo.height,
        taken_at: photo.takenAt,
        latitude: photo.gps?.latitude ?? null,
        longitude: photo.gps?.longitude ?? null,
        sort_order: index,
      });
    }
    if (rows.length > 0) {
      const { error } = await client.from('shared_photos').insert(rows);
      if (error) throw error;
    }
    return pinId;
  } catch (e) {
    if (uploaded.length > 0) await bucket.remove(uploaded).then(undefined, () => undefined);
    await client.from('shared_pins').delete().eq('id', pinId).then(undefined, () => undefined);
    throw e;
  }
}

/** 공유 핀을 지운다 (올린 사람이나 앨범 주인). 사진 파일을 먼저 지우고, 핀을 지우면 사진 행도 함께 지워진다. */
export async function deleteSharedPin(pin: { id: string; photoPaths: string[] }): Promise<void> {
  const client = requireSupabase();
  if (pin.photoPaths.length > 0) {
    const { error } = await client.storage.from(SHARED_PHOTO_BUCKET).remove(pin.photoPaths);
    if (error) throw error;
    forgetSignedUrls(pin.photoPaths);
  }
  const { data, error } = await client.from('shared_pins').delete().eq('id', pin.id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('이 핀을 지울 권한이 없어요');
}

/** 공유 핀 상세를 수정 화면의 입력 값으로 바꾼다. 서버 사진은 서명 URL로 보여 준다. */
export function toSharedFormValues(detail: SharedPinDetail, urls: Map<string, string>): PinFormValues {
  return {
    title: detail.pin.title,
    memo: detail.pin.memo,
    latitude: detail.pin.latitude,
    longitude: detail.pin.longitude,
    album: { kind: 'shared', id: detail.pin.albumId },
    photos: detail.photos.map(
      (p): RemoteFormPhoto => ({
        kind: 'remote',
        id: p.id,
        storagePath: p.storagePath,
        uri: urls.get(p.storagePath) ?? '',
        width: p.width,
        height: p.height,
        takenAt: p.takenAt,
        gps: p.gps,
      }),
    ),
  };
}

/**
 * 공유 핀을 고친다 (올린 사람만).
 * 1. 새 사진을 저장소에 먼저 올린다.
 * 2. 서버 함수 update_shared_pin이 핀 내용·사진 빼기·순서·새 사진 행을 한 트랜잭션으로 반영한다.
 * 3. 빠진 사진 파일을 저장소에서 지운다.
 * 2에서 실패하면 1에서 올린 파일을 지워 되돌린다.
 */
export async function editSharedPin(pinId: string, albumId: string, values: PinFormValues): Promise<void> {
  const client = requireSupabase();
  const bucket = client.storage.from(SHARED_PHOTO_BUCKET);
  const keep: { id: string; sort_order: number }[] = [];
  const newRows: Record<string, unknown>[] = [];
  const uploaded: string[] = [];

  try {
    for (const [index, photo] of values.photos.entries()) {
      if (photo.kind === 'remote') {
        keep.push({ id: photo.id, sort_order: index });
        continue;
      }
      if (photo.kind !== 'new') throw new Error('이 기기에만 있는 사진은 공유 핀에 넣을 수 없어요');
      const path = storagePathFor(albumId, photo);
      const bytes = await new File(photo.sourceUri).bytes();
      const { error } = await bucket.upload(path, toArrayBuffer(bytes), {
        contentType: contentTypeOf(path),
        upsert: false,
      });
      if (error) throw error;
      uploaded.push(path);
      newRows.push({
        id: photo.id,
        storage_path: path,
        width: photo.width,
        height: photo.height,
        taken_at: photo.takenAt,
        latitude: photo.gps?.latitude ?? null,
        longitude: photo.gps?.longitude ?? null,
        sort_order: index,
      });
    }

    const { data, error } = await client.rpc('update_shared_pin', {
      p_pin_id: pinId,
      p_title: values.title,
      p_memo: values.memo,
      p_latitude: values.latitude,
      p_longitude: values.longitude,
      p_keep: keep,
      p_new_photos: newRows,
    });
    if (error) throw error;

    // 빠진 사진 파일 정리. 실패해도 핀 수정은 이미 끝났으므로 경고만 남긴다.
    const removed = (data as string[] | null) ?? [];
    if (removed.length > 0) {
      const { error: removeError } = await bucket.remove(removed);
      if (removeError) console.warn('빠진 공유 사진 파일 삭제 실패', removeError);
      forgetSignedUrls(removed);
    }
  } catch (e) {
    if (uploaded.length > 0) await bucket.remove(uploaded).then(undefined, () => undefined);
    throw e;
  }
}
