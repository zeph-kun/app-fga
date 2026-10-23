import { Global, Module } from '@nestjs/common';
import { KeycloakUserDirectory } from './keycloak-user-directory.js';
import { UserDirectory } from './user-directory.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Global()
@Module({
  controllers: [UsersController],
  providers: [{ provide: UserDirectory, useClass: KeycloakUserDirectory }, UsersService],
  exports: [UserDirectory],
})
export class UsersModule {}
