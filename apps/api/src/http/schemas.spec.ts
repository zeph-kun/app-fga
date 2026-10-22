import { usernameSchema } from './schemas.js';

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
