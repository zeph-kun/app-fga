import { readFile } from 'node:fs/promises';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ClientWriteRequestOnDuplicateWrites,
  ClientWriteRequestOnMissingDeletes,
  CredentialsMethod,
  OpenFgaClient,
} from '@openfga/sdk';
import { transformer } from '@openfga/syntax-transformer';
import { ENV, type Env } from '../config/env.js';

export const ignoreMissingDeletes = {
  conflict: { onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore },
};
export const ignoreDuplicateWrites = {
  conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore },
};

export interface Tuple {
  readonly user: string;
  readonly relation: string;
  readonly object: string;
  readonly condition?: { readonly name: string; readonly context?: object };
}

/** The OpenFGA store the Authorizer and Membership both write to: one client, one model. */
@Injectable()
export class OpenFgaStore implements OnModuleInit {
  private readonly logger = new Logger(OpenFgaStore.name);
  readonly client: OpenFgaClient;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = new OpenFgaClient({
      apiUrl: env.OPENFGA_API_URL,
      credentials: {
        method: CredentialsMethod.ApiToken,
        config: { token: env.OPENFGA_API_TOKEN },
      },
    });
  }

  /** Finds (or creates) the store and publishes the authorization model. */
  async onModuleInit(): Promise<void> {
    const { stores } = await this.client.listStores();
    const existing = stores.find((s) => s.name === this.env.OPENFGA_STORE_NAME);
    const storeId =
      existing?.id ?? (await this.client.createStore({ name: this.env.OPENFGA_STORE_NAME })).id;
    this.client.storeId = storeId;

    const dsl = await readFile(this.env.OPENFGA_MODEL_PATH, 'utf8');
    const model = await this.client.writeAuthorizationModel(
      transformer.transformDSLToJSONObject(dsl),
    );
    this.client.authorizationModelId = model.authorization_model_id;
    this.logger.log(`OpenFGA store ${storeId}, model ${model.authorization_model_id}`);
  }

  /** Every tuple stored on `object`, whatever its relation. */
  async tuplesOn(object: string): Promise<Tuple[]> {
    const tuples: Tuple[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.read({ object }, { continuationToken });
      tuples.push(...page.tuples.map(({ key }) => key));
      continuationToken = page.continuation_token || undefined;
    } while (continuationToken);
    return tuples;
  }
}
