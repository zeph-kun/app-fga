import { UserDirectory } from './user-directory.js';

/** Test adapter: seeded with the usernames it should report as existing. */
export class InMemoryUserDirectory extends UserDirectory {
  private readonly usernames: ReadonlySet<string>;

  constructor(usernames: readonly string[] = []) {
    super();
    this.usernames = new Set(usernames);
  }

  override exists(username: string): Promise<boolean> {
    return Promise.resolve(this.usernames.has(username));
  }
}
