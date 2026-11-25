import type { Database } from 'bun:sqlite';

import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type {
  CreateDeadlineInput,
  Deadline,
  DeadlineFilter,
  ReplaceDeadlineInput,
} from '../types/deadline.ts';

interface DeadlineRow {
  id: number;
  name: string;
  deadline_workday: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

const COLUMNS = 'id, name, deadline_workday, created_at, updated_at, completed_at';

function toDeadline(row: DeadlineRow): Deadline {
  return {
    id: row.id,
    name: row.name,
    deadlineWorkday: row.deadline_workday,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export class DeadlineRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateDeadlineInput): Deadline {
    try {
      const row = this.db
        .query<DeadlineRow, [string, string, number, number]>(
          `INSERT INTO deadlines (name, deadline_workday, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           RETURNING ${COLUMNS}`,
        )
        .get(input.name, input.deadlineWorkday, input.createdAt, input.updatedAt);
      if (row === null) throw this.databaseError('create a deadline');
      return toDeadline(row);
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw this.databaseError('create a deadline', cause);
    }
  }

  findById(id: number): Deadline | null {
    try {
      const row = this.db
        .query<DeadlineRow, [number]>(`SELECT ${COLUMNS} FROM deadlines WHERE id = ?`)
        .get(id);
      return row === null ? null : toDeadline(row);
    } catch (cause) {
      throw this.databaseError('find a deadline', cause, { deadlineId: id });
    }
  }

  findAll(filter: DeadlineFilter = 'all'): Deadline[] {
    const where =
      filter === 'active'
        ? 'WHERE completed_at IS NULL'
        : filter === 'completed'
          ? 'WHERE completed_at IS NOT NULL'
          : '';
    try {
      return this.db
        .query<DeadlineRow, []>(
          `SELECT ${COLUMNS}
           FROM deadlines
           ${where}
           ORDER BY completed_at IS NOT NULL, deadline_workday, created_at, id`,
        )
        .all()
        .map(toDeadline);
    } catch (cause) {
      throw this.databaseError('list deadlines', cause, { filter });
    }
  }

  update(id: number, input: ReplaceDeadlineInput): Deadline | null {
    try {
      const row = this.db
        .query<DeadlineRow, [string, string, number, number]>(
          `UPDATE deadlines
           SET name = ?, deadline_workday = ?, updated_at = ?
           WHERE id = ?
           RETURNING ${COLUMNS}`,
        )
        .get(input.name, input.deadlineWorkday, input.updatedAt, id);
      return row === null ? null : toDeadline(row);
    } catch (cause) {
      throw this.databaseError('update a deadline', cause, { deadlineId: id });
    }
  }

  setCompleted(id: number, completed: boolean, updatedAt: number): Deadline | null {
    try {
      const completedAt = completed ? updatedAt : null;
      const row = this.db
        .query<DeadlineRow, [number | null, number, number]>(
          `UPDATE deadlines
           SET completed_at = ?, updated_at = ?
           WHERE id = ?
           RETURNING ${COLUMNS}`,
        )
        .get(completedAt, updatedAt, id);
      return row === null ? null : toDeadline(row);
    } catch (cause) {
      throw this.databaseError('change deadline completion', cause, { deadlineId: id });
    }
  }

  deleteById(id: number): Deadline | null {
    try {
      const row = this.db
        .query<DeadlineRow, [number]>(`DELETE FROM deadlines WHERE id = ? RETURNING ${COLUMNS}`)
        .get(id);
      return row === null ? null : toDeadline(row);
    } catch (cause) {
      throw this.databaseError('delete a deadline', cause, { deadlineId: id });
    }
  }

  private databaseError(
    operation: string,
    cause?: unknown,
    details: Record<string, unknown> = {},
  ): AppError {
    return new AppError(
      AppErrorCode.DatabaseOperationFailed,
      `The database could not ${operation}.`,
      { operation, ...details },
      cause === undefined ? undefined : { cause },
    );
  }
}
