import { Inject, Injectable, SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';

/** The routes with a limit of their own; each one is set by an environment variable. */
export type RateLimitedRoute = 'share' | 'userSearch';

const ROUTE = 'rate-limited-route';

const authenticatedSchema = z.object({ user: z.object({ id: z.string() }) });

/**
 * The global limit counts per IP, which is the web server's for every User. Routes that are
 * worth a stricter limit (sharing, searching users) are counted per User instead, so one User
 * cannot use up another's. It must run after `JwtAuthGuard`, which tells who the User is.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(@Inject(ENV) env: Env, storage: ThrottlerStorage, reflector: Reflector) {
    const limits: Record<RateLimitedRoute, number> = {
      share: env.RATE_LIMIT_SHARE_PER_MINUTE,
      userSearch: env.RATE_LIMIT_USER_SEARCH_PER_MINUTE,
    };
    super(
      [
        {
          name: 'user',
          ttl: 60_000,
          limit: (context) => {
            const route = reflector.getAllAndOverride<RateLimitedRoute>(ROUTE, [context.getHandler(), context.getClass()]);
            return limits[route];
          },
        },
      ],
      storage,
      reflector,
    );
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(authenticatedSchema.parse(req).user.id);
  }
}

/** Limits the route per signed-in User. The controller must already have `JwtAuthGuard`, which runs first. */
export const RateLimited = (route: RateLimitedRoute) =>
  applyDecorators(SetMetadata(ROUTE, route), UseGuards(UserThrottlerGuard));
