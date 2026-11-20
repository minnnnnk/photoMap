import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 2;

/**
 * 앱이 켜질 때마다 SQLiteProvider의 onInit에서 실행된다.
 * PRAGMA user_version으로 스키마 버전을 관리한다. 버전을 올릴 때는
 * DATABASE_VERSION을 올리고 아래에 `if (version === N)` 단계를 하나씩 추가한다.
 * 단계들은 한 트랜잭션 안에서 실행되어, 중간에 실패하면 이전 버전 그대로 남는다.
 */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  // 외래 키 설정은 연결마다 켜야 해서 버전과 상관없이 매번 실행한다.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  // journal_mode는 트랜잭션 안에서 바꿀 수 없어서 따로 실행한다.
  if (version === 0) {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }

  await db.withTransactionAsync(async () => {
    // 1: 핀과 사진
    if (version === 0) {
      await db.execAsync(`
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

    // 2: 사진별 위치 (EXIF GPS). 이전에 저장한 사진은 NULL로 남는다.
    if (version === 1) {
      await db.execAsync(`
        ALTER TABLE photos ADD COLUMN latitude REAL;
        ALTER TABLE photos ADD COLUMN longitude REAL;
      `);
      version = 2;
    }

    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}
