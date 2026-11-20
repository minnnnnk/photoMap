import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { photoUri } from '@/lib/photoStorage';
import type { PinSummary } from '@/lib/types';

type Props = {
  pin: PinSummary;
  onPress: () => void;
};

/** 대표 사진을 동그란 썸네일로 보여 주는 지도 핀 */
export function PhotoMarker({ pin, onPress }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const uri = pin.coverFileName ? photoUri(pin.coverFileName) : null;

  // 사진이 그려진 뒤에 화면 추적을 꺼야 지도가 가볍다.
  // 안드로이드는 이미지가 실제로 그려지기 전에 끄면 빈 핀이 남아서 조금 기다렸다 끈다.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => setFrozen(true), 300);
    return () => clearTimeout(timer);
  }, [loaded]);

  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={!frozen}
      onPress={onPress}
    >
      <View style={styles.wrap}>
        <View style={styles.bubble}>
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.thumb}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          ) : (
            <View style={[styles.thumb, styles.empty]} onLayout={() => setLoaded(true)} />
          )}
        </View>
        <View style={styles.tail} />
        {pin.photoCount > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pin.photoCount}</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const SIZE = 52;

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
    borderColor: '#fff',
    backgroundColor: '#fff',
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
    borderTopColor: '#fff',
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
});
