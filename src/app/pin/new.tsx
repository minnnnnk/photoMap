import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gpsFromExif, takenAtFromExif } from '@/lib/exif';
import { formatCoord } from '@/lib/format';
import { savePin, type DraftPhoto } from '@/lib/pinActions';
import type { Coord } from '@/lib/types';

/** 지금 핀 위치가 어디서 왔는지 */
type LocationSource = 'map' | 'center' | 'photo' | 'manual';

const SOURCE_LABEL: Record<LocationSource, string> = {
  map: '지도에서 길게 누른 곳',
  center: '보고 있던 지도의 가운데',
  photo: '사진에 담긴 위치',
  manual: '직접 고른 곳',
};

const SEOUL: Coord = { latitude: 37.5665, longitude: 126.978 };
const MAX_PHOTOS = 20;

function coordFromParams(lat?: string, lng?: string): Coord | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!lat || !lng || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function NewPinScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; source?: string }>();
  const mapRef = useRef<MapView>(null);

  // 처음 위치는 지도 화면에서 넘어온 값으로 한 번만 정한다.
  const [initial] = useState<Coord>(() => coordFromParams(params.lat, params.lng) ?? SEOUL);
  const [coord, setCoord] = useState<Coord>(initial);
  const [source, setSource] = useState<LocationSource>(params.source === 'map' ? 'map' : 'center');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const photoGps = photos.find((p) => p.gps)?.gps ?? null;
  const canUsePhotoGps = photoGps != null && source !== 'photo';

  const moveTo = (next: Coord, nextSource: LocationSource) => {
    setCoord(next);
    setSource(nextSource);
    mapRef.current?.animateToRegion({ ...next, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  };

  const pickPhotos = async () => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert(`사진은 핀 하나에 ${MAX_PHOTOS}장까지 넣을 수 있어요`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      exif: true,
      quality: 1,
    });
    if (result.canceled) return;

    const drafts: DraftPhoto[] = result.assets.slice(0, remaining).map((asset) => ({
      id: Crypto.randomUUID(),
      sourceUri: asset.uri,
      width: asset.width,
      height: asset.height,
      takenAt: takenAtFromExif(asset.exif),
      gps: gpsFromExif(asset.exif),
    }));
    setPhotos((prev) => [...prev, ...drafts]);

    // 위치를 사용자가 정하지 않았을 때만 사진 위치로 자동 이동한다.
    const gps = drafts.find((d) => d.gps)?.gps;
    if (gps && source === 'center') moveTo(gps, 'photo');
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const onMapPress = (e: MapPressEvent) => {
    moveTo(e.nativeEvent.coordinate, 'manual');
  };

  const onSave = async () => {
    if (photos.length === 0) {
      Alert.alert('사진을 한 장 이상 골라 주세요');
      return;
    }
    setSaving(true);
    try {
      await savePin(db, {
        id: Crypto.randomUUID(),
        title: title.trim(),
        memo: memo.trim(),
        latitude: coord.latitude,
        longitude: coord.longitude,
        photos,
      });
      router.back();
    } catch (e) {
      console.warn('핀 저장 실패', e);
      Alert.alert('저장하지 못했어요', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.label}>사진</Text>
      {photos.length === 0 ? (
        <Pressable style={styles.pickEmpty} onPress={pickPhotos}>
          <Text style={styles.pickEmptyIcon}>🖼️</Text>
          <Text style={styles.pickEmptyText}>앨범에서 사진 고르기</Text>
          <Text style={styles.hint}>여러 장을 한 번에 고를 수 있어요</Text>
        </Pressable>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
          {photos.map((p) => (
            <View key={p.id} style={styles.thumbWrap}>
              <Image source={{ uri: p.sourceUri }} style={styles.thumb} />
              {p.gps && <Text style={styles.thumbGps}>📍</Text>}
              <Pressable
                style={styles.thumbRemove}
                onPress={() => removePhoto(p.id)}
                hitSlop={8}
                accessibilityLabel="사진 빼기"
              >
                <Text style={styles.thumbRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <Pressable style={[styles.thumb, styles.thumbAdd]} onPress={pickPhotos}>
              <Text style={styles.thumbAddText}>+</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      <Text style={styles.label}>위치</Text>
      <View style={styles.mapBox}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          onPress={onMapPress}
        >
          <Marker coordinate={coord} />
        </MapView>
      </View>
      <Text style={styles.locationText}>
        {SOURCE_LABEL[source]} · {formatCoord(coord.latitude, coord.longitude)}
      </Text>
      <Text style={styles.hint}>지도를 누르면 그 자리로 핀을 옮길 수 있어요</Text>
      {canUsePhotoGps && (
        <Pressable style={styles.secondaryButton} onPress={() => moveTo(photoGps, 'photo')}>
          <Text style={styles.secondaryButtonText}>📍 사진에 담긴 위치로 옮기기</Text>
        </Pressable>
      )}
      {photos.length > 0 && !photoGps && (
        <Text style={styles.hint}>고른 사진에는 위치 정보가 없어요. 지도에서 직접 골라 주세요.</Text>
      )}

      <Text style={styles.label}>제목</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="예: 성수동 카페, 교토 여행 첫날"
        placeholderTextColor="#9aa1ad"
        maxLength={80}
        returnKeyType="next"
      />

      <Text style={styles.label}>메모</Text>
      <TextInput
        style={[styles.input, styles.memo]}
        value={memo}
        onChangeText={setMemo}
        placeholder="여기서 있었던 일, 누구랑 왔는지…"
        placeholderTextColor="#9aa1ad"
        multiline
        textAlignVertical="top"
      />

      <Pressable
        style={[styles.saveButton, (saving || photos.length === 0) && styles.saveButtonDisabled]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>지도에 저장</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const THUMB = 84;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f7f9',
  },
  content: {
    padding: 16,
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1b1f27',
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: '#7a8190',
  },
  pickEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#b9c1cf',
    backgroundColor: '#fff',
  },
  pickEmptyIcon: {
    fontSize: 30,
  },
  pickEmptyText: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#2f6bff',
  },
  thumbRow: {
    flexGrow: 0,
  },
  thumbWrap: {
    marginRight: 8,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    backgroundColor: '#e3e7ee',
  },
  thumbGps: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    fontSize: 14,
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  thumbAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#b9c1cf',
    backgroundColor: '#fff',
  },
  thumbAddText: {
    fontSize: 28,
    color: '#7a8190',
  },
  mapBox: {
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#e3e7ee',
  },
  locationText: {
    marginTop: 8,
    fontSize: 13,
    color: '#3b4250',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#e8efff',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2f6bff',
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dce4',
    backgroundColor: '#fff',
    fontSize: 15,
    color: '#1b1f27',
  },
  memo: {
    minHeight: 110,
  },
  saveButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#2f6bff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
