export type Todo = {
  id: number;
  name: string;
  description: string | null;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
  done: boolean;
  categoryId: number | null;
};

export type TodoFilter = 'all' | 'pending' | 'completed';

export type AddTodoInput = {
  name: string;
  description?: string | null;
  dueAt?: number | null;
  categoryId?: number | null;
};

export type UpdateTodoInput = {
  name?: string;
  description?: string | null;
  dueAt?: number | null;
};

export type CreateTodoInput = {
  name: string;
  description: string | null;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
  categoryId: number | null;
};

export type ReplaceTodoDetailsInput = {
  name: string;
  description: string | null;
  dueAt: number | null;
  updatedAt: number;
};
