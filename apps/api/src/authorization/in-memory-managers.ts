import { Managers } from './managers.js';

/** Test adapter. Share one instance with the `InMemoryAuthorizer` that must see the same Managers. */
export class InMemoryManagers extends Managers {
  private readonly userIds: Set<string>;

  constructor(userIds: readonly string[] = []) {
    super();
    this.userIds = new Set(userIds);
  }

  override all(): Promise<string[]> {
    return Promise.resolve([...this.userIds]);
  }

  override add(userId: string): Promise<void> {
    this.userIds.add(userId);
    return Promise.resolve();
  }

  override remove(userId: string): Promise<void> {
    this.userIds.delete(userId);
    return Promise.resolve();
  }
}
