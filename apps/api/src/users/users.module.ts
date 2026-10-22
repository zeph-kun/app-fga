import { Global, Module } from '@nestjs/common';
import { KeycloakUserDirectory } from './keycloak-user-directory.js';
import { UserDirectory } from './user-directory.js';

@Global()
@Module({
  providers: [{ provide: UserDirectory, useClass: KeycloakUserDirectory }],
  exports: [UserDirectory],
})
export class UsersModule {}
