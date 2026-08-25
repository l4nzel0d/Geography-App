/**
 * The window size to lay out against. Native: just `useWindowDimensions`.
 *
 * There is no static render on Android or iOS, so the real size is correct from the
 * first frame and this is a plain re-export. The web build resolves
 * `useWindowSize.web.ts`, where the first render has to agree with HTML produced in
 * Node - see that file for why that is not optional.
 */
import { useWindowDimensions } from 'react-native';

import type { WindowSize } from './infoSheetLayout';

export function useWindowSize(): WindowSize {
  return useWindowDimensions();
}
