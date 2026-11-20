import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { PinForm } from '@/components/PinForm';
import { useAuth } from '@/lib/auth';
import type { PinFormValues } from '@/lib/pinActions';
import { shareErrorMessage } from '@/lib/shareErrors';
import { getSignedUrls } from '@/lib/sharedPhotoUrls';
import { editSharedPin, getSharedPin, toSharedFormValues } from '@/lib/sharedPins';

type Loaded = { values: PinFormValues; albumId: string; albumName: string };

export default function EditSharedPinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  // undefined: 불러오는 중, null: 없음 또는 내가 올린 핀이 아님
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const detail = await getSharedPin(id);
      if (!detail || detail.pin.authorId !== session?.user.id) return null;
      const urls = await getSignedUrls(detail.photos.map((p) => p.storagePath));
      return {
        values: toSharedFormValues(detail, urls),
        albumId: detail.pin.albumId,
        albumName: detail.album?.name ?? '공유 앨범',
      };
    })()
      .then((result) => active && setLoaded(result))
      .catch((e) => {
        console.warn('공유 핀 불러오기 실패', e);
        if (!active) return;
        setLoaded(null);
        Alert.alert('공유 핀을 불러오지 못했어요', shareErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, session?.user.id]);

  if (loaded === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (loaded === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>내가 올린 공유 핀만 고칠 수 있어요</Text>
      </View>
    );
  }

  return (
    <PinForm
      initialValues={loaded.values}
      initialSource="saved"
      submitLabel="수정 내용 저장"
      albumMode="fixed"
      fixedAlbumLabel={`👥 ${loaded.albumName}`}
      onSubmit={async (values) => {
        try {
          await editSharedPin(id, loaded.albumId, values);
        } catch (e) {
          throw new Error(shareErrorMessage(e));
        }
      }}
      onSaved={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#9aa1ad',
  },
});
