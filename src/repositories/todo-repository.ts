import { SQLiteError, type Database } from 'bun:sqlite';

import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { CreateTodoInput, ReplaceTodoDetailsInput, Todo, TodoFilter } from '../types/todo.ts';

type TodoRow = {
  id: number;
  name: string;
  description: string | null;
  due_at: number | null;
  created_at: number;
  updated_at: number;
  done: 0 | 1;
  category_id: number | null;
};

const TODO_COLUMNS = 'id, name, description, due_at, created_at, updated_at, done, category_id';

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    done: row.done === 1,
    categoryId: row.category_id,
  };
}

export class TodoRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateTodoInput): Todo {
    try {
      const row = this.db
        .query<
          TodoRow,
          [
            name: string,
            description: string | null,
            dueAt: number | null,
            createdAt: number,
            updatedAt: number,
            categoryId: number | null,
          ]
        >(
          `INSERT INTO todos (
             name, description, due_at, created_at, updated_at, category_id
           )
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING ${TODO_COLUMNS}`,
        )
        .get(
          input.name,
          input.description,
          input.dueAt,
          input.createdAt,
          input.updatedAt,
          input.categoryId,
        );

      if (row === null) {
        throw this.databaseError('create a todo', { name: input.name });
      }

      return toTodo(row);
    } catch (cause) {
      if (cause instanceof AppError) {
        throw cause;
      }

      throw this.translateCategoryError(cause, input.categoryId, 'create a todo');
    }
  }

  findById(id: number): Todo | null {
    try {
      const row = this.db
        .query<TodoRow, [id: number]>(
          `SELECT ${TODO_COLUMNS}
           FROM todos
           WHERE id = ?`,
        )
        .get(id);

      return row === null ? null : toTodo(row);
    } catch (cause) {
      throw this.databaseError('find a todo by ID', { todoId: id }, cause);
    }
  }

  update(id: number, input: ReplaceTodoDetailsInput): Todo | null {
    try {
      const row = this.db
        .query<
          TodoRow,
          [
            name: string,
            description: string | null,
            dueAt: number | null,
            updatedAt: number,
            id: number,
          ]
        >(
          `UPDATE todos
           SET name = ?, description = ?, due_at = ?, updated_at = ?
           WHERE id = ?
           RETURNING ${TODO_COLUMNS}`,
        )
        .get(input.name, input.description, input.dueAt, input.updatedAt, id);

      return row === null ? null : toTodo(row);
    } catch (cause) {
      throw this.databaseError('update a todo', { todoId: id }, cause);
    }
  }

  deleteById(id: number): Todo | null {
    try {
      const row = this.db
        .query<TodoRow, [id: number]>(
          `DELETE FROM todos
           WHERE id = ?
           RETURNING ${TODO_COLUMNS}`,
        )
        .get(id);

      return row === null ? null : toTodo(row);
    } catch (cause) {
      throw this.databaseError('delete a todo', { todoId: id }, cause);
    }
  }

  findAll(filter: TodoFilter = 'all'): Todo[] {
    const whereClause = this.whereClauseFor(filter);

    try {
      return this.db
        .query<TodoRow, []>(
          `SELECT ${TODO_COLUMNS}
           FROM todos
           ${whereClause}
           ORDER BY
             done ASC,
             CASE WHEN due_at IS NULL THEN 1 ELSE 0 END ASC,
             due_at ASC,
             created_at DESC,
             id DESC`,
        )
        .all()
        .map(toTodo);
    } catch (cause) {
      throw this.databaseError('list todos', { filter }, cause);
    }
  }

  setDone(id: number, done: boolean, updatedAt: number): Todo | null {
    try {
      const row = this.db
        .query<TodoRow, [done: number, updatedAt: number, id: number]>(
          `UPDATE todos
           SET done = ?, updated_at = ?
           WHERE id = ?
           RETURNING ${TODO_COLUMNS}`,
        )
        .get(done ? 1 : 0, updatedAt, id);

      return row === null ? null : toTodo(row);
    } catch (cause) {
      throw this.databaseError('change a todo completion status', { todoId: id, done }, cause);
    }
  }

  setCategory(id: number, categoryId: number | null, updatedAt: number): Todo | null {
    try {
      const row = this.db
        .query<TodoRow, [categoryId: number | null, updatedAt: number, id: number]>(
          `UPDATE todos
           SET category_id = ?, updated_at = ?
           WHERE id = ?
           RETURNING ${TODO_COLUMNS}`,
        )
        .get(categoryId, updatedAt, id);

      return row === null ? null : toTodo(row);
    } catch (cause) {
      throw this.translateCategoryError(cause, categoryId, 'assign a todo category', {
        todoId: id,
      });
    }
  }

  private whereClauseFor(filter: TodoFilter): string {
    switch (filter) {
      case 'all':
        return '';
      case 'pending':
        return 'WHERE done = 0';
      case 'completed':
        return 'WHERE done = 1';
    }
  }

  private translateCategoryError(
    cause: unknown,
    categoryId: number | null,
    operation: string,
    details: Record<string, unknown> = {},
  ): AppError {
    if (cause instanceof SQLiteError && categoryId !== null) {
      if (cause.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return new AppError(
          AppErrorCode.CategoryNotFound,
          `Category ${categoryId} does not exist.`,
          { ...details, categoryId },
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
          { ...details, categoryId },
          { cause },
        );
      }
    }

    return this.databaseError(operation, { ...details, categoryId }, cause);
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
