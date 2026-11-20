import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { migrateDb } from '@/db/migrations';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="photomap.db" onInit={migrateDb}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerBackTitle: '지도' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pin/new" options={{ title: '사진 추가', presentation: 'modal' }} />
        <Stack.Screen name="pin/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="pin/[id]/edit" options={{ title: '핀 수정', presentation: 'modal' }} />
        <Stack.Screen name="album/[id]" options={{ title: '앨범 편집', presentation: 'modal' }} />
        <Stack.Screen name="backup" options={{ title: '백업과 복원', presentation: 'modal' }} />
      </Stack>
    </SQLiteProvider>
  );
}
