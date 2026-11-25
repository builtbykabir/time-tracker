import type { Database } from 'bun:sqlite';
import { resolve } from 'node:path';

import { loadSettings } from '../src/config/settings.ts';
import { openDatabase } from '../src/db/database.ts';
import { WorkdayClock, addDays, dayOfWeek } from '../src/services/statistics-range.ts';

interface SeedCategory {
  name: string;
  weight: number;
  archived?: boolean;
}

interface SeedTodo {
  name: string;
  description: string | null;
  dueInDays: number | null;
  done: boolean;
  category: string | null;
}

interface SeedDeadline {
  name: string;
  dueInDays: number;
  completed?: boolean;
}

const CATEGORIES: SeedCategory[] = [
  { name: 'Work', weight: 30 },
  { name: 'Learning', weight: 24 },
  { name: 'Personal Projects', weight: 18 },
  { name: 'Health', weight: 12 },
  { name: 'Creative', weight: 10 },
  { name: 'Archived Project', weight: 6, archived: true },
];

const TODOS: SeedTodo[] = [
  {
    name: 'Prepare weekly review',
    description: 'Summarize progress and plan the next week.',
    dueInDays: 2,
    done: false,
    category: 'Work',
  },
  {
    name: 'Complete course module',
    description: 'Finish the exercises after the final lesson.',
    dueInDays: 5,
    done: false,
    category: 'Learning',
  },
  {
    name: 'Outline project milestone',
    description: null,
    dueInDays: 8,
    done: false,
    category: 'Personal Projects',
  },
  {
    name: 'Read one chapter',
    description: null,
    dueInDays: 3,
    done: false,
    category: 'Learning',
  },
  {
    name: 'Plan the next workout',
    description: 'Choose exercises and recovery days.',
    dueInDays: 1,
    done: false,
    category: 'Health',
  },
  {
    name: 'Collect design references',
    description: null,
    dueInDays: null,
    done: false,
    category: 'Creative',
  },
  {
    name: 'Organize project notes',
    description: null,
    dueInDays: 10,
    done: false,
    category: 'Personal Projects',
  },
  {
    name: 'Archive completed notes',
    description: 'Move old material into the archive.',
    dueInDays: -3,
    done: true,
    category: 'Archived Project',
  },
];

const DEADLINES: SeedDeadline[] = [
  { name: 'Weekly review', dueInDays: 4 },
  { name: 'Project milestone', dueInDays: 12 },
  { name: 'Course completion', dueInDays: 27 },
  { name: 'Quarterly goal', dueInDays: 45 },
  { name: 'Previous milestone', dueInDays: -3 },
  { name: 'Initial setup', dueInDays: -18, completed: true },
];

const developmentDataDirectory = resolve(import.meta.dir, '../data');
const settings = await loadSettings(resolve(developmentDataDirectory, 'settings.json'));
const databasePath = process.argv[2] ?? resolve(developmentDataDirectory, 'time-tracker.sqlite');
const db = openDatabase(databasePath);

try {
  const result = seedDatabase(db);
  console.log(`Seeded ${databasePath}`);
  console.log(`  ${result.categories} categories (${result.archivedCategories} archived)`);
  console.log(`  ${result.sessions} sessions across ${result.activeDays} active days`);
  console.log(`  ${result.hours.toFixed(1)} tracked hours`);
  console.log(`  ${result.todos} todos (${result.completedTodos} completed)`);
  console.log(`  ${result.deadlines} deadlines (${result.completedDeadlines} completed)`);
} finally {
  db.close(true);
}

function seedDatabase(database: Database) {
  const random = mulberry32(0x5eed2026);
  const clock = new WorkdayClock(settings.timeZone, settings.workdayStart);
  const currentWorkday = clock.workdayForInstant(Date.now());
  const firstWorkday = addDays(currentWorkday, -365);
  const now = Date.now();
  const categoryIds = new Map<string, number>();
  let sessionCount = 0;
  let totalDurationMs = 0;
  const activeDays = new Set<string>();

  const insertCategory = db.query<{ id: number }, [name: string, createdAt: number]>(
    `INSERT INTO categories (name, created_at) VALUES (?, ?) RETURNING id`,
  );
  const insertSession = db.query<
    never,
    [categoryId: number, startedAt: number, endedAt: number, createdAt: number]
  >(`INSERT INTO sessions (category_id, started_at, ended_at, created_at) VALUES (?, ?, ?, ?)`);
  const insertTodo = db.query<
    never,
    [
      name: string,
      description: string | null,
      dueAt: number | null,
      createdAt: number,
      updatedAt: number,
      done: number,
      categoryId: number | null,
    ]
  >(`INSERT INTO todos (name, description, due_at, created_at, updated_at, done, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertDeadline = db.query<
    never,
    [
      name: string,
      deadlineWorkday: string,
      createdAt: number,
      updatedAt: number,
      completedAt: number | null,
    ]
  >(`INSERT INTO deadlines (name, deadline_workday, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?)`);

  db.transaction(() => {
    db.run('DELETE FROM deadlines');
    db.run('DELETE FROM todos');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM categories');

    for (const category of CATEGORIES) {
      const createdAt = clock.boundaryForWorkday(firstWorkday);
      const row = insertCategory.get(category.name, createdAt);
      if (!row) throw new Error(`Could not create seed category ${category.name}.`);
      categoryIds.set(category.name, row.id);
    }

    for (let dayIndex = 0; dayIndex < 365; dayIndex += 1) {
      const workday = addDays(firstWorkday, dayIndex);
      const weekday = dayOfWeek(workday);
      const weekdayActivityChance = weekday === 0 || weekday === 6 ? 0.48 : 0.8;
      const seasonalAdjustment = Math.sin((dayIndex / 365) * Math.PI * 4) * 0.08;
      if (random() > weekdayActivityChance + seasonalAdjustment) continue;

      const dayStart = clock.boundaryForWorkday(workday);
      const numberOfSessions = 1 + Math.floor(random() * 3);
      let cursorMinute = 400 + Math.floor(random() * 390);

      for (let index = 0; index < numberOfSessions; index += 1) {
        const durationMinutes = roundToFive(35 + random() * 105);
        const startedAt = dayStart + cursorMinute * 60_000;
        const endedAt = startedAt + durationMinutes * 60_000;
        addSession(pickCategory(random), startedAt, endedAt);
        cursorMinute += durationMinutes + roundToFive(15 + random() * 40);
      }

      if (random() < 0.12 && cursorMinute < 1_100) {
        const lateStartMinute = 1_150 + Math.floor(random() * 130);
        const durationMinutes = roundToFive(40 + random() * 90);
        addSession(
          pickCategory(random),
          dayStart + lateStartMinute * 60_000,
          dayStart + Math.min(1_390, lateStartMinute + durationMinutes) * 60_000,
        );
      }

      // Periodic two-hour sessions deliberately cross the configured workday
      // boundary, exercising the statistics engine's in-memory day splitting.
      if (dayIndex % 61 === 20) {
        addSession('Creative', dayStart + 1_380 * 60_000, dayStart + 1_500 * 60_000);
      }

      function addSession(categoryName: string, startedAt: number, endedAt: number): void {
        const categoryId = categoryIds.get(categoryName);
        if (!categoryId) throw new Error(`Missing seed category ${categoryName}.`);
        insertSession.run(categoryId, startedAt, endedAt, startedAt);
        sessionCount += 1;
        totalDurationMs += endedAt - startedAt;
        activeDays.add(workday);
      }
    }

    for (const [index, todo] of TODOS.entries()) {
      const createdAt = now - (TODOS.length - index + 4) * 86_400_000;
      const dueAt = todo.dueInDays === null ? null : now + todo.dueInDays * 86_400_000;
      const categoryId = todo.category === null ? null : (categoryIds.get(todo.category) ?? null);
      insertTodo.run(
        todo.name,
        todo.description,
        dueAt,
        createdAt,
        todo.done ? createdAt + 2 * 86_400_000 : createdAt,
        todo.done ? 1 : 0,
        categoryId,
      );
    }

    for (const [index, deadline] of DEADLINES.entries()) {
      const createdAt = now - (DEADLINES.length - index + 2) * 86_400_000;
      insertDeadline.run(
        deadline.name,
        addDays(currentWorkday, deadline.dueInDays),
        createdAt,
        now,
        deadline.completed ? now - 2 * 86_400_000 : null,
      );
    }

    for (const category of CATEGORIES.filter((candidate) => candidate.archived)) {
      db.query<never, [name: string]>('UPDATE categories SET archived = 1 WHERE name = ?').run(
        category.name,
      );
    }
  })();

  return {
    categories: CATEGORIES.length,
    archivedCategories: CATEGORIES.filter((category) => category.archived).length,
    sessions: sessionCount,
    activeDays: activeDays.size,
    hours: totalDurationMs / 3_600_000,
    todos: TODOS.length,
    completedTodos: TODOS.filter((todo) => todo.done).length,
    deadlines: DEADLINES.length,
    completedDeadlines: DEADLINES.filter((deadline) => deadline.completed).length,
  };

  function pickCategory(nextRandom: () => number): string {
    const totalWeight = CATEGORIES.reduce((total, category) => total + category.weight, 0);
    let value = nextRandom() * totalWeight;
    for (const category of CATEGORIES) {
      value -= category.weight;
      if (value <= 0) return category.name;
    }
    return CATEGORIES[0]!.name;
  }
}

function roundToFive(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
