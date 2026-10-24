import AsyncStorage from '@react-native-async-storage/async-storage';
import SQLite from 'react-native-sqlite-storage';
import { AppEvent } from './protocol';

export type Preferences = {
  ip: string;
  port: string;
  autoReconnect: boolean;
  notifications: boolean;
};
export const defaults: Preferences = {
  ip: '',
  port: '81',
  autoReconnect: true,
  notifications: true,
};
const PREFS = 'homesafe.preferences.v1';
SQLite.enablePromise(true);
const dbPromise = SQLite.openDatabase({
  name: 'homesafe-event-history.sqlite',
  location: 'default',
});
let schemaPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaPromise)
    schemaPromise = (async () => {
      const db = await dbPromise;
      await db.executeSql(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      event_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      uptime_ms INTEGER NOT NULL,
      received_at_ms INTEGER NOT NULL,
      payload TEXT NOT NULL
    )`);
      await db.executeSql(
        'CREATE INDEX IF NOT EXISTS events_received_at ON events(received_at_ms DESC)',
      );
    })();
  return schemaPromise;
}

export async function loadPrefs(): Promise<Preferences> {
  try {
    return {
      ...defaults,
      ...JSON.parse((await AsyncStorage.getItem(PREFS)) || '{}'),
    };
  } catch {
    return defaults;
  }
}
export const savePrefs = (p: Preferences) =>
  AsyncStorage.setItem(PREFS, JSON.stringify(p));

export async function loadEvents(): Promise<AppEvent[]> {
  await ensureSchema();
  const db = await dbPromise;
  const [result] = await db.executeSql(
    'SELECT payload FROM events ORDER BY received_at_ms DESC LIMIT 500',
  );
  return Array.from({ length: result.rows.length }, (_, i) =>
    result.rows.item(i),
  ).flatMap(row => {
    try {
      return [JSON.parse(row.payload) as AppEvent];
    } catch {
      return [];
    }
  });
}

export async function storeEvent(event: AppEvent): Promise<AppEvent[]> {
  await ensureSchema();
  const db = await dbPromise;
  await db.executeSql(
    'INSERT OR IGNORE INTO events (id,event_id,sequence,type,uptime_ms,received_at_ms,payload) VALUES (?,?,?,?,?,?,?)',
    [
      event.id,
      event.event_id,
      event.sequence,
      event.type,
      event.uptime,
      event.receivedAt,
      JSON.stringify(event),
    ],
  );
  await db.executeSql(
    'DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY received_at_ms DESC LIMIT 500)',
  );
  return loadEvents();
}

export async function clearEvents() {
  await ensureSchema();
  const db = await dbPromise;
  await db.executeSql('DELETE FROM events');
}
