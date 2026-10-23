import { InMemoryUserDirectory } from '../users/in-memory-user-directory.js';
import { InMemoryManagers } from './in-memory-managers.js';
import { ManagersBootstrap } from './managers-bootstrap.js';

const setup = (current: string[], known: string[]) => {
  const managers = new InMemoryManagers(current);
  return { managers, bootstrap: new ManagersBootstrap(managers, new InMemoryUserDirectory(known), { MANAGERS: [] }) };
};

describe('ManagersBootstrap', () => {
  it('makes the Managers exactly the configured usernames', async () => {
    const { managers, bootstrap } = setup(['alice', 'bob'], ['alice', 'bob', 'carol']);

    const report = await bootstrap.apply(['bob', 'carol']);

    expect((await managers.all()).sort()).toEqual(['bob', 'carol']);
    expect(report).toMatchObject({ added: ['carol'], removed: ['alice'] });
  });

  it('warns about a username Keycloak does not know, and still appoints it', async () => {
    const { managers, bootstrap } = setup([], ['alice']);

    const report = await bootstrap.apply(['alice', 'flrian']);

    expect(report.unknown).toEqual(['flrian']);
    expect((await managers.all()).sort()).toEqual(['alice', 'flrian']);
  });

  it('still appoints the Managers when Keycloak cannot be asked', async () => {
    const managers = new InMemoryManagers();
    class Unreachable extends InMemoryUserDirectory {
      override exists(): Promise<boolean> {
        return Promise.reject(new Error('Keycloak unavailable'));
      }
    }
    const bootstrap = new ManagersBootstrap(managers, new Unreachable(), { MANAGERS: [] });

    const report = await bootstrap.apply(['alice']);

    expect(report).toMatchObject({ checked: false, unknown: [] });
    expect(await managers.all()).toEqual(['alice']);
  });
});
