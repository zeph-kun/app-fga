import { InMemoryUserDirectory } from './in-memory-user-directory.js';
import { userDirectoryContract } from './user-directory.contract.js';

userDirectoryContract('in-memory', () => new InMemoryUserDirectory(['alice', 'bob']), 'alice', 'mallory');
