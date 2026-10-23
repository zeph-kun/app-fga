/** Who belongs to which Team. A role given to a Team applies to every member (see the Authorizer). */
export abstract class Membership {
  /** Direct members of a Team. */
  abstract members(teamId: string): Promise<string[]>;

  /** Adding a User who is already a member is a no-op. */
  abstract add(teamId: string, userId: string): Promise<void>;

  /** Removing a membership that does not exist is a no-op. */
  abstract remove(teamId: string, userId: string): Promise<void>;

  /** Ids of every Team that has at least one member, for maintenance (see `Reconciler`). */
  abstract teamsWithMembers(): Promise<string[]>;

  /** Ids of every Team the user is a direct member of. */
  abstract teamsOf(userId: string): Promise<string[]>;
}
