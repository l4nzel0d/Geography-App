import { mapColors } from '@/map/offlineStyle';

/**
 * The app's chrome colours - every surface that sits over or beside the map.
 *
 * Started life under `components/quiz/` and moved up when the search screen became the
 * third consumer outside it (`QuizLaunchButton` and now `SearchLaunchButton` are chrome
 * on the explore map, not quiz UI). The `quiz` prefix on the exports is kept because
 * renaming it churns nine files for nothing; read it as "the shared palette".
 *
 * The alternative is repeating these hexes inline in each component, which is fine for
 * three files and a liability across a dozen - there is a correct/wrong colour language
 * that has to stay consistent between the quiz panel, the map highlight and the results
 * review, and three copies of "which green" is how that drifts.
 *
 * Only the verdict colours are new; they come from `mapColors` so the country on the map
 * and the row in the panel cannot disagree about what "correct" looks like.
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
