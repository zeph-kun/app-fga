import { authorizerContract } from './authorizer.contract.js';
import { InMemoryAuthorizer } from './in-memory-authorizer.js';

authorizerContract('in-memory', () => new InMemoryAuthorizer());
