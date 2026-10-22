import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './access-token-verifier.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
