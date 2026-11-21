import type { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Migration {
  version: number;
  name: string;
  fileName: string;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    fileName: '001_initial_schema.sql',
  },
];

function readMigrationSql(fileName: string): string {
  return readFileSync(resolve(import.meta.dir, 'migrations', fileName), 'utf8');
}

export function runMigrations(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);

  const hasMigration = database.query<{ version: number }, [version: number]>(
    'SELECT version FROM schema_migrations WHERE version = ?',
  );

  const recordMigration = database.query<never, [version: number, name: string, appliedAt: number]>(
    `INSERT INTO schema_migrations (version, name, applied_at)
     VALUES (?, ?, ?)`,
  );

  for (const migration of migrations) {
    if (hasMigration.get(migration.version) !== null) {
      continue;
    }

    database.transaction(() => {
      database.run(readMigrationSql(migration.fileName));
      recordMigration.run(migration.version, migration.name, Date.now());
    })();
  }
}
