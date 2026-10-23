import { Injectable } from '@nestjs/common';
import { Managers } from './managers.js';
import { OpenFgaStore, type Tuple, ignoreDuplicateWrites, ignoreMissingDeletes } from './openfga-store.js';

const ORGANIZATION = 'organization:main';

@Injectable()
export class OpenFgaManagers extends Managers {
  constructor(private readonly store: OpenFgaStore) {
    super();
  }

  override async all(): Promise<string[]> {
    const tuples = await this.store.tuplesOn(ORGANIZATION);
    return tuples
      .filter((t) => t.relation === 'manager' && t.user.startsWith('user:'))
      .map((t) => t.user.slice('user:'.length));
  }

  override async add(userId: string): Promise<void> {
    await this.store.client.write({ writes: [managerTuple(userId)] }, ignoreDuplicateWrites);
  }

  override async remove(userId: string): Promise<void> {
    await this.store.client.write({ deletes: [managerTuple(userId)] }, ignoreMissingDeletes);
  }
}

function managerTuple(userId: string): Tuple {
  return { user: `user:${userId}`, relation: 'manager', object: ORGANIZATION };
}
