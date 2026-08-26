import {
  PRACTICE_FLOOR,
  PRACTICE_ROUND_SIZE,
  pickWeakSpots,
  practiceWeight,
} from '@/quiz/practicePool';
import { practiceScores } from '@/mastery/masteryScore';
import { makeRng } from '@/quiz/quizBuilder';
import { countriesIn, QUIZ_COUNTRIES, type QuizCountry } from '@/quiz/quizCountries';

const pool = (isos: string[]): QuizCountry[] =>
  isos.map((iso3) => QUIZ_COUNTRIES.find((c) => c.iso3 === iso3) as QuizCountry);

describe('practiceWeight', () => {
  it('weighs a never-asked country exactly like one always answered wrong', () => {
    // The whole reason practice works on a fresh install: unseen IS maximally weak.
    expect(practiceWeight(undefined)).toBe(practiceWeight(0));
  });

  it('falls as mastery rises, but never to zero', () => {
    const weights = [0, 0.25, 0.5, 0.75, 1].map(practiceWeight);

    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }

    // Nothing is ever excluded, which is what makes consecutive rounds differ and what
    // lets a fully-mastered pool still produce a full round.
    expect(weights[weights.length - 1]).toBe(PRACTICE_FLOOR);
    expect(PRACTICE_FLOOR).toBeGreaterThan(0);
  });

  it('spreads weak against well-known by roughly 7 to 1', () => {
    expect(practiceWeight(0) / practiceWeight(0.9)).toBeGreaterThan(5);
    expect(practiceWeight(0) / practiceWeight(0.9)).toBeLessThan(10);
  });

  it('treats a nonsense score as maximally weak rather than propagating it', () => {
    expect(practiceWeight(NaN)).toBe(practiceWeight(0));
    expect(practiceWeight(Infinity)).toBe(practiceWeight(0));
  });
});

describe('pickWeakSpots', () => {
  it('is deterministic for a given seed, and pinned', () => {
    const picked = pickWeakSpots(QUIZ_COUNTRIES, {}, 5, makeRng(12345)).map((c) => c.iso3);

    expect(picked).toEqual(pickWeakSpots(QUIZ_COUNTRIES, {}, 5, makeRng(12345)).map((c) => c.iso3));
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
  });

  it('never repeats a country', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const picked = pickWeakSpots(QUIZ_COUNTRIES, {}, PRACTICE_ROUND_SIZE, makeRng(seed));
      expect(new Set(picked.map((c) => c.iso3)).size).toBe(picked.length);
    }
  });

  it('returns min(count, pool) so a small subregion is not padded', () => {
    const anz = countriesIn(['Australia and New Zealand']);
    expect(anz.length).toBeLessThan(PRACTICE_ROUND_SIZE);

    const picked = pickWeakSpots(anz, {}, PRACTICE_ROUND_SIZE, makeRng(1));
    expect(picked).toHaveLength(anz.length);
  });

  it('terminates and returns everything when count exceeds the pool', () => {
    const three = pool(['FRA', 'DEU', 'ITA']);
    const picked = pickWeakSpots(three, {}, 99, makeRng(7));

    expect(picked).toHaveLength(3);
    expect(picked.map((c) => c.iso3).sort()).toEqual(['DEU', 'FRA', 'ITA']);
  });

  it('returns an empty round for an empty pool', () => {
    expect(pickWeakSpots([], {}, PRACTICE_ROUND_SIZE, makeRng(1))).toEqual([]);
  });

  it('picks a weak country far more often than a well-known one', () => {
    // A band, not a number: this is a distribution, and pinning an exact count would
    // break on any change to the RNG rather than to the weighting.
    const two = pool(['FRA', 'DEU']);
    const scores = { FRA: 0, DEU: 0.95 };

    let weak = 0;
    const rounds = 1000;
    for (let seed = 0; seed < rounds; seed += 1) {
      if (pickWeakSpots(two, scores, 1, makeRng(seed))[0].iso3 === 'FRA') weak += 1;
    }

    expect(weak / rounds).toBeGreaterThan(0.75);
    expect(weak / rounds).toBeLessThan(0.98);
  });

  it('still sometimes picks a fully mastered country, so rounds differ', () => {
    const two = pool(['FRA', 'DEU']);
    const scores = { FRA: 0, DEU: 1 };

    const seen = new Set<string>();
    for (let seed = 0; seed < 500; seed += 1) {
      seen.add(pickWeakSpots(two, scores, 1, makeRng(seed))[0].iso3);
    }

    expect(seen).toEqual(new Set(['FRA', 'DEU']));
  });

  it('gives a fully mastered pool a full round anyway', () => {
    const scores = Object.fromEntries(QUIZ_COUNTRIES.map((c) => [c.iso3, 1]));
    const picked = pickWeakSpots(QUIZ_COUNTRIES, scores, PRACTICE_ROUND_SIZE, makeRng(3));

    expect(picked).toHaveLength(PRACTICE_ROUND_SIZE);
  });

  it('still revisits a country proven once, far more than one proven nine times', () => {
    // The assertion that proves the prior earns its keep where it MOVED to. Both of these
    // are 100% on the map - `masteryOf` carries no prior - so feeding the display scores
    // in here would make them equally retired, and one lucky guess would be enough to
    // stop a country ever coming back.
    const two = pool(['FRA', 'DEU']);
    const scores = practiceScores({
      FRA: { name: { asked: 1, correct: 1, lastCorrect: true } },
      DEU: { name: { asked: 9, correct: 9, lastCorrect: true } },
    });

    let thin = 0;
    const rounds = 1000;
    for (let seed = 0; seed < rounds; seed += 1) {
      if (pickWeakSpots(two, scores, 1, makeRng(seed))[0].iso3 === 'FRA') thin += 1;
    }

    // Roughly 0.40 against 0.16 of weight - a clear majority, but not a certainty.
    expect(thin / rounds).toBeGreaterThan(0.6);
    expect(thin / rounds).toBeLessThan(0.9);
  });

  it('only ever returns countries from the pool it was given', () => {
    const europe = countriesIn(['Western Europe']);
    const allowed = new Set(europe.map((c) => c.iso3));

    const picked = pickWeakSpots(europe, {}, PRACTICE_ROUND_SIZE, makeRng(11));
    picked.forEach((country) => expect(allowed.has(country.iso3)).toBe(true));
  });
});
