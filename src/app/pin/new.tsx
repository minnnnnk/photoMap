import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { PinForm } from '@/components/PinForm';
import { createPin, type AlbumChoice, type PinFormValues } from '@/lib/pinActions';
import { shareErrorMessage } from '@/lib/shareErrors';
import { createSharedPin } from '@/lib/sharedPins';
import type { Coord } from '@/lib/types';

const SEOUL: Coord = { latitude: 37.5665, longitude: 126.978 };

function initialAlbum(albumId?: string, sharedAlbumId?: string): AlbumChoice {
  if (sharedAlbumId) return { kind: 'shared', id: sharedAlbumId };
  if (albumId) return { kind: 'local', id: albumId };
  return null;
}

function coordFromParams(lat?: string, lng?: string): Coord | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!lat || !lng || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function NewPinScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    source?: string;
    /** 지도에서 앨범을 고른 채로 추가하면 그 앨범에 넣는다 */
    albumId?: string;
    sharedAlbumId?: string;
  }>();

  // 처음 위치는 지도 화면에서 넘어온 값으로 한 번만 정한다.
  const [initialValues] = useState<PinFormValues>(() => ({
    ...(coordFromParams(params.lat, params.lng) ?? SEOUL),
    title: '',
    memo: '',
    album: initialAlbum(params.albumId, params.sharedAlbumId),
    photos: [],
  }));

  return (
    <PinForm
      initialValues={initialValues}
      initialSource={params.source === 'map' ? 'map' : 'center'}
      submitLabel="지도에 저장"
      albumMode="any"
      onSubmit={async (values) => {
        if (values.album?.kind !== 'shared') {
          await createPin(db, values);
          return;
        }
        try {
          await createSharedPin(values.album.id, values);
        } catch (e) {
          throw new Error(shareErrorMessage(e));
        }
      }}
      onSaved={() => router.back()}
    />
  );
}
