import { loadEnv } from '../config/env.js';
import { authorizerContract } from './authorizer.contract.js';
import { authorizerPropertyContract } from './authorizer.properties.js';
import { OpenFgaAuthorizer } from './openfga-authorizer.js';
import { OpenFgaStore } from './openfga-store.js';

// A store of its own, so these specs never touch the data of the running app.
authorizerContract('openfga', async () => {
  const store = new OpenFgaStore({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
  await store.onModuleInit();
  return new OpenFgaAuthorizer(store);
});

authorizerPropertyContract(
  'openfga',
  async () => {
    const store = new OpenFgaStore({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
    await store.onModuleInit();
    return new OpenFgaAuthorizer(store);
  },
  25,
);
