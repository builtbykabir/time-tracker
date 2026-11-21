import { AppError, AppErrorCode } from '../errors/app-error.ts';
import type { CategoryRepository } from '../repositories/category-repository.ts';
import type { SessionRepository } from '../repositories/session-repository.ts';
import type { ManualSessionInput, Session } from '../types/session.ts';

export class SessionService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  startSession(categoryId: number): Session {
    this.requireActiveCategory(categoryId);

    const activeSession = this.sessionRepository.findActive();

    if (activeSession !== null) {
      throw this.activeSessionExistsError(activeSession);
    }

    const now = Date.now();

    return this.sessionRepository.createRunning({
      categoryId,
      startedAt: now,
      createdAt: now,
    });
  }

  endActiveSession(): Session {
    const session = this.sessionRepository.endActive(Date.now());

    if (session === null) {
      throw new AppError(AppErrorCode.NoActiveSession, 'There is no active session to end.');
    }

    return session;
  }

  getActiveSession(): Session | null {
    return this.sessionRepository.findActive();
  }

  getSession(id: number): Session {
    const session = this.sessionRepository.findById(id);

    if (session === null) {
      throw this.sessionNotFoundError(id);
    }

    return session;
  }

  listSessions(): Session[] {
    return this.sessionRepository.findAll();
  }

  listSessionsByCategory(categoryId: number): Session[] {
    const category = this.categoryRepository.findById(categoryId);

    if (category === null) {
      throw new AppError(AppErrorCode.CategoryNotFound, `Category ${categoryId} does not exist.`, {
        categoryId,
      });
    }

    return this.sessionRepository.findByCategoryId(categoryId);
  }

  addManualSession(input: ManualSessionInput): Session {
    this.requireActiveCategory(input.categoryId);
    this.validateManualSessionTime(input);

    const overlappingSession = this.sessionRepository.findOverlapping(
      input.startedAt,
      input.endedAt,
    );

    if (overlappingSession !== null) {
      throw new AppError(
        AppErrorCode.SessionOverlap,
        `The manual session overlaps session ${overlappingSession.id}.`,
        {
          conflictingSessionId: overlappingSession.id,
          conflictingStartedAt: overlappingSession.startedAt,
          conflictingEndedAt: overlappingSession.endedAt,
        },
      );
    }

    return this.sessionRepository.createCompleted({
      ...input,
      createdAt: Date.now(),
    });
  }

  deleteSession(id: number): Session {
    const session = this.sessionRepository.findById(id);

    if (session === null) {
      throw this.sessionNotFoundError(id);
    }

    if (session.endedAt === null) {
      throw new AppError(
        AppErrorCode.CannotDeleteActiveSession,
        'An active session must be ended before it can be deleted.',
        { sessionId: id },
      );
    }

    const deletedSession = this.sessionRepository.deleteById(id);

    if (deletedSession === null) {
      throw this.sessionNotFoundError(id);
    }

    return deletedSession;
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

  private validateManualSessionTime(input: ManualSessionInput): void {
    const timestampsAreValid =
      Number.isSafeInteger(input.startedAt) &&
      Number.isSafeInteger(input.endedAt) &&
      input.startedAt >= 0 &&
      input.endedAt >= 0;

    if (!timestampsAreValid || input.endedAt <= input.startedAt) {
      throw new AppError(
        AppErrorCode.InvalidSessionTimeRange,
        'A manual session must have valid timestamps and end after it starts.',
        { startedAt: input.startedAt, endedAt: input.endedAt },
      );
    }

    const now = Date.now();

    if (input.startedAt > now || input.endedAt > now) {
      throw new AppError(
        AppErrorCode.InvalidSessionTimeRange,
        'A manual session cannot be in the future.',
        { startedAt: input.startedAt, endedAt: input.endedAt, now },
      );
    }
  }

  private activeSessionExistsError(session: Session): AppError {
    return new AppError(AppErrorCode.ActiveSessionAlreadyExists, 'A session is already running.', {
      activeSessionId: session.id,
      categoryId: session.categoryId,
      startedAt: session.startedAt,
    });
  }

  private sessionNotFoundError(id: number): AppError {
    return new AppError(AppErrorCode.SessionNotFound, `Session ${id} does not exist.`, {
      sessionId: id,
    });
  }
}
