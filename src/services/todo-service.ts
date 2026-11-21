import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { CategoryRepository } from '../repositories/category-repository.ts';
import type { TodoRepository } from '../repositories/todo-repository.ts';
import type { AddTodoInput, Todo, TodoFilter, UpdateTodoInput } from '../types/todo.ts';

const MAX_TODO_NAME_LENGTH = 160;
const MAX_TODO_DESCRIPTION_LENGTH = 5_000;

export class TodoService {
  constructor(
    private readonly todoRepository: TodoRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  addTodo(input: AddTodoInput): Todo {
    const name = this.normalizeName(input.name);
    const description = this.normalizeDescription(input.description ?? null);
    const dueAt = this.validateDueAt(input.dueAt ?? null);
    const categoryId = input.categoryId ?? null;

    if (categoryId !== null) {
      this.requireActiveCategory(categoryId);
    }

    const now = Date.now();

    return this.todoRepository.create({
      name,
      description,
      dueAt,
      createdAt: now,
      updatedAt: now,
      categoryId,
    });
  }

  updateTodo(id: number, input: UpdateTodoInput): Todo {
    const updatesName = Object.hasOwn(input, 'name');
    const updatesDescription = Object.hasOwn(input, 'description');
    const updatesDueAt = Object.hasOwn(input, 'dueAt');

    if (!updatesName && !updatesDescription && !updatesDueAt) {
      throw new AppError(
        AppErrorCode.InvalidTodoUpdate,
        'A todo update must include at least one editable field.',
        { todoId: id },
      );
    }

    const todo = this.getTodo(id);
    const name = updatesName ? this.normalizeName(input.name as string) : todo.name;
    const description = updatesDescription
      ? this.normalizeDescription(input.description ?? null)
      : todo.description;
    const dueAt = updatesDueAt ? this.validateDueAt(input.dueAt ?? null) : todo.dueAt;
    const updatedTodo = this.todoRepository.update(id, {
      name,
      description,
      dueAt,
      updatedAt: Date.now(),
    });

    if (updatedTodo === null) {
      throw this.todoNotFoundError(id);
    }

    return updatedTodo;
  }

  getTodo(id: number): Todo {
    const todo = this.todoRepository.findById(id);

    if (todo === null) {
      throw this.todoNotFoundError(id);
    }

    return todo;
  }

  markTodoDone(id: number): Todo {
    return this.setTodoDone(id, true);
  }

  markTodoPending(id: number): Todo {
    return this.setTodoDone(id, false);
  }

  listTodos(filter: TodoFilter = 'all'): Todo[] {
    return this.todoRepository.findAll(filter);
  }

  listPendingTodos(): Todo[] {
    return this.listTodos('pending');
  }

  listCompletedTodos(): Todo[] {
    return this.listTodos('completed');
  }

  deleteTodo(id: number): Todo {
    const todo = this.todoRepository.deleteById(id);

    if (todo === null) {
      throw this.todoNotFoundError(id);
    }

    return todo;
  }

  assignCategory(id: number, categoryId: number): Todo {
    this.requireActiveCategory(categoryId);
    return this.setTodoCategory(id, categoryId);
  }

  removeCategory(id: number): Todo {
    return this.setTodoCategory(id, null);
  }

  private setTodoDone(id: number, done: boolean): Todo {
    const todo = this.todoRepository.setDone(id, done, Date.now());

    if (todo === null) {
      throw this.todoNotFoundError(id);
    }

    return todo;
  }

  private setTodoCategory(id: number, categoryId: number | null): Todo {
    const todo = this.todoRepository.setCategory(id, categoryId, Date.now());

    if (todo === null) {
      throw this.todoNotFoundError(id);
    }

    return todo;
  }

  private normalizeName(name: string): string {
    if (typeof name !== 'string') {
      throw new AppError(AppErrorCode.InvalidTodoName, 'Todo name must be text.', { name });
    }

    const normalizedName = name.trim();
    const nameLength = [...normalizedName].length;

    if (nameLength === 0) {
      throw new AppError(AppErrorCode.InvalidTodoName, 'Todo name cannot be empty.', { name });
    }

    if (nameLength > MAX_TODO_NAME_LENGTH) {
      throw new AppError(
        AppErrorCode.InvalidTodoName,
        `Todo name cannot exceed ${MAX_TODO_NAME_LENGTH} characters.`,
        { name: normalizedName, maxLength: MAX_TODO_NAME_LENGTH, actualLength: nameLength },
      );
    }

    return normalizedName;
  }

  private normalizeDescription(description: string | null): string | null {
    if (description === null) {
      return null;
    }

    if (typeof description !== 'string') {
      throw new AppError(
        AppErrorCode.InvalidTodoDescription,
        'Todo description must be text or null.',
        { description },
      );
    }

    const normalizedDescription = description.trim();

    if (normalizedDescription.length === 0) {
      return null;
    }

    const descriptionLength = [...normalizedDescription].length;

    if (descriptionLength > MAX_TODO_DESCRIPTION_LENGTH) {
      throw new AppError(
        AppErrorCode.InvalidTodoDescription,
        `Todo description cannot exceed ${MAX_TODO_DESCRIPTION_LENGTH} characters.`,
        {
          maxLength: MAX_TODO_DESCRIPTION_LENGTH,
          actualLength: descriptionLength,
        },
      );
    }

    return normalizedDescription;
  }

  private validateDueAt(dueAt: number | null): number | null {
    if (dueAt === null) {
      return null;
    }

    if (!Number.isSafeInteger(dueAt) || dueAt < 0) {
      throw new AppError(
        AppErrorCode.InvalidTodoDueAt,
        'Todo dueAt must be a non-negative Unix timestamp in milliseconds or null.',
        { dueAt },
      );
    }

    return dueAt;
  }

  private requireActiveCategory(categoryId: number): void {
    const category = this.categoryRepository.findById(categoryId);

    if (category === null) {
      throw new AppError(AppErrorCode.CategoryNotFound, `Category ${categoryId} does not exist.`, {
        categoryId,
      });
    }

    if (category.archived) {
      throw new AppError(
        AppErrorCode.CategoryArchived,
        `Category "${category.name}" is archived.`,
        { categoryId: category.id, categoryName: category.name },
      );
    }
  }

  private todoNotFoundError(id: number): AppError {
    return new AppError(AppErrorCode.TodoNotFound, `Todo ${id} does not exist.`, { todoId: id });
  }
}
