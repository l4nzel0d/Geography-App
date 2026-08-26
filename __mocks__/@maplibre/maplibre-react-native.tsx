import type { ReactNode } from 'react';
import { View } from 'react-native';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

export const Map = ({ children, mapStyle, ...props }: AnyProps) => (
  <View {...props}>{children}</View>
);

/**
 * Renders a real view and forwards its props, unlike the source component.
 *
 * Deliberate, and the same reasoning as `filter` and `paint` on Layer below: the camera
 * stop is computed by our own code (see `quizCamera.ts`), and a bad one - a centre in
 * the wrong hemisphere, an Infinity zoom - is completely invisible until it reaches the
 * native renderer, where it blanks the map. Forwarding the props is what lets a test see
 * the numbers at all.
 *
 * The `ref` is swallowed rather than implemented: nothing uses the imperative CameraRef,
 * because it throws when the native view is not ready yet - which is exactly the state
 * on the first question of a quiz.
 */
export const Camera = ({ ref, children, ...props }: AnyProps & { ref?: unknown }) => (
  <View testID="map-camera" {...props} />
);

/**
 * One testID per source, derived from `id` like `Layer`'s is.
 *
 * It used to hardcode `countries-source`, which was fine while there was exactly one
 * source. There are two now - the outlines and the label anchors - and a fixed testID
 * made every `getByTestId` throw "found multiple elements", including the press helpers
 * that have nothing to do with labels.
 */
export const GeoJSONSource = ({ children, data, ...props }: AnyProps) => (
  <View testID={`source-${String(props.id)}`} {...props}>
    {children}
  </View>
);

/**
 * Forwards `layout` as well as `paint` and `filter`.
 *
 * It used to strip `layout`, exactly as it once stripped `paint` - and the consequence is
 * the same one CLAUDE.md already records for that: a symbol layer's `text-field`,
 * `text-size` and `symbol-sort-key` all live in `layout`, so no test could see the label
 * expressions at all. A malformed one passes every unit test and then blanks the layer
 * inside the native renderer, which is the one place Jest replaces with a stub.
 */
export const Layer = (props: AnyProps) => (
  <View testID={`layer-${String(props.id)}`} {...props} />
);

/**
 * Renders a real view and forwards `images`, unlike the `() => null` this used to be.
 *
 * The same blind spot `layout` and `paint` each had before: a symbol layer whose
 * `icon-image` names an image that nothing ever registered draws nothing on a device and
 * logs a single line - `FLog.e("Failed to load bitmap from: ...")` on Android - with no
 * exception anywhere. Off a device this is the only way to see that the registration
 * happened at all, which is what `MapScreen.test.tsx` asserts about the flag latch.
 *
 * The testID comes from the prop rather than being hardcoded, for the reason
 * `GeoJSONSource`'s is derived from `id`: a fixed one is fine until there are two.
 */
export const Images = ({ testID, ...props }: AnyProps & { testID?: string }) => (
  <View testID={testID ?? 'map-images'} {...props} />
);
export const Marker = () => null;
export const UserLocation = () => null;
