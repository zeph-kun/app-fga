import { randomUUID } from 'node:crypto';
import { activityLogRepositoryContract } from './activity-log-repository.contract.js';
import { InMemoryActivityLogRepository } from './in-memory-activity-log-repository.js';

activityLogRepositoryContract('in-memory', () => ({
  repository: new InMemoryActivityLogRepository(),
  newResourceId: () => Promise.resolve(randomUUID()),
}));
