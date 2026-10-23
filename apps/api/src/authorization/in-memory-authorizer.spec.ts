import { authorizerContract } from './authorizer.contract.js';
import { authorizerPropertyContract } from './authorizer.properties.js';
import { InMemoryAuthorizer } from './in-memory-authorizer.js';
import { InMemoryMembership } from './in-memory-membership.js';

function wire() {
  const membership = new InMemoryMembership();
  return { authorizer: new InMemoryAuthorizer(membership), membership };
}

authorizerContract('in-memory', wire);
authorizerPropertyContract('in-memory', wire, 500);
