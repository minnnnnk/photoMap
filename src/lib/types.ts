export type Coord = {
  latitude: number;
  longitude: number;
};

export type Pin = Coord & {
  id: string;
  title: string;
  memo: string;
  albumId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Album = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AlbumSummary = Album & {
  pinCount: number;
};

export type Photo = {
  id: string;
  pinId: string;
  /** 앱 사진 폴더 안의 파일 이름. 전체 경로는 iOS에서 앱 업데이트 때 바뀔 수 있어 저장하지 않는다. */
  fileName: string;
  width: number | null;
  height: number | null;
  /** 사진 EXIF의 촬영 시각 (YYYY-MM-DDTHH:MM:SS, 찍은 곳의 현지 시각) */
  takenAt: string | null;
  /** 사진 EXIF의 위치. 위치 정보가 없거나 DB 버전 2 이전에 저장한 사진은 null */
  gps: Coord | null;
  sortOrder: number;
  createdAt: string;
};

/** 지도에 그릴 때 쓰는 핀 요약: 대표 사진, 사진 수, 가장 이른 촬영 시각 포함 */
export type PinSummary = Pin & {
  coverFileName: string | null;
  photoCount: number;
  firstTakenAt: string | null;
};

export type PinDetail = {
  pin: Pin;
  photos: Photo[];
  album: Album | null;
};
