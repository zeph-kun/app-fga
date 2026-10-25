import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AccessTokenVerifier } from '../auth/access-token-verifier.js';
import { ENV, loadEnv } from '../config/env.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('GET /users', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [UsersController],
      providers: [
        { provide: ENV, useValue: loadEnv({ RATE_LIMIT_USER_SEARCH_PER_MINUTE: '2' }) },
        { provide: UsersService, useValue: { suggest: () => Promise.resolve([]) } },
        { provide: AccessTokenVerifier, useValue: { verify: (token: string) => Promise.resolve({ id: token }) } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  const search = (user: string) => request(app.getHttpServer()).get('/users?q=a').set('Authorization', `Bearer ${user}`);

  it('answers 429 to a user who searches too often, and only to them', async () => {
    await search('alice').expect(200);
    await search('alice').expect(200);
    await search('alice').expect(429);
    await search('bob').expect(200);
  });
});
