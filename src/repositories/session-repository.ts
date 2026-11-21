import type { Database } from 'bun:sqlite';

export class SessionRepository {
  constructor(private readonly db: Database) {}
}
