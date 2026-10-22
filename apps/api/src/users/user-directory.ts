/** Whether a username corresponds to a real User, so a Share doesn't silently target a typo. */
export abstract class UserDirectory {
  abstract exists(username: string): Promise<boolean>;
}
