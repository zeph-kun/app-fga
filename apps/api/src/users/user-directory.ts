/** Whether a username corresponds to a real User, so a Share doesn't silently target a typo. */
export abstract class UserDirectory {
  abstract exists(username: string): Promise<boolean>;

  /** At most `limit` usernames starting with `prefix` (any case), in alphabetical order. */
  abstract search(prefix: string, limit: number): Promise<string[]>;
}
