import { loadEnv } from '../config/env.js';
import { managersContract } from './managers.contract.js';
import { OpenFgaManagers } from './openfga-managers.js';
import { OpenFgaStore } from './openfga-store.js';

// A store of its own, so these specs never touch the data of the running app.
managersContract('openfga', async () => {
  const store = new OpenFgaStore({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
  await store.onModuleInit();
  return new OpenFgaManagers(store);
});
