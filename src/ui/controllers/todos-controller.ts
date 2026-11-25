import type { AppSettings } from '../../config/settings.ts';
import type { CategoryService } from '../../services/category-service.ts';
import type { TodoService } from '../../services/todo-service.ts';
import { chartColor } from '../theme/chart-palette.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { TodosView } from '../views/todos.ts';

export class TodosController {
  private readonly dueFormatter: Intl.DateTimeFormat;
  private readonly fallbackCategoryColor: string;

  constructor(
    private readonly view: TodosView,
    private readonly todoService: TodoService,
    private readonly categoryService: CategoryService,
    settings: AppSettings,
  ) {
    this.fallbackCategoryColor = settings.theme.textColor;
    this.dueFormatter = new Intl.DateTimeFormat(settings.locale, {
      timeZone: settings.timeZone,
      month: 'short',
      day: '2-digit',
    });
    view.setHandlers({
      create: (name) => this.create(name),
      toggle: (id, done) => this.toggle(id, done),
      delete: (id) => this.delete(id),
      refresh: () => this.refresh(),
    });
  }

  initialize(): void {
    this.refresh();
  }

  refresh(): void {
    try {
      const categories = this.categoryService.listCategories();
      const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
      const categoryColors = new Map(
        categories.map((category, index) => [category.id, chartColor(index)]),
      );
      const todos = this.todoService.listTodos();
      const now = Date.now();
      this.view.setItems(
        todos.map((todo) => ({
          id: todo.id,
          name: todo.name,
          done: todo.done,
          description: todo.description ?? '',
          category:
            todo.categoryId === null ? '' : (categoryNames.get(todo.categoryId) ?? 'Unknown'),
          categoryColor:
            todo.categoryId === null
              ? this.fallbackCategoryColor
              : (categoryColors.get(todo.categoryId) ?? this.fallbackCategoryColor),
          due: todo.dueAt === null ? '' : `Due ${this.dueFormatter.format(todo.dueAt)}`,
          overdue: todo.dueAt !== null && todo.dueAt < now,
        })),
      );
      this.view.setStatus(
        `${todos.filter((todo) => !todo.done).length} pending · ${todos.length} total`,
      );
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private create(rawInput: string): void {
    try {
      const categories = this.categoryService.listCategories();
      const parsed = parseTaskInput(rawInput, categories);
      const todo = this.todoService.addTodo({
        name: parsed.name,
        categoryId: parsed.categoryId,
        dueAt: parsed.dueAt,
      });
      this.refresh();
      let msg = `Added “${todo.name}”`;
      if (parsed.catName) msg += ` · Category: ${parsed.catName}`;
      if (parsed.dueAt !== null) msg += ` · Due: ${this.dueFormatter.format(parsed.dueAt)}`;
      this.view.setStatus(msg + '.');
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private toggle(id: number, done: boolean): void {
    try {
      const todo = done ? this.todoService.markTodoPending(id) : this.todoService.markTodoDone(id);
      this.refresh();
      this.view.setStatus(`Marked “${todo.name}” ${todo.done ? 'done' : 'pending'}.`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private delete(id: number): void {
    try {
      const todo = this.todoService.deleteTodo(id);
      this.refresh();
      this.view.setStatus(`Deleted “${todo.name}”.`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }
}

interface ParsedTaskInput {
  name: string;
  categoryId: number | null;
  catName: string | null;
  dueAt: number | null;
}

export function parseTaskInput(
  rawInput: string,
  categories: { id: number; name: string }[],
): ParsedTaskInput {
  let text = rawInput.trim();
  let categoryId: number | null = null;
  let catName: string | null = null;
  let dueAt: number | null = null;
  let dueString: string | null = null;

  // 1. Support slash notation: Task name / Category / Due
  if (text.includes('/')) {
    const parts = text.split('/').map((s) => s.trim());
    if (parts.length >= 2 && parts[0]) {
      text = parts[0];
      const matchCat = findCategory(parts[1] ?? '', categories);
      if (matchCat) {
        categoryId = matchCat.id;
        catName = matchCat.name;
      }
      if (parts[2]) {
        dueString = parts[2];
      }
    }
  }

  // 2. Parse @category tag if not already found
  if (categoryId === null) {
    const atMatch = text.match(/(?:^|\s)@([^\s#]+)/);
    if (atMatch && atMatch[1]) {
      const matchCat = findCategory(atMatch[1], categories);
      if (matchCat) {
        categoryId = matchCat.id;
        catName = matchCat.name;
        text = text.replace(atMatch[0], ' ').trim();
      }
    }
  }

  // 3. Parse #due tag if not already found
  if (dueString === null) {
    const hashMatch = text.match(/(?:^|\s)#([^\s@]+)/);
    if (hashMatch && hashMatch[1]) {
      dueString = hashMatch[1];
      text = text.replace(hashMatch[0], ' ').trim();
    }
  }

  if (dueString) {
    dueAt = parseDueDate(dueString);
  }

  // Clean up any extra spaces
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) {
    text = rawInput.trim();
  }

  return { name: text, categoryId, catName, dueAt };
}

function findCategory(
  query: string,
  categories: { id: number; name: string }[],
): { id: number; name: string } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = categories.find((c) => c.name.toLowerCase() === q);
  if (exact) return exact;
  const prefix = categories.find((c) => c.name.toLowerCase().startsWith(q));
  if (prefix) return prefix;
  return categories.find((c) => c.name.toLowerCase().includes(q)) ?? null;
}

function parseDueDate(dateText: string): number | null {
  const d = dateText.trim().toLowerCase();
  const now = new Date();

  if (d === 'today' || d === 'tod') {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  if (d === 'tomorrow' || d === 'tom') {
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  if (d === 'yesterday') {
    const end = new Date(now);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  // +Nd or +Nw
  const relativeMatch = d.match(/^\+(\d+)([dw])$/);
  if (relativeMatch && relativeMatch[1] && relativeMatch[2]) {
    const count = parseInt(relativeMatch[1], 10);
    const isWeek = relativeMatch[2] === 'w';
    const end = new Date(now);
    end.setDate(end.getDate() + count * (isWeek ? 7 : 1));
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  // Weekdays
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortWeekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  let dayIdx = weekdays.indexOf(d);
  if (dayIdx === -1) dayIdx = shortWeekdays.indexOf(d);
  if (dayIdx !== -1) {
    const currentDay = now.getDay();
    let diff = (dayIdx - currentDay + 7) % 7;
    if (diff === 0) diff = 7;
    const end = new Date(now);
    end.setDate(end.getDate() + diff);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parsed = new Date(`${d}T23:59:59`);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  // MM-DD
  if (/^\d{1,2}-\d{1,2}$/.test(d)) {
    const year = now.getFullYear();
    const parsed = new Date(`${year}-${d.padStart(5, '0')}T23:59:59`);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return null;
}
