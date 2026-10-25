import type { INestApplication, Provider, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AccessTokenVerifier } from '../auth/access-token-verifier.js';
import { Authorizer } from '../authorization/authorizer.js';
import { ENV, loadEnv } from '../config/env.js';
import { FoldersController } from '../folders/folders.controller.js';
import { FoldersService } from '../folders/folders.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/** What the controllers call to share or unshare: it does nothing, since only the limit is under test. */
const sharingStub = { share: () => Promise.resolve(), unshare: () => Promise.resolve() };

async function appWith(controller: Type<unknown>, providers: Provider[]) {
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
    controllers: [controller],
    providers: [
      { provide: ENV, useValue: loadEnv({ RATE_LIMIT_SHARE_PER_MINUTE: '1' }) },
      { provide: AccessTokenVerifier, useValue: { verify: (token: string) => Promise.resolve({ id: token }) } },
      ...providers,
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

/** Every route that gives or revokes a Share, on a resource named `base`: each must be limited per User. */
function limitsSharing(base: string, create: () => Promise<INestApplication>) {
  let app: INestApplication;
  beforeAll(async () => {
    app = await create();
  });
  afterAll(() => app.close());

  const routes = [
    ['POST', `${base}/shares`],
    ['DELETE', `${base}/shares/users/bob`],
    ['DELETE', `${base}/shares/teams/team-1`],
  ] as const;

  it.each(routes)('limits %s %s per User', async (method, path) => {
    const call = (user: string) =>
      request(app.getHttpServer())[method === 'POST' ? 'post' : 'delete'](path).set('Authorization', `Bearer ${user}-${path}`);
    const as = (user: string) => call(user).send({});

    expect((await as('alice')).status).not.toBe(429);
    expect((await as('alice')).status).toBe(429);
  });
}

describe('Sharing routes of Documents', () => {
  limitsSharing('/documents/doc-1', () =>
    appWith(DocumentsController, [
      { provide: DocumentsService, useValue: sharingStub },
      { provide: Authorizer, useValue: {} },
    ]),
  );
});

describe('Sharing routes of Folders', () => {
  limitsSharing('/folders/folder-1', () => appWith(FoldersController, [{ provide: FoldersService, useValue: sharingStub }]));
});
