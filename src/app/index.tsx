import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type LongPressEvent, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoMarker } from '@/components/PhotoMarker';
import { listPins } from '@/db/pins';
import type { PinSummary } from '@/lib/types';

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function MapScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const centerRef = useRef<Region>(SEOUL);
  const [pins, setPins] = useState<PinSummary[]>([]);
  const [canShowMe, setCanShowMe] = useState(false);

  // 이 화면으로 돌아올 때마다(추가·삭제 후) 핀 목록을 다시 읽는다.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listPins(db)
        .then((rows) => active && setPins(rows))
        .catch((e) => console.warn('핀 목록 불러오기 실패', e));
      return () => {
        active = false;
      };
    }, [db]),
  );

  // 처음 켤 때 위치 권한을 받으면 내 위치로 지도를 옮긴다. 거절하면 서울에서 시작.
  useEffect(() => {
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      setCanShowMe(true);
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      mapRef.current?.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        600,
      );
    })().catch((e) => console.warn('현재 위치 가져오기 실패', e));
  }, []);

  const openNewPin = (latitude: number, longitude: number, source: 'map' | 'center') => {
    router.push({
      pathname: '/pin/new',
      params: { lat: String(latitude), lng: String(longitude), source },
    });
  };

  const onLongPress = (e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    openNewPin(latitude, longitude, 'map');
  };

  const onAddPress = () => {
    const { latitude, longitude } = centerRef.current;
    openNewPin(latitude, longitude, 'center');
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={SEOUL}
        showsUserLocation={canShowMe}
        showsMyLocationButton={canShowMe}
        onLongPress={onLongPress}
        onRegionChangeComplete={(region) => {
          centerRef.current = region;
        }}
      >
        {pins.map((pin) => (
          <PhotoMarker key={pin.id} pin={pin} onPress={() => router.push(`/pin/${pin.id}`)} />
        ))}
      </MapView>

      <View style={[styles.header, { top: insets.top + 8 }]}>
        <Text style={styles.title}>내 사진 지도</Text>
        <Text style={styles.subtitle}>
          {pins.length > 0
            ? `핀 ${pins.length}개 · 지도를 길게 누르면 그 자리에 추가`
            : '+ 버튼이나 지도를 길게 눌러 첫 사진을 남겨 보세요'}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          pressed && styles.fabPressed,
        ]}
        onPress={onAddPress}
        accessibilityLabel="사진 추가"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    pointerEvents: 'none',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1b1f27',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#5b6372',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2f6bff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabPressed: {
    opacity: 0.8,
  },
  fabText: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '400',
  },
});
