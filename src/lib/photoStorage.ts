import { Directory, File, Paths } from 'expo-file-system';

/**
 * 고른 사진은 갤러리 원본을 건드리지 않고, 앱 전용 폴더(documents/photos)에 복사해 둔다.
 * DB에는 파일 이름만 저장하고, 화면에 띄울 때 photoUri()로 전체 경로를 만든다.
 */
const PHOTO_DIR_NAME = 'photos';
const KNOWN_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'];

function photoDir(): Directory {
  return new Directory(Paths.document, PHOTO_DIR_NAME);
}

export function ensurePhotoDir(): Directory {
  const dir = photoDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function extensionOf(uri: string): string {
  const match = uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1].toLowerCase();
  return ext && KNOWN_EXTENSIONS.includes(ext) ? ext : 'jpg';
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** 파일 이름·경로의 확장자로 MIME 형식을 정한다 (모르면 JPEG). */
export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extensionOf(path)] ?? 'image/jpeg';
}

export function photoFile(fileName: string): File {
  return new File(photoDir(), fileName);
}

export function photoUri(fileName: string): string {
  return photoFile(fileName).uri;
}

/** 사진을 앱 폴더로 복사하고, 저장된 파일 이름을 돌려준다. */
export async function importPhoto(sourceUri: string, photoId: string): Promise<string> {
  const fileName = `${photoId}.${extensionOf(sourceUri)}`;
  const dest = new File(ensurePhotoDir(), fileName);
  await new File(sourceUri).copy(dest);
  return fileName;
}

/** 앱 폴더에 복사해 둔 사진 파일만 지운다 (휴대폰 앨범 원본과는 무관). */
export function deletePhotoFiles(fileNames: string[]): void {
  const dir = photoDir();
  for (const name of fileNames) {
    try {
      const file = new File(dir, name);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn('사진 파일 삭제 실패', name, e);
    }
  }
}
