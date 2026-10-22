import { randomUUID } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { KeycloakUserDirectory } from './keycloak-user-directory.js';
import { userDirectoryContract } from './user-directory.contract.js';

userDirectoryContract('keycloak', () => new KeycloakUserDirectory(loadEnv()), 'alice', randomUUID());
