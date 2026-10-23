import { Global, Module } from '@nestjs/common';
import { Authorizer } from './authorizer.js';
import { Membership } from './membership.js';
import { OpenFgaAuthorizer } from './openfga-authorizer.js';
import { OpenFgaMembership } from './openfga-membership.js';
import { OpenFgaStore } from './openfga-store.js';

@Global()
@Module({
  providers: [
    OpenFgaStore,
    { provide: Authorizer, useClass: OpenFgaAuthorizer },
    { provide: Membership, useClass: OpenFgaMembership },
  ],
  exports: [Authorizer, Membership],
})
export class AuthorizationModule {}
