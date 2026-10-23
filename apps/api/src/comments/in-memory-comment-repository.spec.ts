import { randomUUID } from 'node:crypto';
import { commentRepositoryContract } from './comment-repository.contract.js';
import { InMemoryCommentRepository } from './in-memory-comment-repository.js';

commentRepositoryContract('in-memory', () => ({
  repository: new InMemoryCommentRepository(),
  newDocumentId: () => Promise.resolve(randomUUID()),
}));
