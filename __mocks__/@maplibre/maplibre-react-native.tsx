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

export const GeoJSONSource = ({ children, data, ...props }: AnyProps) => (
  <View testID="countries-source" {...props}>
    {children}
  </View>
);

export const Layer = ({ layout, ...props }: AnyProps) => (
  <View testID={`layer-${String(props.id)}`} {...props} />
);

export const Images = () => null;
export const Marker = () => null;
export const UserLocation = () => null;
