import { folderRepositoryContract } from './folder-repository.contract.js';
import { InMemoryFolderRepository } from './in-memory-folder-repository.js';

folderRepositoryContract('in-memory', () => new InMemoryFolderRepository());
