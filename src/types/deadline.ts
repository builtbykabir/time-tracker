export interface Deadline {
  id: number;
  name: string;
  deadlineWorkday: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export type DeadlineFilter = 'all' | 'active' | 'completed';

export interface AddDeadlineInput {
  name: string;
  deadlineWorkday: string;
}

export interface UpdateDeadlineInput {
  name?: string;
  deadlineWorkday?: string;
}

export interface DeadlineCountdown extends Deadline {
  daysRemaining: number;
  countdownLabel: string;
  overdue: boolean;
}

export interface CreateDeadlineInput extends AddDeadlineInput {
  createdAt: number;
  updatedAt: number;
}

export interface ReplaceDeadlineInput extends AddDeadlineInput {
  updatedAt: number;
}
