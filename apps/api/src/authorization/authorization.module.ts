import { Global, Module } from '@nestjs/common';
import { Authorizer } from './authorizer.js';
import { OpenFgaAuthorizer } from './openfga-authorizer.js';

@Global()
@Module({
  providers: [{ provide: Authorizer, useClass: OpenFgaAuthorizer }],
  exports: [Authorizer],
})
export class AuthorizationModule {}
