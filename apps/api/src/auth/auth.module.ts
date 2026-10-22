import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env.js';
import { AccessTokenVerifier } from './access-token-verifier.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, AccessTokenVerifier, JwtAuthGuard],
  exports: [ENV, AccessTokenVerifier, JwtAuthGuard],
})
export class AuthModule {}
