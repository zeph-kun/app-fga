import { randomUUID } from 'node:crypto';
import { InMemoryShareLinkRepository } from './in-memory-share-link-repository.js';
import { shareLinkRepositoryContract } from './share-link-repository.contract.js';

shareLinkRepositoryContract('in-memory', () => ({
  repository: new InMemoryShareLinkRepository(),
  newResourceId: () => Promise.resolve(randomUUID()),
}));
