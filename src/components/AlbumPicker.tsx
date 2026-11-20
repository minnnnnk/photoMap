import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listAlbums } from '@/db/albums';
import { createAlbum, MAX_ALBUM_NAME } from '@/lib/albumActions';
import { useAuth } from '@/lib/auth';
import type { AlbumChoice } from '@/lib/pinActions';
import { listSharedAlbums, type SharedAlbum } from '@/lib/sharedAlbums';
import type { AlbumSummary } from '@/lib/types';
import { Chip } from './Chip';

type Props = {
  value: AlbumChoice;
  onChange: (album: AlbumChoice) => void;
  /** 로그인했을 때 공유 앨범도 고를 수 있게 한다 */
  allowShared: boolean;
};

const sameChoice = (a: AlbumChoice, kind: 'local' | 'shared', id: string) =>
  a?.kind === kind && a.id === id;

/** 핀을 넣을 앨범 고르기. 그 자리에서 새 앨범(이 기기)도 만들 수 있다. */
export function AlbumPicker({ value, onChange, allowShared }: Props) {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [sharedAlbums, setSharedAlbums] = useState<SharedAlbum[] | null>(null);
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

  const showShared = allowShared && session != null;
  useEffect(() => {
    if (!showShared) return;
    let active = true;
    listSharedAlbums()
      .then((rows) => active && setSharedAlbums(rows))
      .catch((e) => {
        console.warn('공유 앨범 불러오기 실패', e);
        if (active) setSharedAlbums([]);
      });
    return () => {
      active = false;
    };
  }, [showShared]);

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
      onChange({ kind: 'local', id: album.id });
      closeAdding();
    } catch (e) {
      Alert.alert('앨범을 만들지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // 지도에서 넘어온 공유 앨범이 아직 목록에 없으면(불러오는 중 등) 자리표시 칩으로 보여 준다.
  const unknownShared =
    value?.kind === 'shared' && !(sharedAlbums ?? []).some((a) => a.id === value.id);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.row}
      >
        <Chip label="앨범 없음" selected={value === null} onPress={() => onChange(null)} />
        {unknownShared && <Chip label="👥 공유 앨범" selected onPress={() => {}} />}
        {showShared &&
          (sharedAlbums ?? []).map((a) => (
            <Chip
              key={`shared:${a.id}`}
              label={`👥 ${a.name}`}
              selected={sameChoice(value, 'shared', a.id)}
              onPress={() => onChange({ kind: 'shared', id: a.id })}
            />
          ))}
        {albums.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            selected={sameChoice(value, 'local', a.id)}
            onPress={() => onChange({ kind: 'local', id: a.id })}
          />
        ))}
        {!adding && <Chip label="+ 새 앨범" dashed onPress={() => setAdding(true)} />}
      </ScrollView>

      {value?.kind === 'shared' && (
        <Text style={styles.sharedHint}>
          👥 공유 앨범에 저장하면 사진이 서버에 올라가 앨범 멤버들과 함께 봐요.
        </Text>
      )}

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
  sharedHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#b25e00',
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
