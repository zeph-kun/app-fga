import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { UserDirectory } from '../users/user-directory.js';
import { Managers } from './managers.js';

export interface ManagersReport {
  readonly added: string[];
  readonly removed: string[];
  /** Configured usernames Keycloak has no User for. */
  readonly unknown: string[];
  /** False when Keycloak could not be asked, so `unknown` says nothing. */
  readonly checked: boolean;
}

/** Aligns the Managers with the `MANAGERS` setting each time the API starts. */
@Injectable()
export class ManagersBootstrap implements OnModuleInit {
  private readonly logger = new Logger(ManagersBootstrap.name);

  constructor(
    private readonly managers: Managers,
    private readonly users: UserDirectory,
    @Inject(ENV) private readonly env: Pick<Env, 'MANAGERS'>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.apply(this.env.MANAGERS);
  }

  /** A username that does not exist is warned about, not refused: Keycloak is not needed to start. */
  async apply(usernames: readonly string[]): Promise<ManagersReport> {
    const { added, removed } = await this.managers.sync(usernames);
    const { unknown, checked } = await this.unknownAmong(usernames);

    this.logger.log(`Managers: ${usernames.join(', ') || 'none'} (added ${added.length}, removed ${removed.length})`);
    for (const name of unknown) this.logger.warn(`MANAGERS lists "${name}", who is not a Keycloak user`);
    if (!checked) this.logger.warn('Keycloak could not be asked whether the Managers exist; skipped');
    return { added, removed, unknown, checked };
  }

  private async unknownAmong(usernames: readonly string[]): Promise<{ unknown: string[]; checked: boolean }> {
    try {
      const exists = await Promise.all(usernames.map((name) => this.users.exists(name)));
      return { unknown: usernames.filter((_, i) => !exists[i]), checked: true };
    } catch {
      return { unknown: [], checked: false };
    }
  }
}
