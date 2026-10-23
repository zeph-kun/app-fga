/**
 * The Managers: Users allowed to create Teams. The list is the `MANAGERS` setting, applied
 * with `sync`; the Authorizer answers `can_create_team` from it.
 */
export abstract class Managers {
  abstract all(): Promise<string[]>;

  /** Adding a Manager who already is one is a no-op. */
  abstract add(userId: string): Promise<void>;

  /** Removing someone who is not a Manager is a no-op. */
  abstract remove(userId: string): Promise<void>;

  /** Makes the Managers exactly `userIds`: adds the missing ones, removes the others. */
  async sync(userIds: readonly string[]): Promise<{ added: string[]; removed: string[] }> {
    const wanted = new Set(userIds);
    const current = new Set(await this.all());
    const added = [...wanted].filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !wanted.has(id));
    for (const id of added) await this.add(id);
    for (const id of removed) await this.remove(id);
    return { added, removed };
  }
}
