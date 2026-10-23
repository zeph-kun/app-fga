import { loadEnv } from '../config/env.js';
import { authorizerContract } from './authorizer.contract.js';
import { authorizerPropertyContract } from './authorizer.properties.js';
import { OpenFgaAuthorizer } from './openfga-authorizer.js';

// A store of its own, so these specs never touch the data of the running app.
authorizerContract('openfga', async () => {
  const authorizer = new OpenFgaAuthorizer({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
  await authorizer.onModuleInit();
  return authorizer;
});

authorizerPropertyContract(
  'openfga',
  async () => {
    const authorizer = new OpenFgaAuthorizer({ ...loadEnv(), OPENFGA_STORE_NAME: 'app-fga-test' });
    await authorizer.onModuleInit();
    return authorizer;
  },
  25,
);
