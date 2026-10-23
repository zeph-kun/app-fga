import { loadEnv } from '../config/env.js';
import { authorizerContract } from './authorizer.contract.js';
import { authorizerPropertyContract } from './authorizer.properties.js';
import { OpenFgaAuthorizer } from './openfga-authorizer.js';
import { OpenFgaManagers } from './openfga-managers.js';
import { OpenFgaMembership } from './openfga-membership.js';
import { OpenFgaStore } from './openfga-store.js';

// A store of its own, so these specs never touch the data of the running app.
authorizerContract('openfga', async () => {
  const store = new OpenFgaStore({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
  await store.onModuleInit();
  const membership = new OpenFgaMembership(store);
  return { authorizer: new OpenFgaAuthorizer(store, membership), membership, managers: new OpenFgaManagers(store) };
});

authorizerPropertyContract(
  'openfga',
  async () => {
    const store = new OpenFgaStore({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
    await store.onModuleInit();
    const membership = new OpenFgaMembership(store);
    return { authorizer: new OpenFgaAuthorizer(store, membership), membership, managers: new OpenFgaManagers(store) };
  },
  60,
);
