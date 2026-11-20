import { strFromU8, strToU8, Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate';

import type { Album, Photo, Pin } from './types';

/**
 * 백업 파일 형식 (표준 zip)
 * - backup.json: 앨범·핀·사진 목록 (BackupManifest). 항상 첫 항목이다.
 * - photos/<파일 이름>: 사진 원본
 * 사진이 많아도 메모리를 넘치지 않도록 쓰기·읽기 모두 조금씩(스트리밍) 처리한다.
 * 이 파일은 Expo에 의존하지 않아 Node에서도 테스트할 수 있다.
 */
export const BACKUP_APP = 'photoMap';
export const BACKUP_FORMAT = 1;
const MANIFEST_NAME = 'backup.json';
const PHOTO_PREFIX = 'photos/';

export type BackupManifest = {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  albums: Album[];
  pins: Pin[];
  photos: Photo[];
};

/** 사용자에게 그대로 보여 줄 수 있는 백업 오류 */
export class BackupError extends Error {}

/** 조금씩 읽는 원본. 끝까지 읽으면 빈 배열을 돌려준다. */
export type ChunkSource = {
  read(): Promise<Uint8Array>;
  close(): void;
};

/** 조금씩 쓰는 대상 */
export type ChunkSink = {
  write(bytes: Uint8Array): void;
  close(): void;
};

// ---------------------------------------------------------------- 쓰기

export async function writeBackupZip({
  manifest,
  write,
  openPhoto,
  onProgress,
}: {
  manifest: BackupManifest;
  /** zip 바이트를 받는 쪽 (보통 파일에 이어 쓰기) */
  write: (bytes: Uint8Array) => void;
  openPhoto: (fileName: string) => ChunkSource;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  let failure: unknown = null;
  const zip = new Zip((err, data) => {
    if (err) {
      failure ??= err;
      return;
    }
    write(data);
  });
  const check = () => {
    if (failure) throw failure;
  };

  const manifestEntry = new ZipDeflate(MANIFEST_NAME, { level: 6 });
  zip.add(manifestEntry);
  manifestEntry.push(strToU8(JSON.stringify(manifest)), true);
  check();

  const total = manifest.photos.length;
  for (const [index, photo] of manifest.photos.entries()) {
    // 사진은 이미 압축돼 있어서 압축 없이(level 0) 담기만 한다.
    const entry = new ZipDeflate(PHOTO_PREFIX + photo.fileName, { level: 0 });
    zip.add(entry);
    const source = openPhoto(photo.fileName);
    try {
      let current = await source.read();
      if (current.length === 0) entry.push(current, true);
      while (current.length > 0) {
        const next = await source.read();
        entry.push(current, next.length === 0);
        check();
        current = next;
      }
    } finally {
      source.close();
    }
    onProgress?.(index + 1, total);
  }

  zip.end();
  check();
}

// ---------------------------------------------------------------- 읽기

export async function readBackupZip({
  source,
  onManifest,
  openPhoto,
}: {
  source: ChunkSource;
  /** 목록을 읽자마자 호출된다. 가져올 사진 파일 이름들을 돌려준다. */
  onManifest: (manifest: BackupManifest) => Set<string>;
  openPhoto: (fileName: string) => ChunkSink;
}): Promise<{ manifest: BackupManifest; written: string[] }> {
  let manifest: BackupManifest | null = null;
  let wanted = new Set<string>();
  const written: string[] = [];
  // 열었지만 아직 끝까지 받지 못한 사진 수. 끝났는데 남아 있으면 파일이 중간에 끊긴 것이다.
  let pending = 0;
  let failure: unknown = null;
  const fail = (e: unknown) => {
    failure ??= e;
  };

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (failure) return;

    if (file.name === MANIFEST_NAME) {
      const parts: Uint8Array[] = [];
      file.ondata = (err, data, final) => {
        if (err) return fail(err);
        parts.push(data);
        if (!final) return;
        try {
          manifest = parseManifest(strFromU8(concat(parts)));
          wanted = onManifest(manifest);
        } catch (e) {
          fail(e);
        }
      };
      file.start();
      return;
    }

    if (!file.name.startsWith(PHOTO_PREFIX)) return; // 모르는 항목은 건너뛴다
    if (!manifest) {
      fail(new BackupError('백업 파일 형식이 올바르지 않아요'));
      return;
    }
    const fileName = file.name.slice(PHOTO_PREFIX.length);
    if (!wanted.has(fileName)) return; // start()를 부르지 않으면 건너뛴다

    let sink: ChunkSink;
    try {
      sink = openPhoto(fileName);
    } catch (e) {
      fail(e);
      return;
    }
    pending += 1;
    file.ondata = (err, data, final) => {
      try {
        if (err) throw err;
        if (data.length > 0) sink.write(data);
        if (final) {
          pending -= 1;
          sink.close();
          written.push(fileName);
        }
      } catch (e) {
        fail(e);
        try {
          sink.close();
        } catch {
          // 이미 닫힘
        }
      }
    };
    file.start();
  };

  try {
    let current = await source.read();
    if (current.length === 0) throw new BackupError('빈 파일이에요');
    while (current.length > 0) {
      const next = await source.read();
      unzip.push(current, next.length === 0);
      if (failure) break;
      current = next;
    }
  } catch (e) {
    fail(e);
  } finally {
    source.close();
  }

  if (failure) {
    throw failure instanceof BackupError
      ? failure
      : new BackupError('백업 파일을 읽지 못했어요. 파일이 손상됐을 수 있어요.');
  }
  if (!manifest) throw new BackupError('포토맵 백업 파일이 아니에요');
  // 우리 앱이 만든 백업에는 목록의 사진이 모두 들어 있다. 하나라도 없으면 덜 받아진 파일이다.
  const writtenSet = new Set(written);
  if (pending > 0 || [...wanted].some((name) => !writtenSet.has(name))) {
    throw new BackupError('백업 파일이 중간에 끊겨 있어요. 파일을 다시 받아서 시도해 주세요.');
  }
  return { manifest, written };
}

// ---------------------------------------------------------------- 가져오기 계획

export type ExistingIds = {
  albumIds: Set<string>;
  pinIds: Set<string>;
  photoIds: Set<string>;
};

export type ImportPlan = {
  albums: Album[];
  pins: Pin[];
  photos: Photo[];
  /** 이미 이 기기에 있어서 건너뛴 핀 수 */
  skippedPins: number;
};

/**
 * 백업에 있는 것 중 이 기기에 없는 것만 더한다. 이미 있는 핀은 (사진까지) 그대로 둔다.
 * ID가 UUID라서 다른 기기에서 만든 핀과 겹치지 않는다.
 */
export function planImport(manifest: BackupManifest, existing: ExistingIds): ImportPlan {
  const albums = manifest.albums.filter((a) => !existing.albumIds.has(a.id));
  const knownAlbumIds = new Set([...existing.albumIds, ...manifest.albums.map((a) => a.id)]);
  const pins = manifest.pins
    .filter((p) => !existing.pinIds.has(p.id))
    .map((p) => (p.albumId && !knownAlbumIds.has(p.albumId) ? { ...p, albumId: null } : p));
  const newPinIds = new Set(pins.map((p) => p.id));
  const photos = manifest.photos.filter(
    (ph) => newPinIds.has(ph.pinId) && !existing.photoIds.has(ph.id),
  );
  return { albums, pins, photos, skippedPins: manifest.pins.length - pins.length };
}

// ---------------------------------------------------------------- 목록 검사

export function parseManifest(text: string): BackupManifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('백업 파일의 목록을 읽지 못했어요');
  }
  if (!isRecord(data) || data.app !== BACKUP_APP) {
    throw new BackupError('포토맵 백업 파일이 아니에요');
  }
  if (typeof data.format !== 'number' || data.format > BACKUP_FORMAT) {
    throw new BackupError('이 앱보다 새 버전에서 만든 백업이에요. 앱을 업데이트해 주세요.');
  }
  const { albums, pins, photos } = data;
  if (
    !Array.isArray(albums) ||
    !albums.every(isAlbum) ||
    !Array.isArray(pins) ||
    !pins.every(isPin) ||
    !Array.isArray(photos) ||
    !photos.every(isPhoto)
  ) {
    throw new BackupError('백업 파일 형식이 올바르지 않아요');
  }
  return {
    app: BACKUP_APP,
    format: data.format,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    albums,
    pins,
    photos,
  };
}

/** 사진 파일 이름은 경로를 벗어나지 못하게 글자 종류를 제한한다 (예: "../" 차단). */
export function isSafeFileName(name: unknown): name is string {
  return typeof name === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(name) && !name.includes('..');
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullable = <T>(v: unknown, check: (x: unknown) => x is T): v is T | null =>
  v === null || check(v);
const isLatitude = (v: unknown) => isNumber(v) && Math.abs(v) <= 90;
const isLongitude = (v: unknown) => isNumber(v) && Math.abs(v) <= 180;

function isAlbum(v: unknown): v is Album {
  return (
    isRecord(v) && isString(v.id) && isString(v.name) && isString(v.createdAt) && isString(v.updatedAt)
  );
}

function isPin(v: unknown): v is Pin {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.title) &&
    isString(v.memo) &&
    isLatitude(v.latitude) &&
    isLongitude(v.longitude) &&
    isNullable(v.albumId, isString) &&
    isString(v.createdAt) &&
    isString(v.updatedAt)
  );
}

function isPhoto(v: unknown): v is Photo {
  if (!isRecord(v)) return false;
  const gps = v.gps;
  const gpsOk = gps === null || (isRecord(gps) && isLatitude(gps.latitude) && isLongitude(gps.longitude));
  return (
    isString(v.id) &&
    isString(v.pinId) &&
    isSafeFileName(v.fileName) &&
    isNullable(v.width, isNumber) &&
    isNullable(v.height, isNumber) &&
    isNullable(v.takenAt, isString) &&
    gpsOk &&
    isNumber(v.sortOrder) &&
    isString(v.createdAt)
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
