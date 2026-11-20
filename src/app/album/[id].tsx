import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getAlbum } from '@/db/albums';
import { deleteAlbum, MAX_ALBUM_NAME, renameAlbum } from '@/lib/albumActions';
import type { AlbumSummary } from '@/lib/types';

export default function AlbumEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  // undefined: 불러오는 중, null: 없음
  const [album, setAlbum] = useState<AlbumSummary | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getAlbum(db, id)
      .then((a) => {
        if (!active) return;
        setAlbum(a);
        if (a) setName(a.name);
      })
      .catch((e) => {
        console.warn('앨범 불러오기 실패', e);
        if (active) setAlbum(null);
      });
    return () => {
      active = false;
    };
  }, [db, id]);

  if (album === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (album === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>이 앨범을 찾을 수 없어요</Text>
      </View>
    );
  }

  const canSave = name.trim().length > 0 && name.trim() !== album.name && !busy;

  const save = async () => {
    setBusy(true);
    try {
      await renameAlbum(db, album.id, name);
      router.back();
    } catch (e) {
      Alert.alert('이름을 바꾸지 못했어요', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      '이 앨범을 지울까요?',
      album.pinCount > 0
        ? `핀 ${album.pinCount}개는 지도에 그대로 남고, 앨범에서만 빠져요.`
        : '비어 있는 앨범이에요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAlbum(db, album.id);
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>앨범 이름</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={MAX_ALBUM_NAME}
        returnKeyType="done"
        onSubmitEditing={() => canSave && save()}
      />
      <Text style={styles.hint}>핀 {album.pinCount}개가 들어 있어요</Text>

      <Pressable
        style={[styles.saveButton, !canSave && styles.disabled]}
        onPress={save}
        disabled={!canSave}
      >
        <Text style={styles.saveButtonText}>이름 저장</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={confirmDelete}>
        <Text style={styles.deleteButtonText}>앨범 지우기</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f7f9',
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#9aa1ad',
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1b1f27',
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
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: '#7a8190',
  },
  saveButton: {
    marginTop: 24,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2f6bff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 32,
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
