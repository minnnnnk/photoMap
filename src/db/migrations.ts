import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

/**
 * 앱이 켜질 때마다 SQLiteProvider의 onInit에서 실행된다.
 * PRAGMA user_version으로 스키마 버전을 관리하고, 버전을 올릴 때는
 * 아래에 `if (version === N)` 단계를 하나씩 추가한다.
 */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  // 외래 키 설정은 연결마다 켜야 해서 버전과 상관없이 매번 실행한다.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE pins (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT NOT NULL DEFAULT '',
        memo        TEXT NOT NULL DEFAULT '',
        latitude    REAL NOT NULL,
        longitude   REAL NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE photos (
        id          TEXT PRIMARY KEY NOT NULL,
        pin_id      TEXT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
        file_name   TEXT NOT NULL,
        width       INTEGER,
        height      INTEGER,
        taken_at    TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
      );

      CREATE INDEX idx_photos_pin ON photos(pin_id, sort_order);
    `);
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
