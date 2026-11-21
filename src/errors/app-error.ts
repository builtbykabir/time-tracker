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
