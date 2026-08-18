import { mapColors } from '@/map/offlineStyle';

/**
 * The quiz screens' colours.
 *
 * The rest of the app repeats these hexes inline in each component, which is fine for
 * three files and would be a liability across the nine here - the quiz has a
 * correct/wrong colour language that has to stay consistent between the panel, the map
 * highlight and the results review, and three copies of "which green" is how that drifts.
 *
 * The values are the existing chrome palette; only the verdict colours are new, and they
 * come from `mapColors` so the country on the map and the row in the panel cannot
 * disagree about what "correct" looks like.
 */
export const quizColors = {
  /** Card and panel surfaces. Opaque - translucency over the map surface did not paint. */
  surface: '#12263a',
  /** One step up, for rows inside a panel. */
  surfaceRaised: '#183149',
  border: '#2c4a63',
  text: '#f6f7f2',
  textMuted: '#8fa9bd',
  textFaint: '#6d879b',
  /** Text on a light/filled control. */
  textInverted: '#12263a',
  accent: mapColors.quizTarget,
  correct: mapColors.quizCorrect,
  wrong: mapColors.quizWrong,
  /** Input backgrounds, a shade darker than the panel so the field edge reads. */
  field: '#0e1e2e',
} as const;

export const quizRadii = {
  pill: 999,
  card: 12,
  panel: 20,
  field: 10,
} as const;
