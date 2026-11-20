import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { formatCoord, formatDate, formatTakenAt } from '@/lib/format';
import { shareErrorMessage } from '@/lib/shareErrors';
import { getSignedUrls } from '@/lib/sharedPhotoUrls';
import { deleteSharedPin, getSharedPin, type SharedPinDetail } from '@/lib/sharedPins';

type Loaded = { detail: SharedPinDetail; urls: Map<string, string> };

export default function SharedPinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // undefined: 불러오는 중, null: 없음(권한 없음 포함)
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const detail = await getSharedPin(id);
        if (!detail) return null;
        const urls = await getSignedUrls(detail.photos.map((p) => p.storagePath));
        return { detail, urls };
      })()
        .then((loaded) => {
          if (!active) return;
          setData(loaded);
          setPage(0);
        })
        .catch((e) => {
          console.warn('공유 핀 불러오기 실패', e);
          if (!active) return;
          setData(null);
          Alert.alert('공유 핀을 불러오지 못했어요', shareErrorMessage(e));
        });
      return () => {
        active = false;
      };
    }, [id]),
  );

  if (data === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (data === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>이 공유 핀을 볼 수 없어요</Text>
      </View>
    );
  }

  const { detail, urls } = data;
  const { pin, photos, album, authorNickname } = detail;
  const myId = session?.user.id;
  const isAuthor = pin.authorId != null && pin.authorId === myId;
  const canDelete = isAuthor || (album != null && album.ownerId === myId);
  const takenAt = photos.find((p) => p.takenAt)?.takenAt;
  const authorLabel = isAuthor ? '내가 올림' : `${authorNickname ?? '나간 멤버'}님이 올림`;

  const confirmDelete = () => {
    Alert.alert(
      '이 공유 핀을 지울까요?',
      '앨범의 모든 멤버에게서 사라지고, 서버의 사진도 함께 지워져요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteSharedPin({ id: pin.id, photoPaths: photos.map((p) => p.storagePath) });
              router.back();
            } catch (e) {
              Alert.alert('지우지 못했어요', shareErrorMessage(e));
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: pin.title || '제목 없음' }} />
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View>
          <ScrollView
            key={pin.updatedAt}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {photos.map((p) => {
              const uri = urls.get(p.storagePath);
              return uri ? (
                <Image key={p.id} source={{ uri }} style={{ width, height: width }} resizeMode="cover" />
              ) : (
                <View key={p.id} style={[styles.missing, { width, height: width }]}>
                  <Text style={styles.muted}>사진을 불러오지 못했어요</Text>
                </View>
              );
            })}
          </ScrollView>
          {photos.length > 1 && (
            <View style={styles.pager}>
              <Text style={styles.pagerText}>
                {page + 1} / {photos.length}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{pin.title || '제목 없음'}</Text>
          <Text style={styles.meta}>👤 {authorLabel}</Text>
          {album && <Text style={styles.meta}>👥 {album.name}</Text>}
          <Text style={styles.meta}>
            {takenAt ? `📷 ${formatTakenAt(takenAt)}` : `🗓️ ${formatDate(pin.createdAt)}에 올림`}
          </Text>
          <Text style={styles.meta}>📍 {formatCoord(pin.latitude, pin.longitude)}</Text>

          {pin.memo ? (
            <Text style={styles.memo}>{pin.memo}</Text>
          ) : (
            <Text style={[styles.memo, styles.muted]}>메모가 없어요</Text>
          )}

          {canDelete && (
            <Pressable style={styles.deleteButton} onPress={confirmDelete} disabled={busy}>
              <Text style={styles.deleteButtonText}>공유 핀 지우기</Text>
            </Pressable>
          )}
          {busy && <ActivityIndicator style={styles.spinner} />}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#9aa1ad' },
  missing: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f3f6' },
  pager: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pagerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  body: { padding: 18 },
  title: { fontSize: 22, fontWeight: '700', color: '#1b1f27' },
  meta: { marginTop: 6, fontSize: 13, color: '#5b6372' },
  memo: { marginTop: 18, fontSize: 15, lineHeight: 23, color: '#262b34' },
  deleteButton: {
    marginTop: 36,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fdecec',
  },
  deleteButtonText: { color: '#d93636', fontSize: 14, fontWeight: '600' },
  spinner: { marginTop: 16 },
});
