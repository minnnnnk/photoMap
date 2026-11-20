import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Polyline,
  type LatLng,
  type LongPressEvent,
  type Region,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { PhotoMarker } from '@/components/PhotoMarker';
import { listAlbums } from '@/db/albums';
import { listPins } from '@/db/pins';
import type { AlbumSummary, PinSummary } from '@/lib/types';

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** 앨범 경로를 잇는 순서: 가장 이른 촬영 시각, 없으면 저장한 시각 */
const routeOrder = (pin: PinSummary) => pin.firstTakenAt ?? pin.createdAt;

const toLatLng = (pin: PinSummary): LatLng => ({ latitude: pin.latitude, longitude: pin.longitude });

export default function MapScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const centerRef = useRef<Region>(SEOUL);
  const [pins, setPins] = useState<PinSummary[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [canShowMe, setCanShowMe] = useState(false);

  // 이 화면으로 돌아올 때마다(추가·수정·삭제 후) 핀과 앨범을 다시 읽는다.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listPins(db), listAlbums(db)])
        .then(([pinRows, albumRows]) => {
          if (!active) return;
          setPins(pinRows);
          setAlbums(albumRows);
          // 보고 있던 앨범이 지워졌으면 전체 보기로 돌아간다.
          setSelectedAlbumId((current) =>
            current && albumRows.some((a) => a.id === current) ? current : null,
          );
        })
        .catch((e) => console.warn('핀·앨범 불러오기 실패', e));
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

  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId) ?? null;

  const visiblePins = useMemo(
    () => (selectedAlbumId ? pins.filter((p) => p.albumId === selectedAlbumId) : pins),
    [pins, selectedAlbumId],
  );

  // 앨범을 고르면 그 핀들을 촬영 순서대로 잇는다.
  const route = useMemo(
    () =>
      selectedAlbumId
        ? [...visiblePins].sort((a, b) => routeOrder(a).localeCompare(routeOrder(b))).map(toLatLng)
        : [],
    [visiblePins, selectedAlbumId],
  );

  const fitTo = (targets: PinSummary[]) => {
    if (targets.length === 0) return;
    if (targets.length === 1) {
      mapRef.current?.animateToRegion(
        { ...toLatLng(targets[0]), latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
      return;
    }
    mapRef.current?.fitToCoordinates(targets.map(toLatLng), {
      edgePadding: { top: insets.top + 150, right: 60, bottom: insets.bottom + 110, left: 60 },
      animated: true,
    });
  };

  const selectAlbum = (albumId: string | null) => {
    setSelectedAlbumId(albumId);
    fitTo(albumId ? pins.filter((p) => p.albumId === albumId) : pins);
  };

  const openNewPin = (latitude: number, longitude: number, source: 'map' | 'center') => {
    router.push({
      pathname: '/pin/new',
      params: {
        lat: String(latitude),
        lng: String(longitude),
        source,
        ...(selectedAlbumId ? { albumId: selectedAlbumId } : {}),
      },
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

  let subtitle: string;
  if (selectedAlbum) {
    subtitle = `${selectedAlbum.name} · 핀 ${visiblePins.length}개 · 앨범을 길게 누르면 편집`;
  } else if (pins.length > 0) {
    subtitle = `핀 ${pins.length}개 · 지도를 길게 누르면 그 자리에 추가`;
  } else {
    subtitle = '+ 버튼이나 지도를 길게 눌러 첫 사진을 남겨 보세요';
  }

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
        {route.length >= 2 && (
          <Polyline
            coordinates={route}
            strokeColor="#2f6bff"
            strokeWidth={3}
            lineDashPattern={[10, 6]}
            geodesic
          />
        )}
        {visiblePins.map((pin) => (
          // 핀을 고치면 updatedAt이 바뀌어 마커를 새로 그린다 (대표 사진·사진 수 반영).
          <PhotoMarker
            key={`${pin.id}:${pin.updatedAt}`}
            pin={pin}
            onPress={() => router.push(`/pin/${pin.id}`)}
          />
        ))}
      </MapView>

      <View style={[styles.topArea, { top: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>내 사진 지도</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable
            style={styles.headerButton}
            onPress={() => router.push('/share')}
            hitSlop={8}
            accessibilityLabel="공유"
          >
            <Text style={styles.headerButtonText}>공유</Text>
          </Pressable>
          <Pressable
            style={styles.headerButton}
            onPress={() => router.push('/backup')}
            hitSlop={8}
            accessibilityLabel="백업과 복원"
          >
            <Text style={styles.headerButtonText}>백업</Text>
          </Pressable>
        </View>

        {albums.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.albumBar}
            contentContainerStyle={styles.albumBarContent}
          >
            <Chip
              label={`전체 ${pins.length}`}
              selected={selectedAlbumId === null}
              onPress={() => selectAlbum(null)}
            />
            {albums.map((a) => (
              <Chip
                key={a.id}
                label={`${a.name} ${a.pinCount}`}
                selected={selectedAlbumId === a.id}
                onPress={() => selectAlbum(a.id)}
                onLongPress={() => router.push(`/album/${a.id}`)}
              />
            ))}
          </ScrollView>
        )}
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
  topArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    // 헤더 바탕은 지도 터치를 통과시키고, 안의 버튼만 눌리게 한다.
    pointerEvents: 'box-none',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerText: {
    flex: 1,
    pointerEvents: 'none',
  },
  headerButton: {
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#e8efff',
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2f6bff',
  },
  albumBar: {
    marginTop: 8,
    flexGrow: 0,
  },
  albumBarContent: {
    paddingHorizontal: 16,
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
