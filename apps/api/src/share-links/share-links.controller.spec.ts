import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ActivityLog } from '../activity-log/activity-log.js';
import { InMemoryActivityLogRepository } from '../activity-log/in-memory-activity-log-repository.js';
import { AccessTokenVerifier } from '../auth/access-token-verifier.js';
import { Authorizer, documentRef, folderRef, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { ENV, loadEnv } from '../config/env.js';
import { DocumentRepository } from '../documents/document-repository.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import { FolderRepository } from '../folders/folder-repository.js';
import { InMemoryFolderRepository } from '../folders/in-memory-folder-repository.js';
import { Sharing } from '../sharing/sharing.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { InMemoryShareLinkRepository } from './in-memory-share-link-repository.js';
import { ShareLinkRepository } from './share-link-repository.js';
import { ShareLinksController } from './share-links.controller.js';
import { ShareLinks } from './share-links.js';

const documentId = '11111111-1111-4111-8111-111111111111';
const folderId = '22222222-2222-4222-8222-222222222222';

/** The real ShareLinks on in-memory adapters, with alice owning one Document and one Folder. */
async function startApp(env: Record<string, string> = {}): Promise<INestApplication> {
  const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
  await authorizer.grant(userSubject('alice'), 'owner', documentRef(documentId));
  await authorizer.grant(userSubject('alice'), 'owner', folderRef(folderId));
  const documents = new InMemoryDocumentRepository();
  await documents.save({ id: documentId, title: 'Plan', content: '', ownerId: 'alice', folderId: null });
  const folders = new InMemoryFolderRepository();
  await folders.save({ id: folderId, name: 'Projects', ownerId: 'alice' });
  const sharing = new Sharing(authorizer, new InMemoryUserDirectory(['alice', 'bob']), new InMemoryTeamRepository());

  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
    controllers: [ShareLinksController],
    providers: [
      ShareLinks,
      { provide: ActivityLog, useValue: new ActivityLog(authorizer, new InMemoryActivityLogRepository()) },
      { provide: ENV, useValue: loadEnv(env) },
      { provide: AccessTokenVerifier, useValue: { verify: (token: string) => Promise.resolve({ id: token }) } },
      { provide: Authorizer, useValue: authorizer },
      { provide: DocumentRepository, useValue: documents },
      { provide: FolderRepository, useValue: folders },
      { provide: ShareLinkRepository, useValue: new InMemoryShareLinkRepository() },
      { provide: Sharing, useValue: sharing },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('Share links over HTTP', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  const as = (user: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${user}`),
    post: (path: string) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${user}`),
    delete: (path: string) => request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${user}`),
  });

  it.each([
    ['document', `/documents/${documentId}`],
    ['folder', `/folders/${folderId}`],
  ])('lets an Owner invite a User to a %s through a link', async (_type, base) => {
    const created = await as('alice').post(`${base}/share-links`).send({ role: 'editor', expiresInHours: 24 }).expect(201);
    const token: string = created.body.token;

    const preview = await as('bob').get(`/share-links/${token}`).expect(200);
    expect(preview.body).toMatchObject({ role: 'editor', invitedBy: 'alice', resource: { name: expect.any(String) } });
    await as('bob').post(`/share-links/${token}/redeem`).expect(200, { type: base.split('/')[1]?.slice(0, -1), id: base.split('/')[2] });

    const listed = await as('alice').get(`${base}/share-links`).expect(200);
    expect(listed.body).toEqual([expect.objectContaining({ role: 'editor', tokenSuffix: token.slice(-4) })]);
    expect(JSON.stringify(listed.body)).not.toContain(token);
    await as('alice').delete(`${base}/share-links/${listed.body[0].id}`).expect(204);
    await as('bob').get(`/share-links/${token}`).expect(404);
  });

  it('answers 404 to an unknown token, and 401 without a bearer token', async () => {
    await as('bob').get('/share-links/no-such-token').expect(404);
    await as('bob').post('/share-links/no-such-token/redeem').expect(404);
    await request(app.getHttpServer()).get('/share-links/no-such-token').expect(401);
    await request(app.getHttpServer()).post('/share-links/no-such-token/redeem').expect(401);
  });

  it('rejects a link request with an invalid body, and a User who cannot see the resource', async () => {
    await as('alice').post(`/documents/${documentId}/share-links`).send({ role: 'owner' }).expect(400);
    await as('alice').post(`/documents/${documentId}/share-links`).send({ role: 'viewer', expiresInHours: -1 }).expect(400);
    await as('carol').post(`/documents/${documentId}/share-links`).send({ role: 'viewer' }).expect(404);
  });
});

describe('Share link routes are limited per User', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp({ RATE_LIMIT_SHARE_PER_MINUTE: '1' });
  });
  afterAll(() => app.close());

  const routes = [
    ['post', `/documents/${documentId}/share-links`],
    ['get', `/documents/${documentId}/share-links`],
    ['delete', `/documents/${documentId}/share-links/some-id`],
    ['post', `/folders/${folderId}/share-links`],
    ['get', `/folders/${folderId}/share-links`],
    ['delete', `/folders/${folderId}/share-links/some-id`],
    ['get', '/share-links/some-token'],
    ['post', '/share-links/some-token/redeem'],
  ] as const;

  it.each(routes)('%s %s', async (method, path) => {
    const call = () => request(app.getHttpServer())[method](path).set('Authorization', `Bearer limited-${method}${path}`).send({});

    expect((await call()).status).not.toBe(429);
    expect((await call()).status).toBe(429);
  });
});
