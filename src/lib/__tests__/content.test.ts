import { mapArticle, mapModes, hasAiSummary, cleanText, publisherOf, normTitle, isBreaking, timeAgo, spokenAge, cardLabel } from '../content';
import { factBadge } from '../factLabel';
import { CATEGORY_NAMES, UNCLASSIFIED } from '../categories';
import { article } from './helpers';

describe('cleanText', () => {
  it('strips tags and decodes the entities RSS actually ships', () => {
    expect(cleanText('<p>Modi &amp; Shah&rsquo;s visit</p>')).toBe('Modi & Shah’s visit');
    expect(cleanText('a&nbsp;b')).toBe('a b');
  });

  it('is safe on empty input', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });
});

describe('publisherOf', () => {
  it('maps RSS feed names to publishers', () => {
    expect(publisherOf('LiveMint Top News')).toBe('Mint');
    expect(publisherOf('Times of India - India')).toBe('Times of India');
  });

  it('passes an unrecognised feed through rather than inventing one', () => {
    expect(publisherOf('Some Local Paper')).toBe('Some Local Paper');
    expect(publisherOf(null)).toBe('Daily Mattr');
  });
});

describe('normTitle', () => {
  it('collapses syndicated duplicates to the same key', () => {
    expect(normTitle('PM Modi pays tribute to Kargil heroes!')).toBe(
      normTitle('PM  Modi   pays tribute to Kargil heroes'),
    );
  });
});

describe('mapModes', () => {
  it('returns null when the summariser has not run', () => {
    expect(mapModes(null)).toBeNull();
    expect(mapModes({})).toBeNull();
    expect(mapModes('nonsense')).toBeNull();
  });

  it('reads the snake_case column names', () => {
    const m = mapModes({ tldr: ['One'], key_numbers: ['₹1 crore'], deep_dive: 'Long text', eli5: null });
    expect(m!.tldr).toEqual(['One']);
    expect(m!.keyNumbers).toEqual(['₹1 crore']);
    expect(m!.deepDive).toBe('Long text');
  });

  it('drops empty arrays and blank strings', () => {
    expect(mapModes({ tldr: [], eli5: '   ' })).toBeNull();
  });
});

/* The distinction the article page's summary card now hangs off. `summary` is
   populated for every row (the publisher's own blurb unless an editor replaced
   it); `versions` is populated for roughly one row in eight. Labelling all of
   them "AI Summary" credited an AI that never read them. */
describe('hasAiSummary', () => {
  it('is false when versions is absent, however good the summary is', () => {
    expect(hasAiSummary(article({ summary: 'A perfectly good publisher summary.', modes: null }))).toBe(false);
  });

  it('is true only when the summariser produced something', () => {
    expect(hasAiSummary(article({ modes: mapModes({ tldr: ['One'] }) }))).toBe(true);
  });
});

describe('mapArticle', () => {
  it('prefers the edited fields over the raw ones', () => {
    const a = mapArticle({ id: '1', title: 'Raw', edited_title: 'Edited', summary: 'Raw s', edited_summary: 'Edited s', topic: 'India', url: 'u', scraped_at: '2026-07-26T00:00:00Z' });
    expect(a.title).toBe('Edited');
    expect(a.summary).toBe('Edited s');
  });

  /* A pipeline row arrives under the scraper's taxonomy and has to leave under
     the desk's — see lib/categories. Done here, at the mapping boundary, so
     nothing downstream ever sees a category an editor could not have chosen. */
  const topicOf = (topic: string) =>
    mapArticle({ id: '1', title: 't', summary: 's', topic, url: 'u', scraped_at: '2026-07-26T00:00:00Z' }).topic;

  it('keeps a topic that is already one of the desk\'s categories', () => {
    expect(topicOf('India')).toBe('India');
    expect(topicOf('Sports')).toBe('Sports');
  });

  it('folds both of the pipeline\'s technology topics into one category', () => {
    expect(topicOf('Technology')).toBe('Technology');
    expect(topicOf('Tech & AI')).toBe('Technology');
  });

  it('files the pipeline\'s business-page topics under Business', () => {
    for (const t of ['Automobile', 'Real Estate', 'Markets & Startups', 'Corporate Case']) {
      expect(topicOf(t)).toBe('Business');
    }
  });

  it('files health with science, as a newsroom would', () => {
    expect(topicOf('Health & Wellness')).toBe('Science');
  });

  /* "Explained" is a format, not a subject, and there is no category for it.
     It must not become a browsable heading nobody chose — the dial only ever
     offers the eight. */
  it('leaves a story with no real category unclassified', () => {
    expect(topicOf('Explained')).toBe(UNCLASSIFIED);
    expect(topicOf('')).toBe(UNCLASSIFIED);
    expect(topicOf('Something Invented')).toBe(UNCLASSIFIED);
  });

  it('never produces a category outside the desk\'s list, plus unclassified', () => {
    const allowed = new Set([...CATEGORY_NAMES, UNCLASSIFIED]);
    const pipelineTopics = ['Politics', 'India', 'Business', 'World', 'Automobile', 'Tech & AI',
      'Real Estate', 'Sports', 'Health & Wellness', 'Markets & Startups', 'Science', 'Technology',
      'Explained', 'Corporate Case'];
    for (const t of pipelineTopics) expect(allowed.has(topicOf(t))).toBe(true);
  });

  it('publishes at reviewed_at when present, scraped_at otherwise', () => {
    const base = { id: '1', title: 't', summary: 's', topic: 'India', url: 'u', scraped_at: '2026-07-01T00:00:00Z' };
    expect(mapArticle(base).publishedAt).toBe('2026-07-01T00:00:00Z');
    expect(mapArticle({ ...base, reviewed_at: '2026-07-26T00:00:00Z' }).publishedAt).toBe('2026-07-26T00:00:00Z');
  });

  it('never reports a zero-minute read', () => {
    expect(mapArticle({ id: '1', title: 't', summary: 'x', topic: 'India', url: 'u', scraped_at: '2026-07-26T00:00:00Z' }).readMins).toBeGreaterThanOrEqual(1);
  });
});

describe('isBreaking', () => {
  const now = Date.now();
  it('needs both high prominence and recency', () => {
    expect(isBreaking(article({ prominence: 9, publishedAt: new Date(now - 60_000).toISOString() }))).toBe(true);
    expect(isBreaking(article({ prominence: 9, publishedAt: new Date(now - 8 * 3600_000).toISOString() }))).toBe(false);
    expect(isBreaking(article({ prominence: 3, publishedAt: new Date(now - 60_000).toISOString() }))).toBe(false);
  });
});

describe('timeAgo', () => {
  it('reads as a person would say it', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 30_000).toISOString())).toBe('now');
    expect(timeAgo(new Date(now - 20 * 60_000).toISOString())).toBe('20m ago');
    expect(timeAgo(new Date(now - 5 * 3600_000).toISOString())).toBe('5h ago');
    expect(timeAgo(new Date(now - 3 * 86400_000).toISOString())).toBe('3d ago');
  });
});

/* TalkBack pronounces "20m ago" as "twenty m ago". Every abbreviation in the
   visual label has to be spelled out for the spoken one. */
describe('spokenAge', () => {
  const at = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('expands every abbreviation timeAgo produces', () => {
    expect(spokenAge(at(30_000))).toBe('just now');
    expect(spokenAge(at(20 * 60_000))).toBe('20 minutes ago');
    expect(spokenAge(at(5 * 3600_000))).toBe('5 hours ago');
    expect(spokenAge(at(3 * 86400_000))).toBe('3 days ago');
  });

  it('gets the singular right', () => {
    expect(spokenAge(at(61_000))).toBe('1 minute ago');
    expect(spokenAge(at(3600_000 + 60_000))).toBe('1 hour ago');
    expect(spokenAge(at(86400_000 + 60_000))).toBe('1 day ago');
  });

  it('never leaks a bare abbreviation for an older date', () => {
    // past a week timeAgo switches to a formatted date
    expect(spokenAge(at(30 * 86400_000))).toMatch(/^published /);
  });
});

describe('cardLabel', () => {
  it('reads the headline first, then the context', () => {
    const a = article({ title: 'Minister resigns', topic: 'Politics', readMins: 4, publishedAt: new Date(Date.now() - 2 * 3600_000).toISOString() });
    expect(cardLabel(a)).toBe('Minister resigns. Politics, 2 hours ago, 4 minute read.');
  });
});

/* Measured over 1000 published rows: verified 890, mostly-factual 82,
   mixed 16, unverified 12. The article page used to render one blue shield for
   all four, so an unverified story carried the same reassurance as a verified
   one. */
describe('factBadge', () => {
  it('distinguishes every verdict the column actually holds', () => {
    const seen = ['verified', 'mostly-factual', 'mixed', 'unverified'].map((v) => factBadge(v)!);
    expect(seen.every(Boolean)).toBe(true);
    expect(new Set(seen.map((b) => b.tone)).size).toBe(4);
    expect(new Set(seen.map((b) => b.label)).size).toBe(4);
  });

  it('marks unverified as unknown rather than good', () => {
    expect(factBadge('unverified')!.tone).toBe('unknown');
    expect(factBadge('verified')!.tone).toBe('good');
  });

  it('is case and whitespace tolerant', () => {
    expect(factBadge('  Verified ')!.label).toBe('Verified');
  });

  it('shows nothing for a verdict it does not recognise', () => {
    expect(factBadge('something-new')).toBeNull();
    expect(factBadge(null)).toBeNull();
    expect(factBadge('')).toBeNull();
  });
});
