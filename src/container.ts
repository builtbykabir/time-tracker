import { openDatabase } from './db/database.ts';
import { CategoryRepository } from './repositories/category-repository.ts';
import { DeadlineRepository } from './repositories/deadline-repository.ts';
import { SessionRepository } from './repositories/session-repository.ts';
import { StatisticsRepository } from './repositories/statistics-repository.ts';
import { TodoRepository } from './repositories/todo-repository.ts';
import { CategoryService } from './services/category-service.ts';
import { DeadlineService } from './services/deadline-service.ts';
import { SessionService } from './services/session-service.ts';
import { StatisticsService } from './services/statistics-service.ts';
import { TodoService } from './services/todo-service.ts';

export function createContainer(databasePath?: string) {
  const db = openDatabase(databasePath);

  const categoryRepository = new CategoryRepository(db);
  const deadlineRepository = new DeadlineRepository(db);
  const sessionRepository = new SessionRepository(db);
  const statisticsRepository = new StatisticsRepository(db);
  const todoRepository = new TodoRepository(db);

  const categoryService = new CategoryService(categoryRepository);
  const deadlineService = new DeadlineService(deadlineRepository);
  const sessionService = new SessionService(sessionRepository, categoryRepository);
  const statisticsService = new StatisticsService(statisticsRepository);
  const todoService = new TodoService(todoRepository, categoryRepository);

  return {
    db,
    categoryRepository,
    deadlineRepository,
    sessionRepository,
    statisticsRepository,
    todoRepository,
    categoryService,
    deadlineService,
    sessionService,
    statisticsService,
    todoService,
    close() {
      db.close(true);
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
