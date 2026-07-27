import { entitiesOf, type Entity, type EntityKind } from './highlight';
import type { Article } from './content';

/* Question generation, entirely client-side.

   Supabase is read-only, so there is no edge function and no LLM in this path
   — every question is derived from data already in the row. That caps what we
   can ask: who / what / how many, never why. Framed honestly in the UI as
   "did that stick?", it is retrieval practice, which works even when the
   questions are easy.

   The first prototype of this failed in an instructive way and the rules below
   are the fixes. Distractors were drawn from a topic-wide pool that included
   the article being asked about, so options appeared *inside the question*:

     "Maharashtra TET paper leak: Mastermind _____ Gupta arrested in Bihar"
      options: Bijendra / Mastermind / Bihar / Manhunt

   Two of those are visible in the stem and eliminable without knowing
   anything. Hence: distractors come only from other articles, nothing
   occurring in the stem may be offered, and the answer must also appear in the
   article's key points so it is central to the story rather than incidental. */

export type QuizKind = 'entity' | 'number';

export type Question = {
  qid: string;
  articleId: string;
  topic: string;
  kind: QuizKind;
  /** the headline with the answer replaced by a blank */
  prompt: string;
  options: string[];
  answerIndex: number;
  /** shown after answering */
  answerTitle: string;
  /** one line of context revealed once the answer is in — this is what turns
      the quiz from a test into something that teaches */
  because: string | null;
};

const BLANK = '_____';
const MIN_OPTIONS = 4;

const strip = (s: string) => s.replace(/[’']s$/i, '').replace(/[^\w%₹$€£.-]/g, '');
const fold = (s: string) => strip(s).toLowerCase();

/** every content word in a string, for leak detection */
function tokensOf(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/[a-z0-9₹%.-]{3,}/g) ?? []).map((t) => t.replace(/[.]+$/, '')),
  );
}

function maskAt(title: string, e: Entity): string {
  const parts = title.split(/\s+/);
  // keep any trailing punctuation attached to the word, so the blank doesn't
  // swallow the colon that separates a dateline from the headline
  parts[e.index] = parts[e.index].replace(e.text, BLANK);
  return parts.join(' ');
}

export type Candidate = { text: string; kind: EntityKind; articleId: string };

/** Entities from every article except `selfId`, for distractor sourcing. */
export function candidatePool(pool: Article[], selfId: string, topic: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const a of pool) {
    if (!a?.id || a.id === selfId || a.topic !== topic) continue;
    for (const e of entitiesOf(a.title ?? '')) {
      const k = fold(e.text);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ text: strip(e.text), kind: e.kind, articleId: a.id });
    }
  }
  return out;
}

/* Distractors must be parallel in construction and drawn from the same domain
   — that is the whole difference between a question and a guessable one. Same
   entity class, comparable length, never present in the stem. */
export function pickDistractors(
  answer: string,
  stem: string,
  pool: Candidate[],
  kind: EntityKind,
  n: number,
): string[] | null {
  // Substring, not token equality. Token equality let morphological variants
  // through — "Protest" offered while "Protests" sits in the headline, "Force"
  // against "forced", "AI" against "AI-nanotech". Each of those is visibly
  // odd next to the question and narrows the choice without knowing anything.
  const stemFolded = stem.toLowerCase();
  const answerFold = fold(answer);
  const picked: string[] = [];
  const used = new Set<string>([answerFold]);

  const ranked = pool
    .filter((c) => c.kind === kind)
    .filter((c) => strip(c.text).length >= 3)
    .filter((c) => Math.abs(c.text.length - answer.length) <= 6)
    .sort(
      (a, b) =>
        Math.abs(a.text.length - answer.length) - Math.abs(b.text.length - answer.length),
    );

  for (const c of ranked) {
    if (picked.length >= n) break;
    const f = fold(c.text);
    if (!f || used.has(f)) continue;
    // never offer anything the reader can already see in the question
    if (stemFolded.includes(f)) continue;
    // and never one that contains, or is contained by, the answer
    if (f.includes(answerFold) || answerFold.includes(f)) continue;
    used.add(f);
    picked.push(c.text);
  }

  return picked.length >= n ? picked : null;
}

/** deterministic shuffle so the answer doesn't move between renders */
function shuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildQuestion(a: Article, pool: Article[]): Question | null {
  const title = a.title ?? '';
  if (title.length < 25) return null;

  const ents = entitiesOf(title);
  if (!ents.length) return null;

  // Prefer an entity that also shows up in the key points: that means it is
  // central to the story, not an incidental capitalised word. Without this the
  // generator produced grammar exercises — "Education _____ Joshi's Journey".
  const body = [...(a.modes?.tldr ?? []), ...(a.modes?.keyNumbers ?? [])].join(' ');
  const bodyTokens = tokensOf(body);
  const central = ents.filter((e) => bodyTokens.has(fold(e.text)));
  const ranked = (central.length ? central : ents).filter((e) => strip(e.text).length >= 3);
  if (!ranked.length) return null;

  const cands = candidatePool(pool, a.id, a.topic);

  for (const e of ranked) {
    const answer = strip(e.text);
    const stem = maskAt(title, e);
    if (stem === title) continue;
    // an answer that appears a second time in the headline is not blanked out
    if (tokensOf(stem).has(fold(answer))) continue;
    // a stem that is mostly blank is a coin flip, not a question
    if (BLANK.length / stem.length > 0.4) continue;

    const distractors = pickDistractors(answer, stem, cands, e.kind, MIN_OPTIONS - 1);
    if (!distractors) continue;

    const options = shuffle([answer, ...distractors], a.id + e.index);
    const answerIndex = options.findIndex((o) => fold(o) === fold(answer));
    if (answerIndex < 0) continue;
    if (new Set(options.map(fold)).size !== options.length) continue;

    return {
      qid: `${a.id}:${e.index}`,
      articleId: a.id,
      topic: a.topic,
      kind: e.kind === 'numeric' ? 'number' : 'entity',
      prompt: stem,
      options,
      answerIndex,
      answerTitle: title,
      // the key point that mentions the answer, so the explanation is about
      // the thing that was actually asked rather than the story in general
      because:
        (a.modes?.tldr ?? []).find((b) => fold(b).includes(fold(answer))) ??
        a.modes?.tldr?.[0] ??
        null,
    };
  }
  return null;
}

/** One question per article, so a five-question quiz spans five stories. */
export function buildQuiz(read: Article[], pool: Article[], count = 5): Question[] {
  const out: Question[] = [];
  const seenTopic: Record<string, number> = {};
  for (const a of read) {
    if (out.length >= count) break;
    // don't let one busy topic own the whole quiz
    if ((seenTopic[a.topic] ?? 0) >= 2) continue;
    const q = buildQuestion(a, pool);
    if (!q) continue;
    seenTopic[a.topic] = (seenTopic[a.topic] ?? 0) + 1;
    out.push(q);
  }
  // Fewer than three and it isn't a quiz — the caller must not offer one
  // rather than pad it with questions we already know are weak.
  return out.length >= 3 ? out : [];
}
