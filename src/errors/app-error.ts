export enum AppErrorCode {
  InvalidCategoryName = 'INVALID_CATEGORY_NAME',
  CategoryAlreadyExists = 'CATEGORY_ALREADY_EXISTS',
  CategoryNotFound = 'CATEGORY_NOT_FOUND',
  CategoryArchived = 'CATEGORY_ARCHIVED',
  SessionNotFound = 'SESSION_NOT_FOUND',
  NoActiveSession = 'NO_ACTIVE_SESSION',
  ActiveSessionAlreadyExists = 'ACTIVE_SESSION_ALREADY_EXISTS',
  InvalidSessionTimeRange = 'INVALID_SESSION_TIME_RANGE',
  SessionOverlap = 'SESSION_OVERLAP',
  CannotDeleteActiveSession = 'CANNOT_DELETE_ACTIVE_SESSION',
  InvalidStatisticsRange = 'INVALID_STATISTICS_RANGE',
  InvalidStatisticsConfiguration = 'INVALID_STATISTICS_CONFIGURATION',
  InvalidTodoName = 'INVALID_TODO_NAME',
  InvalidTodoDescription = 'INVALID_TODO_DESCRIPTION',
  InvalidTodoDueAt = 'INVALID_TODO_DUE_AT',
  InvalidTodoUpdate = 'INVALID_TODO_UPDATE',
  TodoNotFound = 'TODO_NOT_FOUND',
  InvalidDeadlineName = 'INVALID_DEADLINE_NAME',
  InvalidDeadlineDate = 'INVALID_DEADLINE_DATE',
  InvalidDeadlineUpdate = 'INVALID_DEADLINE_UPDATE',
  DeadlineNotFound = 'DEADLINE_NOT_FOUND',
  DatabaseOperationFailed = 'DATABASE_OPERATION_FAILED',
}

export type AppErrorDetails = Readonly<Record<string, unknown>>;

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details: AppErrorDetails = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
