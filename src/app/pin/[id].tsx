import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
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

import { getPin } from '@/db/pins';
import { formatCoord, formatDate, formatTakenAt } from '@/lib/format';
import { removePin } from '@/lib/pinActions';
import { photoUri } from '@/lib/photoStorage';
import type { PinDetail } from '@/lib/types';

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // undefined: 불러오는 중, null: 없음
  const [detail, setDetail] = useState<PinDetail | null | undefined>(undefined);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    getPin(db, id)
      .then((d) => active && setDetail(d))
      .catch((e) => {
        console.warn('핀 불러오기 실패', e);
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [db, id]);

  if (detail === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (detail === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>이 핀을 찾을 수 없어요</Text>
      </View>
    );
  }

  const { pin, photos } = detail;
  const takenAt = photos.find((p) => p.takenAt)?.takenAt;

  const confirmDelete = () => {
    Alert.alert(
      '이 핀을 지울까요?',
      '앱에 저장된 사진도 함께 지워져요. 휴대폰 앨범의 원본 사진은 그대로 남아요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePin(db, pin.id);
              router.back();
            } catch (e) {
              Alert.alert('지우지 못했어요', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: pin.title || '제목 없음' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / width))
            }
          >
            {photos.map((p) => (
              <Image
                key={p.id}
                source={{ uri: photoUri(p.fileName) }}
                style={{ width, height: width }}
                resizeMode="cover"
              />
            ))}
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
          <Text style={styles.meta}>
            {takenAt ? `📷 ${formatTakenAt(takenAt)}` : `🗓️ ${formatDate(pin.createdAt)}에 저장`}
          </Text>
          <Text style={styles.meta}>📍 {formatCoord(pin.latitude, pin.longitude)}</Text>

          {pin.memo ? (
            <Text style={styles.memo}>{pin.memo}</Text>
          ) : (
            <Text style={[styles.memo, styles.muted]}>메모가 없어요</Text>
          )}

          <Pressable style={styles.deleteButton} onPress={confirmDelete}>
            <Text style={styles.deleteButtonText}>핀 지우기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pager: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pagerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1b1f27',
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: '#5b6372',
  },
  memo: {
    marginTop: 18,
    fontSize: 15,
    lineHeight: 23,
    color: '#262b34',
  },
  muted: {
    color: '#9aa1ad',
  },
  deleteButton: {
    marginTop: 36,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fdecec',
  },
  deleteButtonText: {
    color: '#d93636',
    fontSize: 14,
    fontWeight: '600',
  },
});
