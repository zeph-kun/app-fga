import { InMemoryUserDirectory } from './in-memory-user-directory.js';
import { UsersService } from './users.service.js';

function setup(usernames: string[]) {
  return new UsersService(new InMemoryUserDirectory(usernames));
}

describe('UsersService', () => {
  it('suggests the users whose name starts with the text', async () => {
    const service = setup(['alice', 'adham', 'bob']);

    expect(await service.suggest('alice-the-owner', 'a')).toEqual(['adham', 'alice']);
  });

  it('never suggests the caller, who cannot share with themselves', async () => {
    const service = setup(['alice', 'adham']);

    expect(await service.suggest('alice', 'a')).toEqual(['adham']);
  });

  it('suggests a handful of users at most', async () => {
    const names = Array.from({ length: 30 }, (_, i) => `user${String(i).padStart(2, '0')}`);
    const service = setup(names);

    expect(await service.suggest('someone', 'user')).toHaveLength(8);
  });
});
