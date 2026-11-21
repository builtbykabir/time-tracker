import type { SessionRepository } from '../repositories/session-repository.ts';

export class SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}
}
