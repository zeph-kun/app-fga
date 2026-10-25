import { randomUUID } from 'node:crypto';
import type { ActivityEntry, ActivityEvent } from './activity-entry.js';
import type { ActivityLogRepository } from './activity-log-repository.js';

/** A repository and a way to get the id of a Document or Folder an entry may point to (a real row, for Postgres). */
export interface ActivityLogStore {
  readonly repository: ActivityLogRepository;
  readonly newResourceId: (type: 'document' | 'folder') => Promise<string>;
}

const shared: ActivityEvent = {
  kind: 'shared',
  subject: { type: 'team', id: 't1', name: 'Design' },
  role: 'editor',
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

export function anEntry(
  resource: ActivityEntry['resource'],
  overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
  return { id: randomUUID(), resource, actorId: 'alice', at: new Date(), event: shared, ...overrides };
}

/**
 * Behavior every ActivityLogRepository adapter must have. Each test uses fresh ids, so adapters
 * need no cleanup between tests.
 */
export function activityLogRepositoryContract(
  adapter: string,
  create: () => ActivityLogStore | Promise<ActivityLogStore>,
): void {
  describe(`ActivityLogRepository (${adapter})`, () => {
    it('returns an added entry for its resource', async () => {
      const { repository, newResourceId } = await create();
      const resource = { type: 'document', id: await newResourceId('document') } as const;
      const entry = anEntry(resource);
      await repository.add(entry);

      expect(await repository.findByResource(resource, 50)).toEqual([entry]);
    });

    const events: [string, ActivityEvent][] = [
      ['a Share with an Expiry', shared],
      ['a Share that never expires', { kind: 'shared', subject: { type: 'user', id: 'bob', name: 'bob' }, role: 'viewer' }],
      ['a Share removed', { kind: 'unshared', subject: { type: 'team', id: 't1', name: 'Design' } }],
      ['a link created', { kind: 'link-created', role: 'commenter', tokenSuffix: 'ab-_', expiresAt: new Date('2030-01-01T00:00:00.000Z') }],
      ['a link revoked', { kind: 'link-revoked', role: 'viewer', tokenSuffix: 'wxyz' }],
      ['a link accepted', { kind: 'link-accepted', role: 'editor', tokenSuffix: '1234' }],
      ['a Move into a Folder', { kind: 'moved', from: null, to: { id: 'f1', name: 'Projects' } }],
      ['a Move out of a Folder', { kind: 'moved', from: { id: 'f1', name: 'Projects' }, to: null }],
    ];

    it.each(events)('keeps every detail of %s', async (_name, event) => {
      const { repository, newResourceId } = await create();
      const resource = { type: 'folder', id: await newResourceId('folder') } as const;
      const entry = anEntry(resource, { event });
      await repository.add(entry);

      expect(await repository.findByResource(resource, 50)).toEqual([entry]);
    });

    it("lists a resource's entries newest first, and no other resource's", async () => {
      const { repository, newResourceId } = await create();
      const document = { type: 'document', id: await newResourceId('document') } as const;
      const folder = { type: 'folder', id: await newResourceId('folder') } as const;
      const [first, second, third] = [
        anEntry(document, { at: new Date('2026-01-01T10:00:00Z') }),
        anEntry(document, { at: new Date('2026-01-01T10:05:00Z') }),
        anEntry(document, { at: new Date('2026-01-01T10:10:00Z') }),
      ];
      for (const entry of [second, anEntry(folder), first, third]) await repository.add(entry);

      expect(await repository.findByResource(document, 50)).toEqual([third, second, first]);
      expect(await repository.findByResource({ type: 'document', id: await newResourceId('document') }, 50)).toEqual([]);
    });

    it('returns only the latest entries up to the limit', async () => {
      const { repository, newResourceId } = await create();
      const resource = { type: 'document', id: await newResourceId('document') } as const;
      const entries = [1, 2, 3, 4].map((minute) => anEntry(resource, { at: new Date(Date.UTC(2026, 0, 1, 10, minute)) }));
      for (const entry of entries) await repository.add(entry);

      expect(await repository.findByResource(resource, 2)).toEqual([entries[3], entries[2]]);
    });
  });
}
