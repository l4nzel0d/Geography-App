/**
 * The web quiz screen box, and the one thing it exists to prevent: a phone held upright
 * being read as landscape because the on-screen keyboard made the viewport wider than it
 * is tall. Measured on a 1080x2340 device, where a round with the keyboard up leaves the
 * layout viewport 1080x1055 and the answer panel docked itself to the right edge.
 *
 * Imported by its `.web` path on purpose: Jest runs this suite as iOS, so plain
 * `@/quiz/quizScreenBox` resolves the native sibling that reports `Dimensions.get`.
 *
 * The module keeps a memory of the tallest each width has been, so every case reloads it.
 */
import { getInfoSheetLayout } from '@/components/infoSheetLayout';
import type { ScreenBox } from '@/quiz/quizScreenBox';

type BoxFn = (window: ScreenBox) => ScreenBox;

const load = (): BoxFn => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/quiz/quizScreenBox.web') as { quizScreenBox: BoxFn }).quizScreenBox;
};

/** Stand in for a focused `<input>` - RN Web's TextInput renders a real one. */
const focus = (tagName: string | null) => {
  (globalThis as { document?: unknown }).document =
    tagName === null ? { activeElement: null } : { activeElement: { tagName } };
};

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('quizScreenBox (web)', () => {
  it('reports the window it is given', () => {
    const quizScreenBox = load();
    focus(null);

    expect(quizScreenBox({ width: 393, height: 764 })).toEqual({ width: 393, height: 764 });
  });

  it('keeps the unobstructed height while a text field has focus', () => {
    const quizScreenBox = load();
    focus(null);
    quizScreenBox({ width: 393, height: 764 });

    focus('INPUT');
    expect(quizScreenBox({ width: 393, height: 384 })).toEqual({ width: 393, height: 764 });
  });

  it('keeps a portrait phone portrait with the keyboard up', () => {
    const quizScreenBox = load();
    focus(null);
    quizScreenBox({ width: 1080, height: 2100 });

    focus('INPUT');
    // The measured viewport: wider than it is tall, and landscape to anything reading it.
    expect(getInfoSheetLayout({ width: 1080, height: 1055 }).landscape).toBe(true);
    expect(getInfoSheetLayout(quizScreenBox({ width: 1080, height: 1055 })).landscape).toBe(false);
  });

  it('believes a window that shortens with nothing focused', () => {
    const quizScreenBox = load();
    focus(null);
    quizScreenBox({ width: 1200, height: 900 });

    expect(quizScreenBox({ width: 1200, height: 600 })).toEqual({ width: 1200, height: 600 });
  });

  it('believes a shorter window when the focus is not a text field', () => {
    const quizScreenBox = load();
    focus(null);
    quizScreenBox({ width: 393, height: 764 });

    focus('BUTTON');
    expect(quizScreenBox({ width: 393, height: 600 })).toEqual({ width: 393, height: 600 });
  });

  it('takes the real height back when the keyboard closes', () => {
    const quizScreenBox = load();
    focus(null);
    quizScreenBox({ width: 393, height: 764 });
    focus('INPUT');
    quizScreenBox({ width: 393, height: 384 });

    focus(null);
    expect(quizScreenBox({ width: 393, height: 700 })).toEqual({ width: 393, height: 700 });
  });

  it('forgets the memory when the width changes', () => {
    const quizScreenBox = load();
    focus(null);
    quizScreenBox({ width: 393, height: 764 });

    // A rotation is a new width, so the tall portrait height must not be carried over.
    focus('INPUT');
    expect(quizScreenBox({ width: 764, height: 393 })).toEqual({ width: 764, height: 393 });
  });

  it('returns the same object while the keyboard is up, so nothing re-fires downstream', () => {
    const quizScreenBox = load();
    focus(null);
    const before = quizScreenBox({ width: 393, height: 764 });

    focus('INPUT');
    expect(quizScreenBox({ width: 393, height: 384 })).toBe(before);
    expect(quizScreenBox({ width: 393, height: 380 })).toBe(before);
  });
});
