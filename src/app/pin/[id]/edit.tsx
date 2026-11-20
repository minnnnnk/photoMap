import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PinForm } from '@/components/PinForm';
import { getPin } from '@/db/pins';
import { editPin, toFormValues, type PinFormValues } from '@/lib/pinActions';

export default function EditPinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  // undefined: 불러오는 중, null: 없음
  const [initialValues, setInitialValues] = useState<PinFormValues | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getPin(db, id)
      .then((detail) => active && setInitialValues(detail ? toFormValues(detail) : null))
      .catch((e) => {
        console.warn('핀 불러오기 실패', e);
        if (active) setInitialValues(null);
      });
    return () => {
      active = false;
    };
  }, [db, id]);

  if (initialValues === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (initialValues === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>이 핀을 찾을 수 없어요</Text>
      </View>
    );
  }

  return (
    <PinForm
      initialValues={initialValues}
      initialSource="saved"
      submitLabel="수정 내용 저장"
      onSubmit={(values) => editPin(db, id, values)}
      onSaved={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#9aa1ad',
  },
});
