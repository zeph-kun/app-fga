import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';

export interface AuthUser {
  /** Stable identifier used as the `user:<id>` subject in OpenFGA. */
  readonly id: string;
  readonly email: string | undefined;
}

const claimsSchema = z.object({
  preferred_username: z.string().min(1),
  email: z.string().optional(),
});

/** Verifies Keycloak access tokens (signature via JWKS, issuer, expiry). */
@Injectable()
export class AccessTokenVerifier {
  private readonly jwks;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.jwks = createRemoteJWKSet(
      new URL(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`),
    );
  }

  async verify(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.env.KEYCLOAK_ISSUER,
      });
      const claims = claimsSchema.parse(payload);
      return { id: claims.preferred_username, email: claims.email };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
