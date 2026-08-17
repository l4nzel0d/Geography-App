/**
 * Manual mock for the native map module.
 *
 * MapLibre renders through Fabric native views, which cannot be instantiated in
 * Jest's environment. This stub keeps the component tree shape intact so tests can
 * assert on wiring - most importantly that a press on the country source updates
 * selection state - without rendering a real map.
 *
 * Jest picks this up automatically for the node_modules package; no jest.mock() call
 * is needed at the call site.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

export const Map = ({ children, mapStyle, ...props }: AnyProps) => (
  <View {...props}>{children}</View>
);

export const Camera = () => null;

export const GeoJSONSource = ({ children, data, ...props }: AnyProps) => (
  <View testID="countries-source" {...props}>
    {children}
  </View>
);

// `filter` and `paint` are deliberately forwarded, not stripped: the selection-highlight
// test asserts on `filter` to prove the right country is highlighted, and the choropleth
// test asserts on `paint` to prove the right fill colour is in play. Note that neither
// test can catch an *invalid* paint expression - that fails inside the native renderer,
// which is exactly what this stub replaces. See .maestro/population-choropleth.yaml.
export const Layer = ({ layout, ...props }: AnyProps) => (
  <View testID={`layer-${String(props.id)}`} {...props} />
);

export const Images = () => null;
export const Marker = () => null;
export const UserLocation = () => null;
