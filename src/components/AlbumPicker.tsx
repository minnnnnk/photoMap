import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listAlbums } from '@/db/albums';
import { createAlbum, MAX_ALBUM_NAME } from '@/lib/albumActions';
import type { AlbumSummary } from '@/lib/types';
import { Chip } from './Chip';

type Props = {
  value: string | null;
  onChange: (albumId: string | null) => void;
};

/** 핀을 넣을 앨범 고르기. 그 자리에서 새 앨범도 만들 수 있다. */
export function AlbumPicker({ value, onChange }: Props) {
  const db = useSQLiteContext();
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listAlbums(db)
      .then((rows) => active && setAlbums(rows))
      .catch((e) => console.warn('앨범 목록 불러오기 실패', e));
    return () => {
      active = false;
    };
  }, [db]);

  const closeAdding = () => {
    setAdding(false);
    setName('');
  };

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const album = await createAlbum(db, name);
      setAlbums((prev) => [{ ...album, pinCount: 0 }, ...prev]);
      onChange(album.id);
      closeAdding();
    } catch (e) {
      Alert.alert('앨범을 만들지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.row}
      >
        <Chip label="앨범 없음" selected={value === null} onPress={() => onChange(null)} />
        {albums.map((a) => (
          <Chip key={a.id} label={a.name} selected={value === a.id} onPress={() => onChange(a.id)} />
        ))}
        {!adding && <Chip label="+ 새 앨범" dashed onPress={() => setAdding(true)} />}
      </ScrollView>

      {adding && (
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="앨범 이름 (예: 2026 제주 여행)"
            placeholderTextColor="#9aa1ad"
            maxLength={MAX_ALBUM_NAME}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={add}
          />
          <Pressable
            style={[styles.addButton, (!name.trim() || busy) && styles.disabled]}
            onPress={add}
            disabled={!name.trim() || busy}
          >
            <Text style={styles.addButtonText}>만들기</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={closeAdding} hitSlop={6}>
            <Text style={styles.cancelButtonText}>취소</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexGrow: 0,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dce4',
    backgroundColor: '#fff',
    fontSize: 14,
    color: '#1b1f27',
  },
  addButton: {
    marginLeft: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#2f6bff',
  },
  disabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    marginLeft: 6,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  cancelButtonText: {
    color: '#5b6372',
    fontSize: 14,
  },
});
