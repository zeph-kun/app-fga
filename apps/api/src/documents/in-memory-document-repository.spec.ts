import { documentRepositoryContract } from './document-repository.contract.js';
import { InMemoryDocumentRepository } from './in-memory-document-repository.js';

documentRepositoryContract('in-memory', () => new InMemoryDocumentRepository());
