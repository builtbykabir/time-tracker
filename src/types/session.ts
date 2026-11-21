export type Session = {
  id: number;
  categoryId: number;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
};

export type CreateRunningSessionInput = {
  categoryId: number;
  startedAt: number;
  createdAt: number;
};

export type CreateCompletedSessionInput = {
  categoryId: number;
  startedAt: number;
  endedAt: number;
  createdAt: number;
};

export type ManualSessionInput = {
  categoryId: number;
  startedAt: number;
  endedAt: number;
};
