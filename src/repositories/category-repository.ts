import { SQLiteError, type Database } from 'bun:sqlite';

import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { Category, CategoryFilter } from '../types/category.ts';

type CategoryRow = {
  id: number;
  name: string;
  created_at: number;
  archived: 0 | 1;
};

const CATEGORY_COLUMNS = 'id, name, created_at, archived';

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    archived: row.archived === 1,
  };
}

export class CategoryRepository {
  constructor(private readonly db: Database) {}

  findByName(name: string): Category | null {
    try {
      const row = this.db
        .query<CategoryRow, [name: string]>(
          `SELECT ${CATEGORY_COLUMNS}
           FROM categories
           WHERE name = ? COLLATE NOCASE`,
        )
        .get(name);

      return row === null ? null : toCategory(row);
    } catch (cause) {
      throw this.databaseError('find a category by name', { name }, cause);
    }
  }

  findById(id: number): Category | null {
    try {
      const row = this.db
        .query<CategoryRow, [id: number]>(
          `SELECT ${CATEGORY_COLUMNS}
           FROM categories
           WHERE id = ?`,
        )
        .get(id);

      return row === null ? null : toCategory(row);
    } catch (cause) {
      throw this.databaseError('find a category by ID', { categoryId: id }, cause);
    }
  }

  create(name: string, createdAt: number): Category {
    const existingCategory = this.findByName(name);

    if (existingCategory !== null) {
      throw this.categoryAlreadyExistsError(existingCategory);
    }

    try {
      const row = this.db
        .query<CategoryRow, [name: string, createdAt: number]>(
          `INSERT INTO categories (name, created_at)
           VALUES (?, ?)
           RETURNING ${CATEGORY_COLUMNS}`,
        )
        .get(name, createdAt);

      if (row === null) {
        throw this.databaseError('create a category', { name });
      }

      return toCategory(row);
    } catch (cause) {
      if (cause instanceof AppError) {
        throw cause;
      }

      if (cause instanceof SQLiteError && cause.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const category = this.findByName(name);

        if (category !== null) {
          throw this.categoryAlreadyExistsError(category, cause);
        }
      }

      throw this.databaseError('create a category', { name }, cause);
    }
  }

  toggleArchived(id: number): Category | null {
    try {
      const row = this.db
        .query<CategoryRow, [id: number]>(
          `UPDATE categories
           SET archived = CASE archived WHEN 0 THEN 1 ELSE 0 END
           WHERE id = ?
           RETURNING ${CATEGORY_COLUMNS}`,
        )
        .get(id);

      return row === null ? null : toCategory(row);
    } catch (cause) {
      throw this.databaseError('toggle a category archive status', { categoryId: id }, cause);
    }
  }

  findAll(filter: CategoryFilter = 'all'): Category[] {
    const whereClause = this.whereClauseFor(filter);

    try {
      const rows = this.db
        .query<CategoryRow, []>(
          `SELECT ${CATEGORY_COLUMNS}
           FROM categories
           ${whereClause}
           ORDER BY name COLLATE NOCASE`,
        )
        .all();

      return rows.map(toCategory);
    } catch (cause) {
      throw this.databaseError('list categories', { filter }, cause);
    }
  }

  private whereClauseFor(filter: CategoryFilter): string {
    switch (filter) {
      case 'all':
        return '';
      case 'active':
        return 'WHERE archived = 0';
      case 'archived':
        return 'WHERE archived = 1';
    }
  }

  private categoryAlreadyExistsError(category: Category, cause?: unknown): AppError {
    return new AppError(
      AppErrorCode.CategoryAlreadyExists,
      `A category named "${category.name}" already exists.`,
      {
        categoryId: category.id,
        categoryName: category.name,
        archived: category.archived,
      },
      cause === undefined ? undefined : { cause },
    );
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
