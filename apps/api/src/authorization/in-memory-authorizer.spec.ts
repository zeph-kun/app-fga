import { authorizerContract } from './authorizer.contract.js';
import { authorizerPropertyContract } from './authorizer.properties.js';
import { InMemoryManagers } from './in-memory-managers.js';
import { InMemoryAuthorizer } from './in-memory-authorizer.js';
import { InMemoryMembership } from './in-memory-membership.js';

function wire() {
  const membership = new InMemoryMembership();
  const managers = new InMemoryManagers();
  return { authorizer: new InMemoryAuthorizer(membership, managers), membership, managers };
}

authorizerContract('in-memory', wire);
authorizerPropertyContract('in-memory', wire, 500);
