import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/access-token-verifier.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parse } from '../http/parse.js';
import { RateLimited } from '../http/user-throttler.guard.js';
import { UsersService } from './users.service.js';

const querySchema = z.object({ q: z.string().trim().max(100).default('') });

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RateLimited('userSearch')
  suggest(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.users.suggest(user.id, parse(querySchema, query).q);
  }
}
