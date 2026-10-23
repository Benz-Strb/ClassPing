import { RejectedGuesses } from './rejected-guesses.js';

describe('RejectedGuesses', () => {
  it('จำแยกตามคาบและคน แล้วลืมเองเมื่อคาบจบ', () => {
    let now = new Date('2026-10-23T03:00:00Z');
    const memory = new RejectedGuesses(() => now);
    const endsAt = new Date('2026-10-23T05:00:00Z');
    memory.reject('s1', 'a', endsAt);
    expect(memory.isRejected('s1', 'a')).toBe(true);
    expect(memory.isRejected('s1', 'b')).toBe(false);
    expect(memory.isRejected('s2', 'a')).toBe(false);

    now = endsAt;
    expect(memory.isRejected('s1', 'a')).toBe(false);
  });
});
