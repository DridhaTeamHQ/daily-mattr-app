/* Splits a headline into runs so the renderer can mark the parts that carry the
   news — figures, money, dates, and named things. Entirely local: no model call,
   no extra column, works on every article already in the table. */

export type Run = { text: string; hit: boolean };

// Words that are capitalised for grammar rather than because they name something.
const STOP = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'Of', 'For', 'To', 'And', 'But', 'Or', 'With',
  'After', 'Before', 'As', 'By', 'From', 'Is', 'Are', 'Was', 'Were', 'Will', 'Be',
  'How', 'Why', 'What', 'When', 'Where', 'Who', 'This', 'That', 'These', 'Those',
  'New', 'Says', 'Said', 'Over', 'Under', 'Amid', 'Its', 'His', 'Her', 'Their',
  'More', 'Most', 'Now', 'May', 'Can', 'Could', 'Would', 'Should', 'Not', 'No',
]);

const NUMERIC = /^[₹$€£]?\d[\d,.]*(%|bn|mn|cr|k|m|b)?\+?$/i;
const ACRONYM = /^[A-Z][A-Z0-9&.-]{1,}$/; // ISRO, CBF, NEET-UG, BCCI
const PROPER = /^[A-Z][a-z’']/; // Brazil, Wangchuk
const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

const isSpace = (s: string) => /^\s+$/.test(s);

// strip leading/trailing punctuation but keep currency marks and % signs
const core = (raw: string) => raw.replace(/^[^\w₹$€£]+/, '').replace(/[^\w%+]+$/, '');

function isHit(raw: string, wordIndex: number): boolean {
  const w = core(raw);
  if (!w) return false;
  if (NUMERIC.test(w)) return true;
  if (MONTH.test(w) && w.length <= 9) return true;
  // A capitalised first word is just the start of a sentence, not a name.
  if (wordIndex === 0) return false;
  if (STOP.has(w)) return false;
  if (ACRONYM.test(w)) return true;
  if (w.length < 3) return false;
  return PROPER.test(w);
}

export type EntityKind = 'numeric' | 'acronym' | 'proper';
export type Entity = { text: string; raw: string; kind: EntityKind; index: number };

/* The classifier above, exposed as tokens rather than render runs.

   The quiz generator needs to know *what kind* of thing each token is —
   masking a proper noun and offering three other proper nouns is a question,
   while mixing a name with two numbers and an acronym is a giveaway. Sharing
   this with highlightRuns keeps one definition of "interesting word" in the
   app instead of two that drift. */
export function entitiesOf(title: string): Entity[] {
  const parts = title.split(/\s+/).filter(Boolean);
  const out: Entity[] = [];
  parts.forEach((raw, i) => {
    const w = core(raw);
    if (!w) return;
    // A capitalised first word is just the start of a sentence, not a name.
    if (i === 0 || STOP.has(w)) return;
    let kind: EntityKind | null = null;
    if (NUMERIC.test(w)) kind = 'numeric';
    else if (ACRONYM.test(w)) kind = 'acronym';
    else if (w.length >= 4 && PROPER.test(w)) kind = 'proper';
    if (kind) out.push({ text: w, raw, kind, index: i });
  });
  return out;
}

export function highlightRuns(title: string): Run[] {
  const parts = title.split(/(\s+)/).filter((p) => p !== '');

  let wordIndex = -1;
  let words = 0;
  const flags: (boolean | null)[] = parts.map((p) => {
    if (isSpace(p)) return null;
    wordIndex++;
    words++;
    return isHit(p, wordIndex);
  });

  // A headline that is half-highlighted emphasises nothing. Past that, keep only
  // the hardest signals — figures and acronyms.
  const hits = flags.filter(Boolean).length;
  if (words > 0 && hits / words > 0.45) {
    let wi = -1;
    for (let i = 0; i < parts.length; i++) {
      if (isSpace(parts[i])) continue;
      wi++;
      const w = core(parts[i]);
      flags[i] = NUMERIC.test(w) || ACRONYM.test(w);
    }
  }

  const runs: Run[] = [];
  const push = (text: string, hit: boolean) => {
    const last = runs[runs.length - 1];
    if (last && last.hit === hit) last.text += text;
    else runs.push({ text, hit });
  };

  parts.forEach((p, i) => {
    if (isSpace(p)) {
      // the gap inside "Sonam Wangchuk" belongs to the highlight; the gap before
      // it does not
      push(p, !!flags[i - 1] && !!flags[i + 1]);
    } else {
      push(p, !!flags[i]);
    }
  });

  return runs;
}
