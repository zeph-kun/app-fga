import { InMemoryMembership } from './in-memory-membership.js';
import { membershipContract } from './membership.contract.js';

membershipContract('in-memory', () => new InMemoryMembership());
