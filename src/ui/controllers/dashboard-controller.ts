import type { KeyEvent } from '@opentui/core';

import type { AppSettings } from '../../config/settings.ts';
import type { CategoryService } from '../../services/category-service.ts';
import type { DeadlineService } from '../../services/deadline-service.ts';
import type { SessionService } from '../../services/session-service.ts';
import type { StatisticsService } from '../../services/statistics-service.ts';
import type { TodoService } from '../../services/todo-service.ts';
import type { Category } from '../../types/category.ts';
import { WorkdayClock, addDays } from '../../services/statistics-range.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { DashboardView } from '../views/dashboard.ts';

export class DashboardController {
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private activeCategories: Category[] = [];
  private selectedCategoryIndex = 0;
  private settings: AppSettings;
  private lastStatisticsRefreshAt = 0;

  constructor(
    private readonly view: DashboardView,
    private readonly sessionService: SessionService,
    private readonly categoryService: CategoryService,
    private readonly statisticsService: StatisticsService,
    private readonly todoService: TodoService,
    settings: AppSettings,
    private readonly onSessionsChanged: () => void = () => {},
    private readonly deadlineService?: DeadlineService,
  ) {
    this.settings = cloneSettings(settings);
    this.view.setHandlers({
      onToggleSession: () => this.toggleSession(),
      onCycleCategory: () => this.cycleCategory(),
    });
  }

  initialize(): void {
    this.stopTimer();
    this.refreshDashboardData();
    const activeSession = this.sessionService.getActiveSession();

    if (activeSession === null) {
      this.refreshCategories();
      this.showIdleState();
      return;
    }

    const category = this.categoryService
      .listCategories('all')
      .find((candidate) => candidate.id === activeSession.categoryId);

    this.view.setCurrentSession({
      status: 'active',
      sessionId: activeSession.id,
      categoryName: category?.name ?? `Category ${activeSession.categoryId}`,
      startedAt: activeSession.startedAt,
    });

    const updateTimer = (): void => {
      this.view.setElapsedTime(Math.max(0, Date.now() - activeSession.startedAt));
      if (Date.now() - this.lastStatisticsRefreshAt >= 60_000) this.refreshDashboardData();
    };

    updateTimer();
    this.timerInterval = setInterval(updateTimer, 1_000);
  }

  handleKey(key: KeyEvent): boolean {
    if (key.name === 's') {
      this.toggleSession();
      return true;
    }

    if (key.name === 'c') {
      this.cycleCategory();
      return true;
    }

    return false;
  }

  destroy(): void {
    this.stopTimer();
  }

  updateSettings(settings: AppSettings): void {
    this.settings = cloneSettings(settings);
    this.refreshDashboardData();
  }

  private toggleSession(): void {
    try {
      if (this.sessionService.getActiveSession() === null) {
        this.refreshCategories();
        const category = this.activeCategories[this.selectedCategoryIndex];

        if (!category) {
          this.view.setStatusMessage('No active category. Create one in Categories.');
          return;
        }

        this.sessionService.startSession(category.id);
      } else {
        this.sessionService.endActiveSession();
      }

      this.initialize();
      this.onSessionsChanged();
    } catch (error) {
      this.view.setStatusMessage(getErrorMessage(error));
    }
  }

  private cycleCategory(): void {
    if (this.sessionService.getActiveSession() !== null) {
      this.view.setStatusMessage('Stop the active session before changing category.');
      return;
    }

    this.refreshCategories();
    if (this.activeCategories.length === 0) {
      this.showIdleState();
      return;
    }

    this.selectedCategoryIndex = (this.selectedCategoryIndex + 1) % this.activeCategories.length;
    this.showIdleState();
  }

  private refreshCategories(): void {
    const selectedId = this.activeCategories[this.selectedCategoryIndex]?.id;
    this.activeCategories = this.categoryService.listCategories('active');
    const preservedIndex = this.activeCategories.findIndex(
      (category) => category.id === selectedId,
    );
    this.selectedCategoryIndex = preservedIndex >= 0 ? preservedIndex : 0;
    this.view.setCategories(
      this.activeCategories.map((category, index) => ({
        id: category.id,
        name: category.name,
        selected: index === this.selectedCategoryIndex,
      })),
    );
  }

  private showIdleState(): void {
    this.view.setCurrentSession({
      status: 'idle',
      categoryName: this.activeCategories[this.selectedCategoryIndex]?.name ?? null,
    });
  }

  private refreshDashboardData(): void {
    try {
      const now = Date.now();
      const clock = new WorkdayClock(this.settings.timeZone, this.settings.workdayStart);
      const todayWorkday = clock.workdayForInstant(now);
      const query = {
        timeZone: this.settings.timeZone,
        workdayStart: this.settings.workdayStart,
        weekStartsOn: this.settings.weekStartsOn,
        now,
      } as const;
      const dayReport = this.statisticsService.getReport({
        range: { type: 'day', anchorAt: now },
        ...query,
      });
      const sevenDayReport = this.statisticsService.getReport({
        range: {
          type: 'custom',
          startWorkday: addDays(todayWorkday, -6),
          endWorkday: todayWorkday,
        },
        ...query,
      });
      const weekReport = this.statisticsService.getReport({
        range: { type: 'week', anchorAt: now },
        ...query,
      });
      const monthReport = this.statisticsService.getReport({
        range: { type: 'month', anchorAt: now },
        ...query,
      });
      const categoryNames = new Map(
        this.categoryService.listCategories().map((category) => [category.id, category.name]),
      );
      const dueFormatter = new Intl.DateTimeFormat(this.settings.locale, {
        timeZone: this.settings.timeZone,
        month: 'short',
        day: '2-digit',
      });
      this.view.setTodayReport(dayReport);
      this.view.setSevenDayReport(sevenDayReport);
      this.view.setWeeklyReport(weekReport);
      this.view.setMonthReport(monthReport);

      const pendingTodos = this.todoService.listPendingTodos();
      pendingTodos.sort((a, b) => {
        if (a.dueAt !== null && b.dueAt !== null) return a.dueAt - b.dueAt;
        if (a.dueAt !== null) return -1;
        if (b.dueAt !== null) return 1;
        return a.createdAt - b.createdAt;
      });

      this.view.setTodoPreview(
        pendingTodos.map((todo) => {
          const isOverdue = todo.dueAt !== null && todo.dueAt < now;
          let dueString = '';
          if (todo.dueAt !== null) {
            dueString = isOverdue ? '! Overdue' : `Due ${dueFormatter.format(todo.dueAt)}`;
          }
          return {
            id: todo.id,
            name: todo.name,
            category:
              todo.categoryId === null ? '' : (categoryNames.get(todo.categoryId) ?? 'Unknown'),
            due: dueString,
            overdue: isOverdue,
            done: todo.done,
          };
        }),
      );
      this.view.setDeadlinePreview(
        (this.deadlineService?.listCountdowns(this.settings, 'active', now) ?? []).map(
          (deadline) => ({
            id: deadline.id,
            name: deadline.name,
            countdownLabel: deadline.countdownLabel,
            daysRemaining: deadline.daysRemaining,
            overdue: deadline.overdue,
          }),
        ),
      );
      this.refreshCategories();
      this.lastStatisticsRefreshAt = now;
    } catch (error) {
      this.view.setStatusMessage(getErrorMessage(error));
    }
  }

  private stopTimer(): void {
    if (this.timerInterval === null) return;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }
}

function cloneSettings(settings: AppSettings): AppSettings {
  return { ...settings, theme: { ...settings.theme }, appearance: { ...settings.appearance } };
}
