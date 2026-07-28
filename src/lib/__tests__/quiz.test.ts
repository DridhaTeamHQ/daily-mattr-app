import { buildQuestion, buildQuiz, pickDistractors, candidatePool } from '../quiz';
import { article } from './helpers';

const withModes = (id: string, title: string, tldr: string[], topic = 'India') =>
  article({ id, title, topic, modes: { eli5: null, tldr, keyNumbers: null } });

/* A pool of headlines in one topic, so distractors have somewhere to come
   from. Every one names a person and a place, which is what the classifier
   in lib/highlight keys off. */
const pool = [
  withModes('p1', 'Rajnath Singh warns Pakistan on Kargil anniversary', ['Rajnath Singh spoke at the event.']),
  withModes('p2', 'Nirmala Sitharaman defends the new tariff schedule', ['Nirmala Sitharaman addressed parliament.']),
  withModes('p3', 'Amit Shah reviews security arrangements in Srinagar', ['Amit Shah visited Srinagar.']),
  withModes('p4', 'Jaishankar meets counterparts ahead of the Delhi summit', ['Jaishankar met delegates.']),
  withModes('p5', 'Piyush Goyal announces the revised export incentive', ['Piyush Goyal announced the change.']),
  withModes('p6', 'Dharmendra Pradhan resigns as education minister', ['Dharmendra Pradhan stepped down.']),
];

describe('buildQuestion', () => {
  const target = withModes('t1', 'Mastermind Bijendra Gupta arrested in Bihar raid', ['Bijendra Gupta was arrested.']);

  /* The defect this generator was rewritten for. Distractors used to be drawn
     from a pool that included the article being asked about, so options
     appeared inside the question:

       "Mastermind _____ Gupta arrested in Bihar"
        options: Bijendra / Mastermind / Bihar / Manhunt

     Two of those are eliminable without knowing anything. */
  it('never offers an option that is visible in the stem', () => {
    const q = buildQuestion(target, pool);
    expect(q).not.toBeNull();
    const stem = q!.prompt.toLowerCase();
    for (const opt of q!.options) {
      if (opt === q!.options[q!.answerIndex]) continue;
      expect(stem).not.toContain(opt.toLowerCase());
    }
  });

  /* Morphological leaks were the follow-up bug: "Protest" offered while
     "Protests" sits in the headline reads as obviously wrong and narrows the
     choice for free. Substring, not token equality. */
  it('rejects distractors that contain or are contained by the answer', () => {
    const q = buildQuestion(target, pool);
    const answer = q!.options[q!.answerIndex].toLowerCase();
    for (const opt of q!.options) {
      const o = opt.toLowerCase();
      if (o === answer) continue;
      expect(o.includes(answer)).toBe(false);
      expect(answer.includes(o)).toBe(false);
    }
  });

  it('blanks the answer out of the headline', () => {
    const q = buildQuestion(target, pool);
    expect(q!.prompt).toContain('_____');
    expect(q!.prompt).not.toBe(q!.answerTitle);
  });

  it('offers four distinct options with a valid answer index', () => {
    const q = buildQuestion(target, pool);
    expect(q!.options).toHaveLength(4);
    expect(new Set(q!.options.map((o) => o.toLowerCase())).size).toBe(4);
    expect(q!.answerIndex).toBeGreaterThanOrEqual(0);
    expect(q!.answerIndex).toBeLessThan(4);
  });

  it('is deterministic — the answer must not move between renders', () => {
    const a = buildQuestion(target, pool);
    const b = buildQuestion(target, pool);
    expect(b!.options).toEqual(a!.options);
    expect(b!.answerIndex).toBe(a!.answerIndex);
  });

  it('carries an explanation so the quiz teaches rather than only tests', () => {
    expect(buildQuestion(target, pool)!.because).toBeTruthy();
  });

  it('returns null rather than a weak question', () => {
    expect(buildQuestion(article({ title: 'Short' }), pool)).toBeNull();
    expect(buildQuestion(withModes('x', 'the quick brown fox jumped over things', []), pool)).toBeNull();
    // no pool to draw distractors from
    expect(buildQuestion(target, [])).toBeNull();
  });
});

describe('candidatePool', () => {
  it('excludes the article being asked about', () => {
    const cands = candidatePool(pool, 'p1', 'India');
    expect(cands.some((c) => c.articleId === 'p1')).toBe(false);
  });

  it('stays within the topic', () => {
    const mixed = [...pool, withModes('z1', 'Someone Else scores a century in Mumbai', [], 'Sports')];
    expect(candidatePool(mixed, 'p1', 'India').every((c) => c.articleId !== 'z1')).toBe(true);
  });
});

describe('pickDistractors', () => {
  it('returns null rather than padding when it cannot find enough', () => {
    expect(pickDistractors('Bijendra', 'Mastermind _____ Gupta', [], 'proper', 3)).toBeNull();
  });

  it('matches the entity class of the answer', () => {
    const cands = candidatePool(pool, 't1', 'India');
    const got = pickDistractors('Bijendra', 'Mastermind _____ Gupta arrested', cands, 'proper', 3);
    expect(got).toHaveLength(3);
  });
});

describe('buildQuiz', () => {
  it('asks about a different article each time', () => {
    const q = buildQuiz(pool, pool, 5);
    expect(new Set(q.map((x) => x.articleId)).size).toBe(q.length);
  });

  /* Fewer than three is not a quiz. Padding it with questions we already know
     are weak is worse than not offering one at all. */
  it('returns nothing rather than a two-question quiz', () => {
    expect(buildQuiz([pool[0]], pool, 5)).toEqual([]);
  });

  it('does not let one busy topic own the whole quiz', () => {
    const q = buildQuiz(pool, pool, 5);
    const perTopic: Record<string, number> = {};
    for (const x of q) perTopic[x.topic] = (perTopic[x.topic] ?? 0) + 1;
    for (const n of Object.values(perTopic)) expect(n).toBeLessThanOrEqual(2);
  });
});
