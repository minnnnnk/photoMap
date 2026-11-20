import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { PinForm } from '@/components/PinForm';
import { createPin, type PinFormValues } from '@/lib/pinActions';
import type { Coord } from '@/lib/types';

const SEOUL: Coord = { latitude: 37.5665, longitude: 126.978 };

function coordFromParams(lat?: string, lng?: string): Coord | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!lat || !lng || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function NewPinScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; source?: string }>();

  // 처음 위치는 지도 화면에서 넘어온 값으로 한 번만 정한다.
  const [initialValues] = useState<PinFormValues>(() => ({
    ...(coordFromParams(params.lat, params.lng) ?? SEOUL),
    title: '',
    memo: '',
    photos: [],
  }));

  return (
    <PinForm
      initialValues={initialValues}
      initialSource={params.source === 'map' ? 'map' : 'center'}
      submitLabel="지도에 저장"
      onSubmit={async (values) => {
        await createPin(db, values);
      }}
      onSaved={() => router.back()}
    />
  );
}
