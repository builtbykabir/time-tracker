import { openDatabase } from './db/database.ts';
import { CategoryRepository } from './repositories/category-repository.ts';
import { SessionRepository } from './repositories/session-repository.ts';
import { TodoRepository } from './repositories/todo-repository.ts';
import { CategoryService } from './services/category-service.ts';
import { SessionService } from './services/session-service.ts';
import { TodoService } from './services/todo-service.ts';

export function createContainer(databasePath?: string) {
  const db = openDatabase(databasePath);

  const categoryRepository = new CategoryRepository(db);
  const sessionRepository = new SessionRepository(db);
  const todoRepository = new TodoRepository(db);

  const categoryService = new CategoryService(categoryRepository);
  const sessionService = new SessionService(sessionRepository, categoryRepository);
  const todoService = new TodoService(todoRepository, categoryRepository);

  return {
    db,
    categoryRepository,
    sessionRepository,
    todoRepository,
    categoryService,
    sessionService,
    todoService,
    close() {
      db.close(true);
    },
  };
}

export type Container = ReturnType<typeof createContainer>;

export const container = createContainer();
