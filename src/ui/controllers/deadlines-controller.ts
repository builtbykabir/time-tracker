import type { AppSettings } from '../../config/settings.ts';
import type { DeadlineService } from '../../services/deadline-service.ts';
import { getErrorMessage } from '../utils/error-message.ts';
import type { DeadlinesView } from '../views/deadlines.ts';

export class DeadlinesController {
  constructor(
    private readonly view: DeadlinesView,
    private readonly service: DeadlineService,
    private readonly settings: AppSettings,
  ) {
    view.setHandlers({
      create: (value) => this.create(value),
      toggle: (id, completed) => this.toggle(id, completed),
      delete: (id) => this.delete(id),
      refresh: () => this.refresh(),
    });
  }

  initialize(): void {
    this.refresh();
  }

  refresh(): void {
    try {
      const items = this.service.listCountdowns(this.settings);
      this.view.setItems(
        items.map((item) => ({
          id: item.id,
          name: item.name,
          deadlineWorkday: item.deadlineWorkday,
          countdownLabel: item.countdownLabel,
          daysRemaining: item.daysRemaining,
          overdue: item.overdue,
          completed: item.completedAt !== null,
        })),
      );
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private create(value: string): void {
    try {
      const separator = value.lastIndexOf('/');
      if (separator < 1) {
        throw new Error('Use: Deadline name / YYYY-MM-DD');
      }
      const deadline = this.service.addDeadline({
        name: value.slice(0, separator).trim(),
        deadlineWorkday: value.slice(separator + 1).trim(),
      });
      this.refresh();
      this.view.setStatus(`Added "${deadline.name}" for ${deadline.deadlineWorkday}.`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private toggle(id: number, completed: boolean): void {
    try {
      const deadline = completed ? this.service.reopen(id) : this.service.markCompleted(id);
      this.refresh();
      this.view.setStatus(
        `${deadline.completedAt === null ? 'Reopened' : 'Completed'} "${deadline.name}".`,
      );
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }

  private delete(id: number): void {
    try {
      const deadline = this.service.deleteDeadline(id);
      this.refresh();
      this.view.setStatus(`Deleted "${deadline.name}".`);
    } catch (error) {
      this.view.setStatus(getErrorMessage(error));
    }
  }
}
