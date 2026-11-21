import { openDatabase } from './db/database.ts';
import { CategoryRepository } from './repositories/category-repository.ts';
import { SessionRepository } from './repositories/session-repository.ts';
import { CategoryService } from './services/category-service.ts';
import { SessionService } from './services/session-service.ts';

export function createContainer(databasePath?: string) {
  const db = openDatabase(databasePath);

  const categoryRepository = new CategoryRepository(db);
  const sessionRepository = new SessionRepository(db);

  const categoryService = new CategoryService(categoryRepository);
  const sessionService = new SessionService(sessionRepository);

  return {
    db,
    categoryRepository,
    sessionRepository,
    categoryService,
    sessionService,
    close() {
      db.close(true);
    },
  };
}

export type Container = ReturnType<typeof createContainer>;

export const container = createContainer();
