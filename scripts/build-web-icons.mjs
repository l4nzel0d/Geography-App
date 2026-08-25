/**
 * Generates the PWA icon set into `public/icons/`.
 *
 * The web app manifest needs its own icons: Android's adaptive icon and iOS's app icon
 * are produced by `expo prebuild` from `app.json` and never reach a browser. A manifest
 * without a 192 and a 512 is not installable at all, so this is a prerequisite for the
 * install prompt rather than polish.
 *
 * Uses `@expo/image-utils`, which Expo already depends on - it falls back to jimp when
 * sharp is not installed, so this adds no dependency of its own.
 *
 * ## The maskable icon is not the same picture
 *
 * Android and some launchers crop a manifest icon to whatever shape the platform likes -
 * circle, squircle, rounded square - and `purpose: "maskable"` promises the artwork
 * survives that. A normal icon cropped to a circle loses its corners, so the maskable one
 * is built the way Android builds an adaptive icon: the **foreground** layer over the
 * brand background, sized so everything important sits inside the safe zone. Shipping the
 * plain icon as maskable is the common mistake and produces visibly clipped artwork.
 */
import { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } from '@expo/image-utils';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ICONS_DIR = join(root, 'public/icons');

/** Matches `android.adaptiveIcon.backgroundColor` in app.json, so the two agree. */
const BRAND_BACKGROUND = '#5595c1';

const SOURCE_ICON = join(root, 'assets/images/icon.png');
const SOURCE_FOREGROUND = join(root, 'assets/images/android-icon-foreground.png');

/**
 * Share of the maskable canvas the foreground occupies.
 *
 * Android's adaptive icon shows a 72dp circle out of a 108dp layer - two thirds - and the
 * maskable spec's safe zone is a more generous 80%. Using the stricter number means the
 * artwork already known to survive Android's crop also survives every browser's.
 */
const MASKABLE_CONTENT_SCALE = 2 / 3;

async function plain(size, name) {
  const { source } = await generateImageAsync(
    { projectRoot: root, cacheType: 'web-icons' },
    {
      src: SOURCE_ICON,
      name,
      width: size,
      height: size,
      resizeMode: 'cover',
      // Manifest icons are composited onto unknown backgrounds; transparency there reads
      // as a hole in the launcher, so flatten onto the brand colour.
      backgroundColor: BRAND_BACKGROUND,
      removeTransparency: true,
    },
  );
  writeFileSync(join(ICONS_DIR, name), source);
  return { name, bytes: source.length };
}

async function maskable(size, name) {
  const inner = Math.round(size * MASKABLE_CONTENT_SCALE);

  const background = await generateImageBackgroundAsync({
    width: size,
    height: size,
    backgroundColor: BRAND_BACKGROUND,
    resizeMode: 'cover',
  });

  const { source: foreground } = await generateImageAsync(
    { projectRoot: root, cacheType: 'web-icons' },
    {
      src: SOURCE_FOREGROUND,
      name,
      width: inner,
      height: inner,
      resizeMode: 'contain',
      // Keep the foreground's own transparency - it has to sit ON the background.
      backgroundColor: undefined,
    },
  );

  const offset = Math.round((size - inner) / 2);
  const composed = await compositeImagesAsync({ foreground, background, x: offset, y: offset });
  writeFileSync(join(ICONS_DIR, name), composed);
  return { name, bytes: composed.length };
}

export async function buildWebIcons() {
  mkdirSync(ICONS_DIR, { recursive: true });

  const written = [
    await plain(192, 'icon-192.png'),
    await plain(512, 'icon-512.png'),
    // iOS ignores the manifest's icons for "Add to Home Screen" and reads this instead.
    await plain(180, 'apple-touch-icon.png'),
    await maskable(512, 'icon-512-maskable.png'),
  ];

  for (const { name, bytes } of written) {
    console.log(`  public/icons/${name}  (${(bytes / 1024).toFixed(0)} KB)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Generating PWA icons into public/icons/');
  await buildWebIcons();
}
