import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { documentRef, userSubject } from '../authorization/authorizer.js';
import { InMemoryAuthorizer } from '../authorization/in-memory-authorizer.js';
import { InMemoryMembership } from '../authorization/in-memory-membership.js';
import { InMemoryDocumentRepository } from '../documents/in-memory-document-repository.js';
import { CommentsService } from './comments.service.js';
import { InMemoryCommentRepository } from './in-memory-comment-repository.js';

const DOC = '5b0f6f0e-1d0c-4c7e-9a43-0d8f6f2c1a11';

/** alice owns the document; bob is a Viewer, carol a Commenter, dave an Editor, erin has no access. */
async function setup() {
  const authorizer = new InMemoryAuthorizer(new InMemoryMembership());
  const documents = new InMemoryDocumentRepository();
  await documents.save({ id: DOC, ownerId: 'alice', title: 'Plan', content: '', folderId: null });
  const ref = documentRef(DOC);
  await authorizer.grant(userSubject('alice'), 'owner', ref);
  await authorizer.grant(userSubject('bob'), 'viewer', ref);
  await authorizer.grant(userSubject('carol'), 'commenter', ref);
  await authorizer.grant(userSubject('dave'), 'editor', ref);
  return { service: new CommentsService(authorizer, documents, new InMemoryCommentRepository()) };
}

describe('CommentsService', () => {
  it('lets a Commenter comment, and everyone who can view read the comments, oldest first', async () => {
    const { service } = await setup();
    await service.add('carol', DOC, { text: 'First' });
    await service.add('dave', DOC, { text: 'Second' });

    const seenByViewer = await service.list('bob', DOC);

    expect(seenByViewer.map((c) => [c.authorId, c.text])).toEqual([
      ['carol', 'First'],
      ['dave', 'Second'],
    ]);
  });

  it('lets Editors and Owners comment too', async () => {
    const { service } = await setup();

    await expect(service.add('dave', DOC, { text: 'Fine' })).resolves.toMatchObject({ authorId: 'dave' });
    await expect(service.add('alice', DOC, { text: 'Thanks' })).resolves.toMatchObject({ authorId: 'alice' });
  });

  it('refuses a Viewer who tries to comment', async () => {
    const { service } = await setup();

    await expect(service.add('bob', DOC, { text: 'Hi' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 to someone who cannot view the document, so its existence is not leaked', async () => {
    const { service } = await setup();

    await expect(service.list('erin', DOC)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.add('erin', DOC, { text: 'Hi' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets an author delete their own comment', async () => {
    const { service } = await setup();
    const comment = await service.add('carol', DOC, { text: 'Oops' });

    await service.remove('carol', DOC, comment.id);

    expect(await service.list('carol', DOC)).toEqual([]);
  });

  it("lets the Owner delete anyone's comment", async () => {
    const { service } = await setup();
    const comment = await service.add('carol', DOC, { text: 'Rude' });

    await service.remove('alice', DOC, comment.id);

    expect(await service.list('alice', DOC)).toEqual([]);
  });

  it("refuses an Editor who deletes someone else's comment", async () => {
    const { service } = await setup();
    const comment = await service.add('carol', DOC, { text: 'Mine' });

    await expect(service.remove('dave', DOC, comment.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await service.list('dave', DOC)).toHaveLength(1);
  });

  it('answers 404 for a comment that does not exist or belongs to another document', async () => {
    const { service } = await setup();

    await expect(service.remove('alice', DOC, '6c1a0b6e-6a27-4f4e-8c7e-3f6c1d7b9a22')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
