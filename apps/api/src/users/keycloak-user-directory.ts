import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { UserDirectory } from './user-directory.js';

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const usersSchema = z.array(z.object({ username: z.string() }));

interface CachedToken {
  readonly value: string;
  readonly expiresAt: number;
}

/**
 * Checks usernames against Keycloak's Admin REST API, using a service-account
 * client (`KEYCLOAK_ADMIN_CLIENT_ID`) with the realm's `view-users` role.
 */
@Injectable()
export class KeycloakUserDirectory extends UserDirectory {
  private readonly realmUrl: URL;
  private readonly adminUsersUrl: URL;
  private cached: CachedToken | undefined;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.realmUrl = new URL(env.KEYCLOAK_ISSUER);
    const realm = this.realmUrl.pathname.split('/').pop();
    this.adminUsersUrl = new URL(`/admin/realms/${realm}/users`, this.realmUrl);
  }

  override async exists(username: string): Promise<boolean> {
    const url = new URL(this.adminUsersUrl);
    url.searchParams.set('username', username);
    url.searchParams.set('exact', 'true');

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.token()}` },
    });
    if (!response.ok) throw new Error(`Keycloak admin API returned ${response.status}`);

    const users = usersSchema.parse(await response.json());
    return users.some((user) => user.username.toLowerCase() === username.toLowerCase());
  }

  /** The service account's access token, fetched once and reused until shortly before it expires. */
  private async token(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;

    const response = await fetch(new URL('protocol/openid-connect/token', `${this.realmUrl}/`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.env.KEYCLOAK_ADMIN_CLIENT_ID,
        client_secret: this.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
      }),
    });
    if (!response.ok) throw new Error(`Keycloak token endpoint returned ${response.status}`);

    const { access_token, expires_in } = tokenSchema.parse(await response.json());
    this.cached = { value: access_token, expiresAt: Date.now() + (expires_in - 10) * 1000 };
    return access_token;
  }
}
