import { loadEnv } from '../config/env.js';
import { membershipContract } from './membership.contract.js';
import { OpenFgaMembership } from './openfga-membership.js';
import { OpenFgaStore } from './openfga-store.js';

// A store of its own, so these specs never touch the data of the running app.
membershipContract('openfga', async () => {
  const store = new OpenFgaStore({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
  await store.onModuleInit();
  return new OpenFgaMembership(store);
});
