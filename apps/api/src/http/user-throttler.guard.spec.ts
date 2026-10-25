import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { loadEnv } from '../config/env.js';
import { RateLimited, UserThrottlerGuard } from './user-throttler.guard.js';

class Routes {
  @RateLimited('share')
  share() {}

  @RateLimited('userSearch')
  search() {}
}

const env = loadEnv({ RATE_LIMIT_SHARE_PER_MINUTE: '2', RATE_LIMIT_USER_SEARCH_PER_MINUTE: '3' });

/** A request to a route of `Routes` by `userId`, as the guard sees it once the JwtAuthGuard has run. */
function call(guard: UserThrottlerGuard, route: keyof Routes, userId: string): Promise<boolean> {
  const response = { header: () => undefined };
  const context = {
    getHandler: () => Routes.prototype[route],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: userId }, ip: '10.0.0.1', headers: {} }), getResponse: () => response }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

async function setup() {
  const guard = new UserThrottlerGuard(env, new ThrottlerStorageService(), new Reflector());
  await guard.onModuleInit();
  return guard;
}

describe('UserThrottlerGuard', () => {
  it('lets a user call a route up to its limit, then answers 429', async () => {
    const guard = await setup();

    expect(await call(guard, 'share', 'alice')).toBe(true);
    expect(await call(guard, 'share', 'alice')).toBe(true);
    await expect(call(guard, 'share', 'alice')).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('counts each user on their own', async () => {
    const guard = await setup();
    await call(guard, 'share', 'alice');
    await call(guard, 'share', 'alice');

    expect(await call(guard, 'share', 'bob')).toBe(true);
  });

  it('gives each route its own limit and its own count', async () => {
    const guard = await setup();
    await call(guard, 'share', 'alice');
    await call(guard, 'share', 'alice');

    expect(await call(guard, 'search', 'alice')).toBe(true);
    expect(await call(guard, 'search', 'alice')).toBe(true);
    expect(await call(guard, 'search', 'alice')).toBe(true);
    await expect(call(guard, 'search', 'alice')).rejects.toBeInstanceOf(ThrottlerException);
  });
});
