import { shouldPersist } from '../persist';
import type { Query } from '@tanstack/react-query';

/* Android's CursorWindow caps one SQLite row at 2MB, and the persister writes
   the whole cache as one row. These assertions are the bound.

   The failure they prevent is not a crash — react-query catches the read error
   and discards the cache — it is silent: the warm start stops happening and
   every launch logs `Row too big to fit into CursorWindow`. Nothing else in
   the app would have told us. */

const query = (key: string, status = 'success'): Query =>
  ({ queryKey: [key], state: { status } }) as unknown as Query;

describe('shouldPersist', () => {
  it('keeps the queries behind the first screen', () => {
    for (const k of ['forYou', 'readerFeed', 'topical', 'trending', 'breakingTop']) {
      expect(shouldPersist(query(k))).toBe(true);
    }
  });

  /* The two that overflowed the row. 'article' selects raw_content — about 5KB
     of body text per story, kept for every article ever opened; 'morePages' is
     an infinite query that appends a page per "More stories" tap and is bounded
     by nothing at all. Neither makes the first paint faster. */
  it('drops the two that grew without bound', () => {
    expect(shouldPersist(query('article'))).toBe(false);
    expect(shouldPersist(query('morePages'))).toBe(false);
  });

  it('drops the rest of the incidental cache', () => {
    for (const k of ['search', 'related', 'profileList', 'commentCounts', 'quizSource', 'feedModes', 'breakingUnread']) {
      expect(shouldPersist(query(k))).toBe(false);
    }
  });

  it('never persists a query that has not succeeded', () => {
    expect(shouldPersist(query('forYou', 'error'))).toBe(false);
    expect(shouldPersist(query('forYou', 'pending'))).toBe(false);
  });

  /* An allowlist is only a bound if it stays small. This fails the moment
     someone adds a key without weighing what it costs on a phone. */
  it('stays an allowlist', () => {
    const allowed = ['forYou', 'readerFeed', 'topical', 'trending', 'breakingTop', 'article', 'morePages', 'search', 'related', 'profileList', 'commentCounts', 'quizSource', 'feedModes', 'breakingUnread', 'breaking']
      .filter((k) => shouldPersist(query(k)));
    expect(allowed).toHaveLength(5);
  });
});
