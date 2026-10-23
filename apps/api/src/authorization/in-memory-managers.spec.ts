import { InMemoryManagers } from './in-memory-managers.js';
import { managersContract } from './managers.contract.js';

managersContract('in-memory', () => new InMemoryManagers());
