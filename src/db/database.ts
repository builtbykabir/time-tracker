import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { runMigrations } from './migrations.ts';

export const DEFAULT_DATABASE_PATH = resolve(import.meta.dir, '../../data/time-tracker.sqlite');

export function openDatabase(databasePath: string = DEFAULT_DATABASE_PATH): Database {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath, {
    create: true,
    strict: true,
  });

  try {
    database.run('PRAGMA foreign_keys = ON;');
    database.run('PRAGMA journal_mode = WAL;');
    database.run('PRAGMA busy_timeout = 5000;');
    runMigrations(database);

    return database;
  } catch (error) {
    database.close(true);
    throw error;
  }
}
