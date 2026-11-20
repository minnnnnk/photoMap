import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';

import { getExistingIds, insertImportedRows, readAllForBackup } from '@/db/backup';
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  planImport,
  readBackupZip,
  writeBackupZip,
  type BackupManifest,
  type ChunkSource,
  type ImportPlan,
} from './backupArchive';
import { deletePhotoFiles, ensurePhotoDir, photoFile } from './photoStorage';

const CHUNK_SIZE = 256 * 1024;
const ZIP_MIME_TYPES = ['application/zip', 'application/x-zip-compressed'];

export type Progress = (done: number, total: number) => void;

function fileSource(file: File): ChunkSource {
  const handle = file.open(FileMode.ReadOnly);
  return {
    read: () => handle.readBytes(CHUNK_SIZE),
    close: () => handle.close(),
  };
}

function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `photomap-backup-${date}-${time}.zip`;
}

/** 백업 파일은 캐시의 backups 폴더에 만든다. 지난번에 만든 임시 백업 파일은 먼저 정리한다. */
function prepareBackupDir(): Directory {
  const dir = new Directory(Paths.cache, 'backups');
  if (dir.exists) {
    for (const item of dir.list()) {
      if (item instanceof File) item.delete();
    }
  } else {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

export type BackupResult = {
  uri: string;
  albums: number;
  pins: number;
  photos: number;
  /** DB에는 있지만 파일이 없어 빠진 사진 수 */
  missingPhotos: number;
};

export async function createBackupFile(db: SQLiteDatabase, onProgress?: Progress): Promise<BackupResult> {
  const data = await readAllForBackup(db);
  const photos = data.photos.filter((p) => photoFile(p.fileName).exists);
  const manifest: BackupManifest = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    albums: data.albums,
    pins: data.pins,
    photos,
  };

  const out = new File(prepareBackupDir(), backupFileName(new Date()));
  out.create({ overwrite: true });
  const handle = out.open(FileMode.WriteOnly);
  try {
    await writeBackupZip({
      manifest,
      write: (bytes) => handle.writeBytesSync(bytes),
      openPhoto: (fileName) => fileSource(photoFile(fileName)),
      onProgress,
    });
  } catch (e) {
    handle.close();
    if (out.exists) out.delete();
    throw e;
  }
  handle.close();

  return {
    uri: out.uri,
    albums: data.albums.length,
    pins: data.pins.length,
    photos: photos.length,
    missingPhotos: data.photos.length - photos.length,
  };
}

export async function shareBackupFile(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('이 기기에서는 공유 창을 열 수 없어요');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: '백업 파일 저장',
  });
}

export async function pickBackupFile(): Promise<File | null> {
  const result = await File.pickFileAsync({ mimeTypes: ZIP_MIME_TYPES });
  return result.canceled ? null : result.result;
}

export type RestoreResult = {
  albums: number;
  pins: number;
  photos: number;
  skippedPins: number;
};

/**
 * 백업 파일에서 이 기기에 없는 앨범·핀·사진만 더한다.
 * 사진 파일을 먼저 쓰고 DB에 넣으며, 중간에 실패하면 이번에 쓴 사진 파일을 지운다.
 */
export async function restoreFromFile(
  db: SQLiteDatabase,
  file: File,
  onProgress?: Progress,
): Promise<RestoreResult> {
  const existing = await getExistingIds(db);
  const dir = ensurePhotoDir();
  const state: { plan: ImportPlan | null } = { plan: null };
  const opened: string[] = [];
  let done = 0;

  try {
    await readBackupZip({
      source: fileSource(file),
      onManifest: (manifest) => {
        const plan = planImport(manifest, existing);
        state.plan = plan;
        onProgress?.(0, plan.photos.length);
        return new Set(plan.photos.map((p) => p.fileName));
      },
      openPhoto: (fileName) => {
        const target = new File(dir, fileName);
        target.create({ overwrite: true });
        opened.push(fileName);
        const handle = target.open(FileMode.WriteOnly);
        return {
          write: (bytes) => handle.writeBytesSync(bytes),
          close: () => {
            handle.close();
            done += 1;
            onProgress?.(done, state.plan?.photos.length ?? done);
          },
        };
      },
    });

    const plan = state.plan;
    if (!plan) throw new Error('백업 목록을 읽지 못했어요');
    // readBackupZip이 계획한 사진을 모두 받았는지 확인했으므로 그대로 넣는다.
    const counts = await insertImportedRows(db, {
      albums: plan.albums,
      pins: plan.pins,
      photos: plan.photos,
    });
    return { ...counts, skippedPins: plan.skippedPins };
  } catch (e) {
    deletePhotoFiles(opened);
    throw e;
  }
}
