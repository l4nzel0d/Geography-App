/**
 * Drag-to-dismiss arithmetic for the country info card.
 *
 * The card is dismissed by dragging it toward the edge it is docked to - down in
 * portrait, right in landscape. All of the decisions are here rather than in the
 * component so they can be tested without simulating touches: whether a given
 * movement should become a drag at all, how far along its axis it has travelled, and
 * whether letting go should close it or spring it back.
 */

/** Movement along the dismiss axis, in dp, before a touch counts as a drag. */
export const DRAG_ACTIVATION_DISTANCE = 8;

/** Drag past this share of the card's own size and letting go dismisses it. */
export const DISMISS_DISTANCE_FRACTION = 0.3;

/** ...or flick faster than this, in dp per ms, at any distance. */
export const DISMISS_VELOCITY = 0.5;

export type PanGesture = {
  /** Total movement since the touch started. */
  dx: number;
  dy: number;
  /** Current velocity, dp per ms. */
  vx: number;
  vy: number;
};

export type DismissDrag = {
  /** Distance toward the docked edge. Never negative - see `dismissDrag`. */
  distance: number;
  /** Velocity along the same axis. Positive is toward the edge. */
  velocity: number;
};

/**
 * Project a gesture onto the dismiss axis.
 *
 * Dragging *away* from the docked edge is clamped to zero rather than allowed to pull
 * the card further on-screen than its resting position, which would leave a gap at
 * the edge it is supposed to be flush against.
 */
export function dismissDrag(gesture: PanGesture, landscape: boolean): DismissDrag {
  return {
    distance: Math.max(0, landscape ? gesture.dx : gesture.dy),
    velocity: landscape ? gesture.vx : gesture.vy,
  };
}

/**
 * Should this movement be taken over as a dismiss drag?
 *
 * In portrait the dismiss axis is the same axis the facts list scrolls on, so the
 * card may only claim the gesture when that list is already at the top - otherwise
 * dragging down inside a scrolled list would close the card instead of scrolling it
 * back up. Landscape has no such conflict: the card dismisses sideways and the list
 * scrolls vertically.
 */
export function shouldCaptureDrag(
  gesture: PanGesture,
  { landscape, factsAtTop }: { landscape: boolean; factsAtTop: boolean },
): boolean {
  const { dx, dy } = gesture;
  const along = landscape ? dx : dy;
  const across = landscape ? dy : dx;

  if (along < DRAG_ACTIVATION_DISTANCE) return false;
  // A mostly-sideways swipe in portrait (or a mostly-vertical one in landscape) is
  // not a dismiss - leave it to whatever else wants it.
  if (Math.abs(along) <= Math.abs(across)) return false;

  return landscape || factsAtTop;
}

/**
 * On release: close, or spring back?
 *
 * Velocity is checked before distance so a short flick dismisses and a long drag
 * pulled back at the last moment does not - matching what the finger did last rather
 * than only where it ended up.
 */
export function shouldDismiss({
  distance,
  velocity,
  extent,
}: DismissDrag & { extent: number }): boolean {
  if (!(extent > 0)) return false;
  if (velocity <= -DISMISS_VELOCITY) return false;
  if (velocity >= DISMISS_VELOCITY) return true;

  return distance >= extent * DISMISS_DISTANCE_FRACTION;
}

/**
 * How open the card is, 0 (gone) to 1 (fully docked), part way through a drag. Feeds
 * the same `Animated.Value` the open/close animation drives, so releasing mid-drag
 * carries on from exactly where the finger left it.
 */
export function dragProgress(distance: number, extent: number): number {
  if (!(extent > 0)) return 1;

  return Math.min(1, Math.max(0, 1 - distance / extent));
}
