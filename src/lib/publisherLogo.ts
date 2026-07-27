/* Publisher marks, bundled rather than fetched.

   Keyed on the article's own URL host, not on `source` or the display name.
   `source` is an RSS feed label and there are 60-odd of them — "IE Political
   Pulse", "Indian Express Explained", "Indian Express Business" are all one
   masthead — whereas the host is the masthead's actual identity and never
   drifts. Anchored suffixes so subdomains fall through to the parent: every
   auto./realty./health.economictimes host is still the Economic Times.

   Order matters. timesofindia.indiatimes.com and economictimes.indiatimes.com
   are different papers sharing a parent domain, so both are matched in full
   before anything shorter could catch them. */

const MARKS: [RegExp, number][] = [
  [/(^|\.)timesofindia\.indiatimes\.com$/, require('@/assets/publishers/times-of-india.png')],
  [/(^|\.)economictimes\.indiatimes\.com$/, require('@/assets/publishers/economic-times.png')],
  [/(^|\.)livemint\.com$/, require('@/assets/publishers/mint.png')],
  [/(^|\.)thehindubusinessline\.com$/, require('@/assets/publishers/businessline.png')],
  [/(^|\.)thehindu\.com$/, require('@/assets/publishers/the-hindu.png')],
  [/(^|\.)indianexpress\.com$/, require('@/assets/publishers/indian-express.png')],
  [/(^|\.)hindustantimes\.com$/, require('@/assets/publishers/hindustan-times.png')],
  [/(^|\.)ndtv\.com$/, require('@/assets/publishers/ndtv.png')],
  [/(^|\.)deccanherald\.com$/, require('@/assets/publishers/deccan-herald.png')],
  [/(^|\.)autocarindia\.com$/, require('@/assets/publishers/autocar-india.png')],
  [/(^|\.)gaadiwaadi\.com$/, require('@/assets/publishers/gaadiwaadi.png')],
  [/(^|\.)rushlane\.com$/, require('@/assets/publishers/rushlane.png')],
  [/(^|\.)inc42\.com$/, require('@/assets/publishers/inc42.png')],
  [/(^|\.)techcrunch\.com$/, require('@/assets/publishers/techcrunch.png')],
  [/(^|\.)theverge\.com$/, require('@/assets/publishers/the-verge.png')],
  [/(^|\.)theguardian\.com$/, require('@/assets/publishers/the-guardian.png')],
  [/(^|\.)sciencedaily\.com$/, require('@/assets/publishers/sciencedaily.png')],
  [/(^|\.)medianama\.com$/, require('@/assets/publishers/medianama.png')],
  [/(^|\.)arstechnica\.com$/, require('@/assets/publishers/ars-technica.png')],
  [/(^|\.)abplive\.com$/, require('@/assets/publishers/abp-live.png')],
  [/(^|\.)yourstory\.com$/, require('@/assets/publishers/yourstory.png')],
  [/(^|\.)moneycontrol\.com$/, require('@/assets/publishers/moneycontrol.png')],
  [/(^|\.)business-standard\.com$/, require('@/assets/publishers/business-standard.png')],
  [/(^|\.)reuters\.com$/, require('@/assets/publishers/reuters.png')],
  [/(^|\.)bbc\.(com|co\.uk)$/, require('@/assets/publishers/bbc.png')],
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  // URL() is unhappy with the odd malformed link in the feed, and a bad row
  // should cost a wordmark, not throw inside a list row
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** bundled mark for this article's publisher, or null to fall back to the name */
export function publisherMark(url: string | null | undefined): number | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const [re, mark] of MARKS) if (re.test(host)) return mark;
  return null;
}
