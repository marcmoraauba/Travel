import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migraciones por versión (PRAGMA user_version). Añadir siempre al final, nunca editar
 * una migración publicada: los móviles de los usuarios ya la han aplicado.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE trips (
    id TEXT PRIMARY KEY NOT NULL,
    city TEXT NOT NULL,
    center_lat REAL NOT NULL,
    center_lng REAL NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    pace TEXT NOT NULL DEFAULT 'normal',
    transport_mode TEXT NOT NULL DEFAULT 'walking',
    base_name TEXT,
    base_lat REAL,
    base_lng REAL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE days (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '09:00',
    end_time TEXT NOT NULL DEFAULT '20:00',
    notes TEXT NOT NULL DEFAULT '',
    optimized_at TEXT
  );
  CREATE INDEX idx_days_trip ON days(trip_id, date);

  CREATE TABLE places (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id TEXT REFERENCES days(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    lat REAL,
    lng REAL,
    address TEXT,
    category TEXT,
    visit_minutes INTEGER NOT NULL DEFAULT 60,
    priority TEXT NOT NULL DEFAULT 'optional',
    opening_hours TEXT,
    hours_source TEXT,
    price TEXT,
    requires_booking INTEGER NOT NULL DEFAULT 0,
    origin TEXT NOT NULL DEFAULT 'manual',
    geocoded INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_places_trip ON places(trip_id);
  CREATE INDEX idx_places_day ON places(day_id);

  CREATE TABLE day_stops (
    id TEXT PRIMARY KEY NOT NULL,
    day_id TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    arrival TEXT NOT NULL,
    start TEXT NOT NULL,
    departure TEXT NOT NULL,
    travel_minutes INTEGER NOT NULL,
    wait_minutes INTEGER NOT NULL
  );
  CREATE INDEX idx_stops_day ON day_stops(day_id, position);

  CREATE TABLE bookings (
    id TEXT PRIMARY KEY NOT NULL,
    place_id TEXT NOT NULL UNIQUE REFERENCES places(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE guides (
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    length TEXT NOT NULL,
    text TEXT NOT NULL,
    audio_path TEXT,
    generated_at TEXT NOT NULL,
    PRIMARY KEY (place_id, language, length)
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
