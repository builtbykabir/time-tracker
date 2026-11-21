export type Category = {
  id: number;
  name: string;
  createdAt: number;
  archived: boolean;
};

export type CategoryFilter = 'all' | 'active' | 'archived';
