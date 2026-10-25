import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { documentRef, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import type { ActivityEntry, ActivityEvent } from './activity-entry.js';
import { ActivityLog } from './activity-log.js';
import { InMemoryActivityLogRepository } from './in-memory-activity-log-repository.js';

const doc = { type: 'document', id: 'doc-1' } as const;
const shared = (name: string): ActivityEvent => ({
  kind: 'shared',
  subject: { type: 'user', id: name, name },
  role: 'viewer',
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** alice owns `doc`, bob can only read it, carol knows nothing of it. */
async function setup(repository = new InMemoryActivityLogRepository()) {
  const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
  await authorizer.grant(userSubject('alice'), 'owner', documentRef(doc.id));
  await authorizer.grant(userSubject('bob'), 'viewer', documentRef(doc.id));
  return { repository, activityLog: new ActivityLog(authorizer, repository) };
}

describe('ActivityLog', () => {
  it('shows the Owner what was recorded, newest first, with who did it and when', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { activityLog } = await setup();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    await activityLog.record('alice', doc, shared('bob'));
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    await activityLog.record('alice', doc, shared('carol'));

    const { entries, more } = await activityLog.forResource('alice', doc);

    expect(entries).toEqual([
      expect.objectContaining({ actorId: 'alice', at: new Date('2026-01-01T11:00:00Z'), event: shared('carol') }),
      expect.objectContaining({ actorId: 'alice', at: new Date('2026-01-01T10:00:00Z'), event: shared('bob') }),
    ]);
    expect(more).toBe(false);
  });

  it('is for whoever may share the resource: 403 to a User who can only read it, 404 to one who cannot see it', async () => {
    const { activityLog } = await setup();

    await expect(activityLog.forResource('bob', doc)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(activityLog.forResource('carol', doc)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives the latest 50 entries and says when there are more', async () => {
    const { repository, activityLog } = await setup();
    const add = (minute: number): ActivityEntry => ({
      id: `entry-${minute}`,
      resource: doc,
      actorId: 'alice',
      at: new Date(Date.UTC(2026, 0, 1, 0, minute)),
      event: shared('bob'),
    });
    for (let minute = 0; minute < 50; minute++) await repository.add(add(minute));

    const exactly = await activityLog.forResource('alice', doc);
    expect(exactly.entries).toHaveLength(50);
    expect(exactly.more).toBe(false);

    await repository.add(add(50));
    const beyond = await activityLog.forResource('alice', doc);
    expect(beyond.entries).toHaveLength(50);
    expect(beyond.entries[0]?.id).toBe('entry-50');
    expect(beyond.more).toBe(true);
  });

  it('does not fail the change it records when the entry cannot be written, and logs the error', async () => {
    const repository = new InMemoryActivityLogRepository();
    vi.spyOn(repository, 'add').mockRejectedValue(new Error('Postgres unavailable'));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { activityLog } = await setup(repository);

    await expect(activityLog.record('alice', doc, shared('bob'))).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('Postgres unavailable'));
  });
});
