import { InMemoryTeamRepository } from './in-memory-team-repository.js';
import { teamRepositoryContract } from './team-repository.contract.js';

teamRepositoryContract('in-memory', () => new InMemoryTeamRepository());
