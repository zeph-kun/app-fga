import { Global, Module } from '@nestjs/common';
import { Authorizer } from './authorizer.js';
import { Managers } from './managers.js';
import { ManagersBootstrap } from './managers-bootstrap.js';
import { Membership } from './membership.js';
import { OpenFgaAuthorizer } from './openfga-authorizer.js';
import { OpenFgaManagers } from './openfga-managers.js';
import { OpenFgaMembership } from './openfga-membership.js';
import { OpenFgaStore } from './openfga-store.js';

@Global()
@Module({
  providers: [
    OpenFgaStore,
    { provide: Authorizer, useClass: OpenFgaAuthorizer },
    { provide: Membership, useClass: OpenFgaMembership },
    { provide: Managers, useClass: OpenFgaManagers },
    ManagersBootstrap,
  ],
  exports: [Authorizer, Membership, Managers],
})
export class AuthorizationModule {}
