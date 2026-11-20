import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker, type LatLng } from 'react-native-maps';

type Props = {
  coordinate: LatLng;
  /** 대표 사진 주소 (내 핀은 파일 경로, 공유 핀은 서명 URL) */
  coverUri: string | null;
  photoCount: number;
  /** 공유 앨범의 핀이면 테두리 색을 바꿔 구분한다 */
  shared?: boolean;
  onPress: () => void;
};

/** 대표 사진을 동그란 썸네일로 보여 주는 지도 핀 */
export function PhotoMarker({ coordinate, coverUri, photoCount, shared = false, onPress }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [frozen, setFrozen] = useState(false);

  // 사진이 그려진 뒤에 화면 추적을 꺼야 지도가 가볍다.
  // 안드로이드는 이미지가 실제로 그려지기 전에 끄면 빈 핀이 남아서 조금 기다렸다 끈다.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => setFrozen(true), 300);
    return () => clearTimeout(timer);
  }, [loaded]);

  const ringColor = shared ? SHARED_COLOR : '#fff';

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={!frozen} onPress={onPress}>
      <View style={styles.wrap}>
        <View style={[styles.bubble, { borderColor: ringColor, backgroundColor: ringColor }]}>
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.thumb}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          ) : (
            <View style={[styles.thumb, styles.empty]} onLayout={() => setLoaded(true)} />
          )}
        </View>
        <View style={[styles.tail, { borderTopColor: ringColor }]} />
        {photoCount > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{photoCount}</Text>
          </View>
        )}
        {shared && (
          <View style={styles.sharedBadge}>
            <Text style={styles.sharedBadgeText}>👥</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const SIZE = 52;
const SHARED_COLOR = '#ff9f1a';

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  empty: {
    backgroundColor: '#d0d7e2',
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#ff5a5f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  sharedBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedBadgeText: {
    fontSize: 11,
  },
});
