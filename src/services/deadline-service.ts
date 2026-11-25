import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { DeadlineRepository } from '../repositories/deadline-repository.ts';
import { WorkdayClock, daysBetween } from './statistics-range.ts';
import type { AppSettings } from '../config/settings.ts';
import type {
  AddDeadlineInput,
  Deadline,
  DeadlineCountdown,
  DeadlineFilter,
  UpdateDeadlineInput,
} from '../types/deadline.ts';

const MAX_NAME_LENGTH = 160;

export class DeadlineService {
  constructor(private readonly repository: DeadlineRepository) {}

  addDeadline(input: AddDeadlineInput): Deadline {
    const now = Date.now();
    return this.repository.create({
      name: this.normalizeName(input.name),
      deadlineWorkday: this.validateDate(input.deadlineWorkday),
      createdAt: now,
      updatedAt: now,
    });
  }

  updateDeadline(id: number, input: UpdateDeadlineInput): Deadline {
    if (!Object.hasOwn(input, 'name') && !Object.hasOwn(input, 'deadlineWorkday')) {
      throw new AppError(
        AppErrorCode.InvalidDeadlineUpdate,
        'A deadline update must include a name or date.',
        { deadlineId: id },
      );
    }
    const current = this.getDeadline(id);
    const updated = this.repository.update(id, {
      name: Object.hasOwn(input, 'name') ? this.normalizeName(input.name as string) : current.name,
      deadlineWorkday: Object.hasOwn(input, 'deadlineWorkday')
        ? this.validateDate(input.deadlineWorkday as string)
        : current.deadlineWorkday,
      updatedAt: Date.now(),
    });
    if (updated === null) throw this.notFound(id);
    return updated;
  }

  getDeadline(id: number): Deadline {
    const deadline = this.repository.findById(id);
    if (deadline === null) throw this.notFound(id);
    return deadline;
  }

  listDeadlines(filter: DeadlineFilter = 'all'): Deadline[] {
    return this.repository.findAll(filter);
  }

  listCountdowns(
    settings: Pick<AppSettings, 'timeZone' | 'workdayStart'>,
    filter: DeadlineFilter = 'all',
    now = Date.now(),
  ): DeadlineCountdown[] {
    const today = new WorkdayClock(settings.timeZone, settings.workdayStart).workdayForInstant(now);
    return this.listDeadlines(filter).map((deadline) => {
      const daysRemaining = daysBetween(today, deadline.deadlineWorkday);
      return {
        ...deadline,
        daysRemaining,
        countdownLabel:
          daysRemaining > 0
            ? `D-${daysRemaining}`
            : daysRemaining === 0
              ? 'D-DAY'
              : `D+${-daysRemaining}`,
        overdue: daysRemaining < 0 && deadline.completedAt === null,
      };
    });
  }

  markCompleted(id: number): Deadline {
    return this.setCompleted(id, true);
  }

  reopen(id: number): Deadline {
    return this.setCompleted(id, false);
  }

  deleteDeadline(id: number): Deadline {
    const deadline = this.repository.deleteById(id);
    if (deadline === null) throw this.notFound(id);
    return deadline;
  }

  private setCompleted(id: number, completed: boolean): Deadline {
    const deadline = this.repository.setCompleted(id, completed, Date.now());
    if (deadline === null) throw this.notFound(id);
    return deadline;
  }

  private normalizeName(name: string): string {
    if (typeof name !== 'string') {
      throw new AppError(AppErrorCode.InvalidDeadlineName, 'Deadline name must be text.', { name });
    }
    const normalized = name.trim();
    const length = [...normalized].length;
    if (length === 0 || length > MAX_NAME_LENGTH) {
      throw new AppError(
        AppErrorCode.InvalidDeadlineName,
        length === 0
          ? 'Deadline name cannot be empty.'
          : `Deadline name cannot exceed ${MAX_NAME_LENGTH} characters.`,
        { name, length, maxLength: MAX_NAME_LENGTH },
      );
    }
    return normalized;
  }

  private validateDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
      ) {
        return value;
      }
    }
    throw new AppError(
      AppErrorCode.InvalidDeadlineDate,
      'Deadline date must be a real calendar date in YYYY-MM-DD format.',
      { deadlineWorkday: value },
    );
  }

  private notFound(id: number): AppError {
    return new AppError(AppErrorCode.DeadlineNotFound, `Deadline ${id} does not exist.`, {
      deadlineId: id,
    });
  }
}
