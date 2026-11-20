import { usePreventRemove } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createBackupFile, pickBackupFile, restoreFromFile, shareBackupFile } from '@/lib/backup';

type Job = 'export' | 'restore';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function BackupScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 백업·복원 중에는 화면이 닫히지 않게 한다.
  usePreventRemove(job !== null, () => {
    Alert.alert('잠시만 기다려 주세요', '작업이 끝나면 닫을 수 있어요.');
  });

  const run = async (next: Job, task: () => Promise<string | null>) => {
    setJob(next);
    setProgress(null);
    setMessage(null);
    try {
      const result = await task();
      if (result) setMessage(result);
    } catch (e) {
      console.warn(next === 'export' ? '백업 실패' : '복원 실패', e);
      Alert.alert(next === 'export' ? '백업하지 못했어요' : '복원하지 못했어요', errorMessage(e));
    } finally {
      setJob(null);
      setProgress(null);
    }
  };

  const onExport = () =>
    run('export', async () => {
      const result = await createBackupFile(db, (done, total) => setProgress({ done, total }));
      await shareBackupFile(result.uri);
      const missing =
        result.missingPhotos > 0 ? ` (파일이 없는 사진 ${result.missingPhotos}장은 빠졌어요)` : '';
      return `핀 ${result.pins}개, 사진 ${result.photos}장, 앨범 ${result.albums}개를 백업 파일에 담았어요.${missing}`;
    });

  const restore = () =>
    run('restore', async () => {
      const file = await pickBackupFile();
      if (!file) return null;
      const result = await restoreFromFile(db, file, (done, total) => setProgress({ done, total }));
      const skipped = result.skippedPins > 0 ? ` 이미 있던 핀 ${result.skippedPins}개는 건너뛰었어요.` : '';
      return `핀 ${result.pins}개, 사진 ${result.photos}장, 앨범 ${result.albums}개를 더했어요.${skipped}`;
    });

  const onRestore = () => {
    Alert.alert(
      '백업에서 복원할까요?',
      '백업 파일에 있는 핀 중 이 폰에 없는 것만 더해요. 지금 있는 핀과 사진은 바뀌지 않아요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '파일 고르기', onPress: restore },
      ],
    );
  };

  const busyText =
    job === 'export'
      ? progress
        ? `사진 담는 중… ${progress.done} / ${progress.total}`
        : '백업 준비 중…'
      : progress
        ? `사진 가져오는 중… ${progress.done} / ${progress.total}`
        : '백업 파일 읽는 중…';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>백업 파일 만들기</Text>
        <Text style={styles.cardBody}>
          핀·사진·앨범을 백업 파일(.zip) 하나로 묶어요. 공유 창에서 &apos;파일에 저장&apos;(iCloud
          Drive)이나 Google Drive 같은 곳에 보관해 두세요. 컴퓨터에서 압축을 풀면 사진을 바로 꺼낼
          수도 있어요.
        </Text>
        <Pressable
          style={[styles.button, job !== null && styles.disabled]}
          onPress={onExport}
          disabled={job !== null}
        >
          <Text style={styles.buttonText}>백업 파일 만들기</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>백업에서 복원하기</Text>
        <Text style={styles.cardBody}>
          새 폰이나 앱을 다시 설치했을 때 백업 파일을 골라 되살려요. 이 폰에 없는 핀만 더하고, 이미
          있는 핀은 그대로 둬요.
        </Text>
        <Pressable
          style={[styles.button, styles.secondaryButton, job !== null && styles.disabled]}
          onPress={onRestore}
          disabled={job !== null}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>백업 파일 고르기</Text>
        </Pressable>
      </View>

      {job !== null && (
        <View style={styles.status}>
          <ActivityIndicator />
          <Text style={styles.statusText}>{busyText}</Text>
        </View>
      )}
      {message && job === null && <Text style={styles.message}>✅ {message}</Text>}
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
  card: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1b1f27',
  },
  cardBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: '#5b6372',
  },
  button: {
    marginTop: 14,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2f6bff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#e8efff',
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#2f6bff',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#3b4250',
  },
  message: {
    paddingHorizontal: 4,
    fontSize: 14,
    lineHeight: 21,
    color: '#1b1f27',
  },
});
