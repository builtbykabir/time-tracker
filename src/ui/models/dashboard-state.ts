export type CurrentSessionState =
  | {
      status: 'idle';
      categoryName: string | null;
    }
  | {
      status: 'active';
      sessionId: number;
      categoryName: string;
      startedAt: number;
    };
