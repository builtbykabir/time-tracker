import type { Database } from 'bun:sqlite';

import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { StatisticsSessionRecord } from '../types/statistics.ts';

type StatisticsSessionRow = {
  id: number;
  category_id: number;
  category_name: string;
  started_at: number;
  ended_at: number | null;
};

export class StatisticsRepository {
  constructor(private readonly db: Database) {}

  findSessionsOverlapping(startAt: number, endAt: number): StatisticsSessionRecord[] {
    try {
      return this.db
        .query<StatisticsSessionRow, [endAt: number, startAt: number]>(
          `SELECT
             sessions.id,
             sessions.category_id,
             categories.name AS category_name,
             sessions.started_at,
             sessions.ended_at
           FROM sessions
           INNER JOIN categories ON categories.id = sessions.category_id
           WHERE sessions.started_at < ?
             AND (sessions.ended_at IS NULL OR sessions.ended_at > ?)
           ORDER BY sessions.started_at, sessions.id`,
        )
        .all(endAt, startAt)
        .map((row) => ({
          id: row.id,
          categoryId: row.category_id,
          categoryName: row.category_name,
          startedAt: row.started_at,
          endedAt: row.ended_at,
        }));
    } catch (cause) {
      throw new AppError(
        AppErrorCode.DatabaseOperationFailed,
        'The database could not load sessions for statistics.',
        { operation: 'load statistics sessions', startAt, endAt },
        { cause },
      );
    }
  }
}
