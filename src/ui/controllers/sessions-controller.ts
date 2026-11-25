import type { AppSettings } from '../../config/settings.ts';
import type { CategoryService } from '../../services/category-service.ts';
import type { SessionService } from '../../services/session-service.ts';
import type { Session } from '../../types/session.ts';
import { chartColor } from '../theme/chart-palette.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { SessionListItem, SessionsView } from '../views/sessions.ts';

export class SessionsController {
  private readonly dateFormatter: Intl.DateTimeFormat;
  private readonly timeFormatter: Intl.DateTimeFormat;
  private readonly fallbackCategoryColor: string;

  constructor(
    private readonly view: SessionsView,
    private readonly sessionService: SessionService,
    private readonly categoryService: CategoryService,
    settings: AppSettings,
  ) {
    this.fallbackCategoryColor = settings.theme.textColor;
    this.dateFormatter = new Intl.DateTimeFormat(settings.locale, {
      timeZone: settings.timeZone,
      month: 'short',
      day: '2-digit',
    });
    this.timeFormatter = new Intl.DateTimeFormat(settings.locale, {
      timeZone: settings.timeZone,
      hour: '2-digit',
      minute: '2-digit',
    });

    view.setHandlers({
      refresh: () => this.refresh(),
      delete: (id) => this.delete(id),
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
      const items = this.sessionService
        .listSessions()
        .map((session) =>
          this.toListItem(
            session,
            categoryNames.get(session.categoryId),
            categoryColors.get(session.categoryId),
          ),
        );
      this.view.setItems(items);
      this.view.setStatus(`${items.length} session${items.length === 1 ? '' : 's'}`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private delete(id: number): void {
    try {
      this.sessionService.deleteSession(id);
      this.refresh();
      this.view.setStatus(`Deleted session ${id}.`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private toListItem(
    session: Session,
    categoryName = 'Unknown',
    categoryColor = this.fallbackCategoryColor,
  ): SessionListItem {
    const end = session.endedAt ?? Date.now();
    const durationMs = end - session.startedAt;
    return {
      id: session.id,
      date: this.dateFormatter.format(session.startedAt),
      category: categoryName,
      categoryColor,
      start: this.timeFormatter.format(session.startedAt),
      end: session.endedAt === null ? 'RUNNING' : this.timeFormatter.format(session.endedAt),
      duration: formatDuration(durationMs),
      durationMs,
      active: session.endedAt === null,
    };
  }
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}
