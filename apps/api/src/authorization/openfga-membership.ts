import { Injectable } from '@nestjs/common';
import { Membership } from './membership.js';
import { OpenFgaStore, type Tuple, ignoreDuplicateWrites, ignoreMissingDeletes } from './openfga-store.js';

@Injectable()
export class OpenFgaMembership extends Membership {
  constructor(private readonly store: OpenFgaStore) {
    super();
  }

  override async members(teamId: string): Promise<string[]> {
    const tuples = await this.store.tuplesOn(`team:${teamId}`);
    return tuples
      .filter((t) => t.relation === 'member' && t.user.startsWith('user:'))
      .map((t) => t.user.slice('user:'.length));
  }

  override async add(teamId: string, userId: string): Promise<void> {
    await this.store.client.write({ writes: [memberTuple(teamId, userId)] }, ignoreDuplicateWrites);
  }

  override async remove(teamId: string, userId: string): Promise<void> {
    await this.store.client.write({ deletes: [memberTuple(teamId, userId)] }, ignoreMissingDeletes);
  }

  override async teamsOf(userId: string): Promise<string[]> {
    const { objects } = await this.store.client.listObjects({
      user: `user:${userId}`,
      relation: 'member',
      type: 'team',
    });
    return objects.map((object) => object.slice('team:'.length));
  }
}

function memberTuple(teamId: string, userId: string): Tuple {
  return { user: `user:${userId}`, relation: 'member', object: `team:${teamId}` };
}
