import type { Article } from '../content';

/* A minimal Article for tests.

   Deliberately not a fixture file of real rows: the tests below are about
   rules, and a rule stated over an obvious three-field object is readable in a
   way that the same rule stated over a 15-field production row is not.
   Anything a test cares about it passes explicitly. */
export function article(over: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'A headline long enough to be usable',
    summary: 'A summary.',
    body: null,
    url: 'https://indianexpress.com/article/x',
    topic: 'India',
    publisher: 'Indian Express',
    imageUrl: 'https://img.example/1.jpg',
    publishedAt: '2026-07-26T10:00:00.000Z',
    prominence: 0,
    factLabel: null,
    readMins: 1,
    wordCount: 2,
    modes: null,
    ...over,
  };
}

/** n articles with distinct ids, all carrying a photo. */
export function articles(n: number, over: (i: number) => Partial<Article> = () => ({})): Article[] {
  return Array.from({ length: n }, (_, i) => article({ id: `a${i}`, ...over(i) }));
}
