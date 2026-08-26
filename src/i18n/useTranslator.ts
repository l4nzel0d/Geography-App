import { useEffect, useState } from 'react';

import { getLocale, subscribeToLocale } from './locale';
import { translatorFor, type Translator } from './t';

/**
 * The translator for the language the app is currently in.
 *
 * ## Why this exists rather than a bare `t(key)` import
 *
 * `app.json` sets `reactCompiler: true`, and the compiler memoises anything whose inputs
 * it can see are unchanged. A module-level `t('quiz.open.label')` takes a constant and
 * reads a singleton the compiler knows nothing about - so it has **no reactive inputs at
 * all**, and the compiler is entitled to compute it once and reuse the result forever.
 *
 * It does. The symptom, found on a device: switching language left the map's pills saying
 * "Flat", "Labels" and "Quiz" until something *else* forced a re-render - tapping a pill
 * changed `fillMode`, invalidated that memo, and the words snapped into Russian a moment
 * too late. A subscription in the parent screen does not help, because the child's props
 * are unchanged and the compiler skips it.
 *
 * Returning a translator makes the language a **value**. `translatorFor` is memoised per
 * locale, so the identity changes exactly when the language does, and every `t(...)` call
 * in the component depends on something the compiler can track.
 *
 * ## This is not the hook CLAUDE.md warns about
 *
 * The recorded failure was extracting `useWindowDimensions()` into a helper hook and
 * getting a **stale** value through a rotation. The lesson there was that a subscription
 * must stay somewhere the compiler can see it invalidate a render. That is exactly what
 * this hook does: it holds the state, and it returns a value derived from it. Reading the
 * singleton directly is the shape that goes stale.
 *
 * Pure modules - `exitPrompt`, `resetPrompt` - still take a `Translator` as an argument
 * and never call this. Non-component code that needs a string outside React (the label
 * builder, `formatters`) passes an explicit locale.
 */
export function useTranslator(): Translator {
  const [locale, setActiveLocale] = useState(getLocale);
  useEffect(() => subscribeToLocale(setActiveLocale), []);

  return translatorFor(locale);
}
