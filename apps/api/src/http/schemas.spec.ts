import { commentSchema, shareSchema, usernameSchema } from './schemas.js';

describe('usernameSchema', () => {
  it('accepts a plain username', () => {
    expect(usernameSchema.safeParse('bob').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(usernameSchema.safeParse('').success).toBe(false);
  });

  it('rejects a string made only of whitespace', () => {
    expect(usernameSchema.safeParse('   ').success).toBe(false);
  });

  it('trims surrounding whitespace from an otherwise valid username', () => {
    const result = usernameSchema.safeParse('  bob  ');
    expect(result).toMatchObject({ success: true, data: 'bob' });
  });
});

describe('shareSchema', () => {
  const subject = { type: 'user', id: 'bob' };

  it.each(['viewer', 'commenter', 'editor'])('accepts the %s role', (role) => {
    expect(shareSchema.safeParse({ subject, role }).success).toBe(true);
  });

  it('rejects the owner role: an Owner cannot be shared with', () => {
    expect(shareSchema.safeParse({ subject, role: 'owner' }).success).toBe(false);
  });
});

describe('commentSchema', () => {
  it('trims a comment', () => {
    expect(commentSchema.safeParse({ text: '  Looks good  ' })).toMatchObject({ success: true, data: { text: 'Looks good' } });
  });

  it('rejects an empty or blank comment', () => {
    expect(commentSchema.safeParse({ text: '' }).success).toBe(false);
    expect(commentSchema.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('accepts 2,000 characters and rejects one more', () => {
    expect(commentSchema.safeParse({ text: 'a'.repeat(2000) }).success).toBe(true);
    expect(commentSchema.safeParse({ text: 'a'.repeat(2001) }).success).toBe(false);
  });
});
