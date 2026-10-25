import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ActivityLog } from '../activity-log/activity-log.js';
import { InMemoryActivityLogRepository } from '../activity-log/in-memory-activity-log-repository.js';
import { AccessTokenVerifier } from '../auth/access-token-verifier.js';
import { Authorizer } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { ENV, loadEnv } from '../config/env.js';
import { DocumentRepository } from '../documents/document-repository.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { Sharing } from '../sharing/sharing.js';
import { InMemoryTeamRepository } from '../teams/in-memory-team-repository.js';
import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { FolderRepository } from './folder-repository.js';
import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';
import { InMemoryFolderRepository } from './in-memory-folder-repository.js';

/** The real FoldersService on in-memory adapters; the bearer token is the username. */
async function startApp(): Promise<INestApplication> {
  const membership = new InMemoryMembership();
  const authorizer = new InMemoryAuthorizer(membership);
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository();
  const teams = new InMemoryTeamRepository();
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
    controllers: [FoldersController],
    providers: [
      FoldersService,
      { provide: ENV, useValue: loadEnv({}) },
      { provide: AccessTokenVerifier, useValue: { verify: (token: string) => Promise.resolve({ id: token }) } },
      { provide: Authorizer, useValue: authorizer },
      { provide: DocumentRepository, useValue: documents },
      { provide: FolderRepository, useValue: folders },
      { provide: Sharing, useValue: new Sharing(authorizer, new InMemoryUserDirectory(['alice', 'bob']), teams) },
      { provide: ResourceLifecycle, useValue: new ResourceLifecycle(authorizer, documents, folders, teams, membership) },
      { provide: ActivityLog, useValue: new ActivityLog(authorizer, new InMemoryActivityLogRepository()) },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('Folders in Folders over HTTP', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  const as = (user: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${user}`),
    post: (path: string) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${user}`),
    put: (path: string) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${user}`),
  });

  it('creates a Folder in another, lists it there, and moves it to the top and back', async () => {
    const parent = (await as('alice').post('/folders').send({ name: 'Projects' }).expect(201)).body;
    const child = (await as('alice').post('/folders').send({ name: 'Plans', parentId: parent.id }).expect(201)).body;
    expect(child).toMatchObject({ name: 'Plans', parentId: parent.id });

    const view = (await as('alice').get(`/folders/${parent.id}`).expect(200)).body;
    expect(view.folders.map((f: { id: string }) => f.id)).toEqual([child.id]);
    expect((await as('alice').get(`/folders/${child.id}`).expect(200)).body.breadcrumb).toEqual([
      { id: parent.id, name: 'Projects' },
    ]);

    expect((await as('alice').put(`/folders/${child.id}/parent`).send({ parentId: null }).expect(200)).body).toMatchObject({
      id: child.id,
      parentId: null,
    });
    await as('alice').put(`/folders/${child.id}/parent`).send({ parentId: parent.id }).expect(200);
  });

  it('answers 400 to a body that is not valid, a loop, and a tree that is too deep', async () => {
    const top = (await as('alice').post('/folders').send({ name: 'L1' }).expect(201)).body;
    let last = top;
    for (const level of [2, 3, 4, 5]) {
      last = (await as('alice').post('/folders').send({ name: `L${level}`, parentId: last.id }).expect(201)).body;
    }

    await as('alice').post('/folders').send({ name: 'L6', parentId: last.id }).expect(400);
    await as('alice').post('/folders').send({ name: 'Bad', parentId: 'not-a-uuid' }).expect(400);
    await as('alice').put(`/folders/${top.id}/parent`).send({ parentId: last.id }).expect(400);
    await as('alice').put(`/folders/${top.id}/parent`).send({}).expect(400);
  });

  it('answers 403 to a User who can only read the target, 404 to one who cannot see it, and 401 without a token', async () => {
    const mine = (await as('alice').post('/folders').send({ name: 'Mine' }).expect(201)).body;
    const target = (await as('bob').post('/folders').send({ name: 'Bobs' }).expect(201)).body;

    await as('alice').put(`/folders/${mine.id}/parent`).send({ parentId: target.id }).expect(404);

    await as('bob').post(`/folders/${target.id}/shares`).send({ subject: { type: 'user', id: 'alice' }, role: 'viewer' }).expect(204);
    await as('alice').put(`/folders/${mine.id}/parent`).send({ parentId: target.id }).expect(403);
    await request(app.getHttpServer()).put(`/folders/${mine.id}/parent`).send({ parentId: null }).expect(401);
  });
});
