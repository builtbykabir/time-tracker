export enum AppErrorCode {
  InvalidCategoryName = 'INVALID_CATEGORY_NAME',
  CategoryAlreadyExists = 'CATEGORY_ALREADY_EXISTS',
  CategoryNotFound = 'CATEGORY_NOT_FOUND',
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
