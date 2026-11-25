import type { AppSettings } from '../../config/settings.ts';
import type { CategoryService } from '../../services/category-service.ts';
import type { StatisticsService } from '../../services/statistics-service.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { CategoriesView, CategoryListItem } from '../views/categories.ts';

export class CategoriesController {
  private settings: AppSettings;

  constructor(
    private readonly view: CategoriesView,
    private readonly categoryService: CategoryService,
    private readonly statisticsService: StatisticsService,
    settings: AppSettings,
  ) {
    this.settings = cloneSettings(settings);
    view.setHandlers({
      create: (name) => this.create(name),
      toggleArchived: (id) => this.toggleArchived(id),
      refresh: () => this.refresh(),
    });
  }

  initialize(): void {
    this.refresh();
  }

  updateSettings(settings: AppSettings): void {
    this.settings = cloneSettings(settings);
    this.refresh();
  }

  refresh(): void {
    try {
      const now = Date.now();
      const report = this.statisticsService.getReport({
        range: { type: 'month', anchorAt: now },
        timeZone: this.settings.timeZone,
        workdayStart: this.settings.workdayStart,
        weekStartsOn: this.settings.weekStartsOn,
        now,
      });
      const categories = this.categoryService.listCategories();
      const items: CategoryListItem[] = categories.map((category) => {
        const aggregate = report.categories.find((value) => value.categoryId === category.id);
        const dailyValues = report.days.map(
          (day) =>
            day.categories.find((value) => value.categoryId === category.id)?.durationMs ?? 0,
        );
        return {
          ...category,
          totalDurationMs: aggregate?.durationMs ?? 0,
          percentage: aggregate?.percentage ?? 0,
          activeDays: dailyValues.filter((value) => value > 0).length,
          dailyValues,
        };
      });
      this.view.setItems(items);
      this.view.setStatus(`CURRENT MONTH // ${categories.length} CATEGORIES`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private create(name: string): void {
    try {
      const category = this.categoryService.createCategory(name);
      this.refresh();
      this.view.setStatus(`CREATED // ${category.name.toUpperCase()}`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private toggleArchived(id: number): void {
    try {
      const category = this.categoryService.toggleCategoryArchived(id);
      this.refresh();
      this.view.setStatus(
        `${category.archived ? 'ARCHIVED' : 'RESTORED'} // ${category.name.toUpperCase()}`,
      );
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }
}

function cloneSettings(settings: AppSettings): AppSettings {
  return { ...settings, theme: { ...settings.theme }, appearance: { ...settings.appearance } };
}
