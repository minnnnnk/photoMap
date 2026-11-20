import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_ALBUM_NAME } from '@/lib/albumActions';
import { useAuth } from '@/lib/auth';
import { shareErrorMessage } from '@/lib/shareErrors';
import {
  deleteSharedAlbum,
  getSharedAlbum,
  removeMember,
  renameSharedAlbum,
  type SharedAlbum,
  type SharedAlbumMember,
} from '@/lib/sharedAlbums';

type Loaded = { album: SharedAlbum; members: SharedAlbumMember[] };

export default function SharedAlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  // undefined: 불러오는 중, null: 없음(권한 없음 포함)
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // 이 값을 올리면 앨범을 다시 읽는다 (이름 변경·멤버 내보내기 뒤).
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    getSharedAlbum(id)
      .then((result) => {
        if (!active) return;
        setData(result);
        if (result) setName(result.album.name);
      })
      .catch((e) => {
        console.warn('공유 앨범 불러오기 실패', e);
        if (!active) return;
        setData(null);
        Alert.alert('공유 앨범을 불러오지 못했어요', shareErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

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
        <Text style={styles.muted}>이 공유 앨범을 볼 수 없어요</Text>
      </View>
    );
  }

  const { album, members } = data;
  const myId = session?.user.id;
  const isOwner = album.ownerId === myId;
  const canRename = isOwner && name.trim().length > 0 && name.trim() !== album.name && !busy;

  const runTask = async (task: () => Promise<void>, failTitle: string) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      Alert.alert(failTitle, shareErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onRename = () =>
    runTask(async () => {
      await renameSharedAlbum(album.id, name);
      reload();
    }, '이름을 바꾸지 못했어요');

  const onShareCode = () => {
    Share.share({
      message:
        `포토맵 공유 앨범 "${album.name}"에 초대해요!\n` +
        `앱에서 지도 위 "공유" → "초대 코드로 참여"를 누르고 이 코드를 넣어 주세요.\n\n` +
        `초대 코드: ${album.inviteCode}`,
    }).catch(() => {});
  };

  const onKick = (member: SharedAlbumMember) => {
    Alert.alert(`${member.nickname}님을 내보낼까요?`, '그동안 올린 핀은 앨범에 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '내보내기',
        style: 'destructive',
        onPress: () =>
          runTask(async () => {
            await removeMember(album.id, member.userId);
            reload();
          }, '내보내지 못했어요'),
      },
    ]);
  };

  const onLeave = () => {
    if (!myId) return;
    Alert.alert('이 앨범에서 나갈까요?', '내가 올린 핀은 앨범에 남아요. 초대 코드로 다시 참여할 수 있어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () =>
          runTask(async () => {
            await removeMember(album.id, myId);
            router.back();
          }, '나가지 못했어요'),
      },
    ]);
  };

  const onDelete = () => {
    Alert.alert(
      '이 공유 앨범을 지울까요?',
      '모든 멤버의 핀과 사진이 서버에서 지워지고 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: () =>
            runTask(async () => {
              await deleteSharedAlbum(album.id);
              router.back();
            }, '지우지 못했어요'),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: album.name }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.label}>초대 코드</Text>
          <Text style={styles.code} selectable>
            {album.inviteCode}
          </Text>
          <Text style={styles.hint}>이 코드를 받은 사람은 누구나 앨범에 참여할 수 있어요.</Text>
          <Pressable style={styles.button} onPress={onShareCode}>
            <Text style={styles.buttonText}>초대 코드 보내기</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>멤버 {members.length}명</Text>
          {members.map((m) => (
            <View key={m.userId} style={styles.memberRow}>
              <Text style={styles.memberName}>
                {m.nickname}
                {m.userId === myId ? ' (나)' : ''}
              </Text>
              {m.role === 'owner' ? (
                <Text style={styles.ownerBadge}>주인</Text>
              ) : isOwner ? (
                <Pressable onPress={() => onKick(m)} hitSlop={8} disabled={busy}>
                  <Text style={styles.dangerLink}>내보내기</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        {isOwner && (
          <View style={styles.card}>
            <Text style={styles.label}>앨범 이름</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              maxLength={MAX_ALBUM_NAME}
              returnKeyType="done"
              onSubmitEditing={() => canRename && onRename()}
            />
            <Pressable
              style={[styles.button, styles.secondaryButton, !canRename && styles.disabled]}
              onPress={onRename}
              disabled={!canRename}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>이름 저장</Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.dangerButton} onPress={isOwner ? onDelete : onLeave} disabled={busy}>
          <Text style={styles.dangerButtonText}>{isOwner ? '공유 앨범 지우기' : '앨범에서 나가기'}</Text>
        </Pressable>
        {busy && <ActivityIndicator style={styles.spinner} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#9aa1ad' },
  spinner: { marginTop: 16 },
  card: { marginBottom: 14, padding: 16, borderRadius: 14, backgroundColor: '#fff' },
  label: { fontSize: 14, fontWeight: '700', color: '#1b1f27' },
  code: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#2f6bff',
    fontVariant: ['tabular-nums'],
  },
  hint: { marginTop: 4, fontSize: 12, color: '#7a8190' },
  input: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dce4',
    fontSize: 15,
    color: '#1b1f27',
  },
  button: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#2f6bff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: { backgroundColor: '#e8efff' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButtonText: { color: '#2f6bff' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e3e7ee',
  },
  memberName: { fontSize: 15, color: '#1b1f27' },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#e8efff',
    color: '#2f6bff',
    fontSize: 12,
    fontWeight: '700',
  },
  dangerLink: { fontSize: 13, fontWeight: '600', color: '#d93636' },
  dangerButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fdecec',
  },
  dangerButtonText: { color: '#d93636', fontSize: 14, fontWeight: '600' },
});
