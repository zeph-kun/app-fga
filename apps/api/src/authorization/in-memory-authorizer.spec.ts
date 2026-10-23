import { authorizerContract } from './authorizer.contract.js';
import { authorizerPropertyContract } from './authorizer.properties.js';
import { InMemoryAuthorizer } from './in-memory-authorizer.js';

authorizerContract('in-memory', () => new InMemoryAuthorizer());
authorizerPropertyContract('in-memory', () => new InMemoryAuthorizer(), 200);
