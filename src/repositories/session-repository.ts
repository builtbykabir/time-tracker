import { SQLiteError, type Database } from 'bun:sqlite';

import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type {
  CreateCompletedSessionInput,
  CreateRunningSessionInput,
  Session,
} from '../types/session.ts';

type SessionRow = {
  id: number;
  category_id: number;
  started_at: number;
  ended_at: number | null;
  created_at: number;
};

const SESSION_COLUMNS = 'id, category_id, started_at, ended_at, created_at';

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    categoryId: row.category_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export class SessionRepository {
  constructor(private readonly db: Database) {}

  findActive(): Session | null {
    try {
      const row = this.db
        .query<SessionRow, []>(
          `SELECT ${SESSION_COLUMNS}
           FROM sessions
           WHERE ended_at IS NULL
           LIMIT 1`,
        )
        .get();

      return row === null ? null : toSession(row);
    } catch (cause) {
      throw this.databaseError('find the active session', {}, cause);
    }
  }

  createRunning(input: CreateRunningSessionInput): Session {
    const activeSession = this.findActive();

    if (activeSession !== null) {
      throw this.activeSessionExistsError(activeSession);
    }

    try {
      const row = this.db
        .query<SessionRow, [categoryId: number, startedAt: number, createdAt: number]>(
          `INSERT INTO sessions (category_id, started_at, created_at)
           VALUES (?, ?, ?)
           RETURNING ${SESSION_COLUMNS}`,
        )
        .get(input.categoryId, input.startedAt, input.createdAt);

      if (row === null) {
        throw this.databaseError('create a running session', { categoryId: input.categoryId });
      }

      return toSession(row);
    } catch (cause) {
      if (cause instanceof AppError) {
        throw cause;
      }

      throw this.translateInsertError(cause, input.categoryId, 'create a running session');
    }
  }

  endActive(endedAt: number): Session | null {
    try {
      const row = this.db
        .query<SessionRow, [endedAt: number]>(
          `UPDATE sessions
           SET ended_at = ?
           WHERE ended_at IS NULL
           RETURNING ${SESSION_COLUMNS}`,
        )
        .get(endedAt);

      return row === null ? null : toSession(row);
    } catch (cause) {
      throw this.databaseError('end the active session', { endedAt }, cause);
    }
  }

  findById(id: number): Session | null {
    try {
      const row = this.db
        .query<SessionRow, [id: number]>(
          `SELECT ${SESSION_COLUMNS}
           FROM sessions
           WHERE id = ?`,
        )
        .get(id);

      return row === null ? null : toSession(row);
    } catch (cause) {
      throw this.databaseError('find a session by ID', { sessionId: id }, cause);
    }
  }

  findAll(): Session[] {
    try {
      return this.db
        .query<SessionRow, []>(
          `SELECT ${SESSION_COLUMNS}
           FROM sessions
           ORDER BY started_at DESC, id DESC`,
        )
        .all()
        .map(toSession);
    } catch (cause) {
      throw this.databaseError('list sessions', {}, cause);
    }
  }

  findByCategoryId(categoryId: number): Session[] {
    try {
      return this.db
        .query<SessionRow, [categoryId: number]>(
          `SELECT ${SESSION_COLUMNS}
           FROM sessions
           WHERE category_id = ?
           ORDER BY started_at DESC, id DESC`,
        )
        .all(categoryId)
        .map(toSession);
    } catch (cause) {
      throw this.databaseError('list sessions for a category', { categoryId }, cause);
    }
  }

  createCompleted(input: CreateCompletedSessionInput): Session {
    try {
      const row = this.db
        .query<
          SessionRow,
          [categoryId: number, startedAt: number, endedAt: number, createdAt: number]
        >(
          `INSERT INTO sessions (category_id, started_at, ended_at, created_at)
           VALUES (?, ?, ?, ?)
           RETURNING ${SESSION_COLUMNS}`,
        )
        .get(input.categoryId, input.startedAt, input.endedAt, input.createdAt);

      if (row === null) {
        throw this.databaseError('create a completed session', {
          categoryId: input.categoryId,
        });
      }

      return toSession(row);
    } catch (cause) {
      if (cause instanceof AppError) {
        throw cause;
      }

      throw this.translateInsertError(cause, input.categoryId, 'create a completed session');
    }
  }

  findOverlapping(startedAt: number, endedAt: number): Session | null {
    try {
      const row = this.db
        .query<SessionRow, [endedAt: number, startedAt: number]>(
          `SELECT ${SESSION_COLUMNS}
           FROM sessions
           WHERE started_at < ?
             AND (ended_at IS NULL OR ended_at > ?)
           ORDER BY started_at
           LIMIT 1`,
        )
        .get(endedAt, startedAt);

      return row === null ? null : toSession(row);
    } catch (cause) {
      throw this.databaseError('check for overlapping sessions', { startedAt, endedAt }, cause);
    }
  }

  deleteById(id: number): Session | null {
    try {
      const row = this.db
        .query<SessionRow, [id: number]>(
          `DELETE FROM sessions
           WHERE id = ?
           RETURNING ${SESSION_COLUMNS}`,
        )
        .get(id);

      return row === null ? null : toSession(row);
    } catch (cause) {
      throw this.databaseError('delete a session', { sessionId: id }, cause);
    }
  }

  private activeSessionExistsError(session: Session, cause?: unknown): AppError {
    return new AppError(
      AppErrorCode.ActiveSessionAlreadyExists,
      'A session is already running.',
      {
        activeSessionId: session.id,
        categoryId: session.categoryId,
        startedAt: session.startedAt,
      },
      cause === undefined ? undefined : { cause },
    );
  }

  private translateInsertError(cause: unknown, categoryId: number, operation: string): AppError {
    if (cause instanceof SQLiteError) {
      if (cause.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const activeSession = this.findActive();

        if (activeSession !== null) {
          return this.activeSessionExistsError(activeSession, cause);
        }
      }

      if (cause.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return new AppError(
          AppErrorCode.CategoryNotFound,
          `Category ${categoryId} does not exist.`,
          { categoryId },
          { cause },
        );
      }

      if (
        cause.code === 'SQLITE_CONSTRAINT_TRIGGER' &&
        cause.message.includes('archived category')
      ) {
        return new AppError(
          AppErrorCode.CategoryArchived,
          `Category ${categoryId} is archived.`,
          { categoryId },
          { cause },
        );
      }
    }

    return this.databaseError(operation, { categoryId }, cause);
  }

  private databaseError(
    operation: string,
    details: Record<string, unknown>,
    cause?: unknown,
  ): AppError {
    return new AppError(
      AppErrorCode.DatabaseOperationFailed,
      `The database could not ${operation}.`,
      { operation, ...details },
      cause === undefined ? undefined : { cause },
    );
  }
}
