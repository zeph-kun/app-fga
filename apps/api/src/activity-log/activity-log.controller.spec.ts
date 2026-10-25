import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AccessTokenVerifier } from '../auth/access-token-verifier.js';
import { Authorizer, documentRef, folderRef, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { ENV, loadEnv } from '../config/env.js';
import { ActivityLogController } from './activity-log.controller.js';
import { ActivityLog } from './activity-log.js';
import { ActivityLogRepository } from './activity-log-repository.js';
import { InMemoryActivityLogRepository } from './in-memory-activity-log-repository.js';

const documentId = '11111111-1111-4111-8111-111111111111';
const folderId = '22222222-2222-4222-8222-222222222222';

/** alice owns a Document and a Folder, bob can only read the Document, and each has one entry. */
async function startApp(env: Record<string, string> = {}): Promise<INestApplication> {
  const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
  await authorizer.grant(userSubject('alice'), 'owner', documentRef(documentId));
  await authorizer.grant(userSubject('alice'), 'owner', folderRef(folderId));
  await authorizer.grant(userSubject('bob'), 'viewer', documentRef(documentId));
  const repository = new InMemoryActivityLogRepository();
  const activity = new ActivityLog(authorizer, repository);
  const event = { kind: 'shared', subject: { type: 'user', id: 'bob', name: 'bob' }, role: 'viewer' } as const;
  await activity.record('alice', { type: 'document', id: documentId }, event);
  await activity.record('alice', { type: 'folder', id: folderId }, event);

  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
    controllers: [ActivityLogController],
    providers: [
      { provide: ENV, useValue: loadEnv(env) },
      { provide: AccessTokenVerifier, useValue: { verify: (token: string) => Promise.resolve({ id: token }) } },
      { provide: Authorizer, useValue: authorizer },
      { provide: ActivityLogRepository, useValue: repository },
      ActivityLog,
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('Activity over HTTP', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  const get = (path: string, user?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return user ? call.set('Authorization', `Bearer ${user}`) : call;
  };

  it.each([`/documents/${documentId}/activity`, `/folders/${folderId}/activity`])(
    'gives the Owner the entries of %s',
    async (path) => {
      const { body } = await get(path, 'alice').expect(200);

      expect(body).toEqual({
        entries: [
          {
            id: expect.any(String),
            actorId: 'alice',
            at: expect.any(String),
            event: { kind: 'shared', subject: { type: 'user', id: 'bob', name: 'bob' }, role: 'viewer' },
          },
        ],
        more: false,
      });
    },
  );

  it('answers 403 to a User who can only read, 404 to one who cannot see it, and 401 without a token', async () => {
    await get(`/documents/${documentId}/activity`, 'bob').expect(403);
    await get(`/documents/${documentId}/activity`, 'carol').expect(404);
    await get(`/folders/${folderId}/activity`, 'carol').expect(404);
    await get(`/documents/${documentId}/activity`).expect(401);
  });
});

describe('Activity routes are limited per User', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp({ RATE_LIMIT_SHARE_PER_MINUTE: '1' });
  });
  afterAll(() => app.close());

  it.each([`/documents/${documentId}/activity`, `/folders/${folderId}/activity`])('%s', async (path) => {
    const call = () => request(app.getHttpServer()).get(path).set('Authorization', `Bearer limited-${path}`);

    expect((await call()).status).not.toBe(429);
    expect((await call()).status).toBe(429);
  });
});
