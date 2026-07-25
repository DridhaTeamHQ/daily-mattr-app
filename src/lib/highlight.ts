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
