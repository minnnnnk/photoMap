import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_ALBUM_NAME } from '@/lib/albumActions';
import { MAX_NICKNAME, useAuth } from '@/lib/auth';
import { shareErrorMessage } from '@/lib/shareErrors';
import {
  createSharedAlbum,
  joinSharedAlbum,
  listSharedAlbums,
  type SharedAlbum,
} from '@/lib/sharedAlbums';

const RESEND_SECONDS = 60;

export default function ShareScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();

  let body: ReactNode;
  if (!auth.configured) {
    body = (
      <Text style={styles.muted}>
        공유 기능이 설정되지 않았어요. 프로젝트의 .env.local에 Supabase 주소와 키를 넣어 주세요.
      </Text>
    );
  } else if (auth.loading) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (!auth.session) {
    body = <EmailLogin />;
  } else if (!auth.profile) {
    body = <NicknameForm />;
  } else {
    body = <SharedAlbumList />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {body}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- 로그인

function EmailLogin() {
  const { sendCode, verifyCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSend = async () => {
    if (!validEmail || busy || cooldown > 0) return;
    setBusy(true);
    try {
      await sendCode(email);
      setStep('code');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      Alert.alert('코드를 보내지 못했어요', shareErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (code.trim().length < 6 || busy) return;
    setBusy(true);
    try {
      await verifyCode(email, code);
      // 성공하면 AuthProvider가 로그인 상태를 바꾸고 화면이 다음 단계로 넘어간다.
    } catch (e) {
      Alert.alert('로그인하지 못했어요', shareErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>로그인</Text>
      <Text style={styles.cardBody}>
        공유 앨범을 쓰려면 로그인이 필요해요. 이메일로 받은 코드를 넣으면 돼요. 비밀번호는 없어요.
      </Text>

      <TextInput
        style={[styles.input, step === 'code' && styles.inputDone]}
        value={email}
        onChangeText={setEmail}
        placeholder="이메일 주소"
        placeholderTextColor="#9aa1ad"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={step === 'email'}
        returnKeyType="send"
        onSubmitEditing={onSend}
      />

      {step === 'email' ? (
        <PrimaryButton label="코드 받기" onPress={onSend} disabled={!validEmail} busy={busy} />
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            placeholder="메일로 받은 코드"
            placeholderTextColor="#9aa1ad"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={10}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onVerify}
          />
          <PrimaryButton label="로그인" onPress={onVerify} disabled={code.trim().length < 6} busy={busy} />
          <View style={styles.row}>
            <Pressable onPress={onSend} disabled={cooldown > 0 || busy} hitSlop={8}>
              <Text style={[styles.link, cooldown > 0 && styles.linkDisabled]}>
                {cooldown > 0 ? `코드 다시 받기 (${cooldown}초)` : '코드 다시 받기'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setStep('email');
                setCode('');
              }}
              hitSlop={8}
            >
              <Text style={styles.link}>이메일 바꾸기</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>메일이 안 보이면 스팸함도 확인해 주세요.</Text>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- 닉네임

function NicknameForm() {
  const { saveNickname, signOut } = useAuth();
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    if (!nickname.trim() || busy) return;
    setBusy(true);
    try {
      await saveNickname(nickname);
    } catch (e) {
      Alert.alert('닉네임을 저장하지 못했어요', shareErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>닉네임 정하기</Text>
      <Text style={styles.cardBody}>공유 앨범에서 다른 사람에게 보일 이름이에요.</Text>
      <TextInput
        style={styles.input}
        value={nickname}
        onChangeText={setNickname}
        placeholder="예: 민규"
        placeholderTextColor="#9aa1ad"
        maxLength={MAX_NICKNAME}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSave}
      />
      <PrimaryButton label="저장" onPress={onSave} disabled={!nickname.trim()} busy={busy} />
      <Pressable onPress={() => signOut().catch(() => {})} hitSlop={8} style={styles.centerLink}>
        <Text style={styles.link}>다른 이메일로 로그인</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- 공유 앨범 목록

function SharedAlbumList() {
  const { session, profile, signOut } = useAuth();
  const [albums, setAlbums] = useState<SharedAlbum[] | null>(null);
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAlbums(await listSharedAlbums());
    } catch (e) {
      console.warn('공유 앨범 불러오기 실패', e);
      setAlbums([]);
      Alert.alert('공유 앨범을 불러오지 못했어요', shareErrorMessage(e));
    }
  }, []);

  // 앨범 화면에서 이름을 바꾸거나 나가고 돌아오면 다시 읽는다.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openMode = (next: 'create' | 'join') => {
    setMode(next);
    setText('');
  };

  const onSubmit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const albumId =
        mode === 'create' ? (await createSharedAlbum(text)).id : await joinSharedAlbum(text);
      setMode('none');
      setText('');
      await load();
      router.push(`/share/${albumId}`);
    } catch (e) {
      Alert.alert(mode === 'create' ? '앨범을 만들지 못했어요' : '참여하지 못했어요', shareErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = () => {
    Alert.alert('로그아웃할까요?', '공유 앨범은 서버에 그대로 남아 있어요. 다시 로그인하면 볼 수 있어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => signOut().catch((e) => Alert.alert('로그아웃하지 못했어요', shareErrorMessage(e))),
      },
    ]);
  };

  return (
    <>
      <View style={styles.accountRow}>
        <View style={styles.flex}>
          <Text style={styles.accountName}>{profile?.nickname}님</Text>
          <Text style={styles.hint}>{session?.user.email}</Text>
        </View>
        <Pressable onPress={onSignOut} hitSlop={8}>
          <Text style={styles.link}>로그아웃</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>내 공유 앨범</Text>
      {albums === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : albums.length === 0 ? (
        <Text style={styles.muted}>
          아직 공유 앨범이 없어요. 새로 만들어 초대 코드를 보내거나, 받은 초대 코드로 참여해 보세요.
        </Text>
      ) : (
        albums.map((a) => (
          <Pressable
            key={a.id}
            style={({ pressed }) => [styles.albumRow, pressed && styles.pressed]}
            onPress={() => router.push(`/share/${a.id}`)}
          >
            <View style={styles.flex}>
              <Text style={styles.albumName}>👥 {a.name}</Text>
              <Text style={styles.hint}>
                멤버 {a.memberCount}명{a.ownerId === session?.user.id ? ' · 내가 만든 앨범' : ''}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))
      )}

      {mode === 'none' ? (
        <View style={styles.buttonRow}>
          <PrimaryButton label="새 공유 앨범" onPress={() => openMode('create')} style={styles.flex} />
          <SecondaryButton label="초대 코드로 참여" onPress={() => openMode('join')} style={styles.flex} />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{mode === 'create' ? '새 공유 앨범' : '초대 코드로 참여'}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={mode === 'create' ? '앨범 이름 (예: 우리 여행)' : '초대 코드 10자리'}
            placeholderTextColor="#9aa1ad"
            maxLength={mode === 'create' ? MAX_ALBUM_NAME : 20}
            autoCapitalize={mode === 'join' ? 'characters' : 'sentences'}
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
          <View style={styles.buttonRow}>
            <SecondaryButton label="취소" onPress={() => setMode('none')} style={styles.flex} />
            <PrimaryButton
              label={mode === 'create' ? '만들기' : '참여하기'}
              onPress={onSubmit}
              disabled={!text.trim()}
              busy={busy}
              style={styles.flex}
            />
          </View>
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 버튼

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: object;
};

function PrimaryButton({ label, onPress, disabled, busy, style }: ButtonProps) {
  return (
    <Pressable
      style={[styles.button, (disabled || busy) && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, style }: ButtonProps) {
  return (
    <Pressable style={[styles.button, styles.secondaryButton, style]} onPress={onPress}>
      <Text style={[styles.buttonText, styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { padding: 16 },
  flex: { flex: 1 },
  spinner: { marginVertical: 24 },
  card: { marginTop: 12, padding: 16, borderRadius: 14, backgroundColor: '#fff' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1b1f27' },
  cardBody: { marginTop: 6, fontSize: 13, lineHeight: 20, color: '#5b6372' },
  input: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dce4',
    backgroundColor: '#fff',
    fontSize: 15,
    color: '#1b1f27',
  },
  inputDone: { backgroundColor: '#f1f3f6', color: '#5b6372' },
  button: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2f6bff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: { backgroundColor: '#e8efff' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButtonText: { color: '#2f6bff' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  link: { fontSize: 14, fontWeight: '600', color: '#2f6bff' },
  linkDisabled: { color: '#9aa1ad' },
  centerLink: { alignSelf: 'center', marginTop: 16 },
  hint: { marginTop: 4, fontSize: 12, color: '#7a8190' },
  muted: { fontSize: 14, lineHeight: 21, color: '#7a8190' },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  accountName: { fontSize: 16, fontWeight: '700', color: '#1b1f27' },
  sectionTitle: { marginTop: 22, marginBottom: 8, fontSize: 14, fontWeight: '700', color: '#1b1f27' },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  pressed: { opacity: 0.7 },
  albumName: { fontSize: 15, fontWeight: '600', color: '#1b1f27' },
  chevron: { fontSize: 22, color: '#9aa1ad' },
});
