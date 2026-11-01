import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StorageOptions {
  path?: string; // ':memory:' or file path
  verbose?: boolean;
}

export function createDatabase(options: StorageOptions = {}): Database.Database {
  const dbPath = options.path || ':memory:';

  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath, {
    verbose: options.verbose ? console.log : undefined,
  });

  // Enable WAL mode for high performance concurrency on disk databases
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  // Initialize schema
  db.exec(SCHEMA_SQL);

  return db;
}

