import {
  DISMISS_DISTANCE_FRACTION,
  DISMISS_VELOCITY,
  dismissDrag,
  dragProgress,
  shouldCaptureDrag,
  shouldDismiss,
} from '@/components/sheetDismiss';

const gesture = (g: Partial<{ dx: number; dy: number; vx: number; vy: number }>) => ({
  dx: 0,
  dy: 0,
  vx: 0,
  vy: 0,
  ...g,
});

describe('dismissDrag', () => {
  it('projects onto the axis the card is docked to', () => {
    // Portrait dismisses downward, so only dy counts.
    expect(dismissDrag(gesture({ dx: 90, dy: 40, vy: 0.2 }), false)).toEqual({
      distance: 40,
      velocity: 0.2,
    });

    // Landscape dismisses to the right, so only dx counts.
    expect(dismissDrag(gesture({ dx: 90, dy: 40, vx: 0.3 }), true)).toEqual({
      distance: 90,
      velocity: 0.3,
    });
  });

  it('clamps a drag away from the docked edge to zero', () => {
    // Dragging up in portrait must not pull the card further on-screen than its
    // resting position, which would open a gap along the bottom edge.
    expect(dismissDrag(gesture({ dy: -120 }), false).distance).toBe(0);
    expect(dismissDrag(gesture({ dx: -120 }), true).distance).toBe(0);
  });
});

describe('shouldCaptureDrag', () => {
  const portrait = { landscape: false, factsAtTop: true };

  it('ignores movement too small to be a drag', () => {
    expect(shouldCaptureDrag(gesture({ dy: 3 }), portrait)).toBe(false);
    expect(shouldCaptureDrag(gesture({ dy: 40 }), portrait)).toBe(true);
  });

  it('ignores a drag in the wrong direction', () => {
    // Up in portrait is a scroll, not a dismiss.
    expect(shouldCaptureDrag(gesture({ dy: -60 }), portrait)).toBe(false);
    // Left in landscape likewise.
    expect(shouldCaptureDrag(gesture({ dx: -60 }), { landscape: true, factsAtTop: true })).toBe(
      false,
    );
  });

  it('ignores a drag that is mostly across the dismiss axis', () => {
    expect(shouldCaptureDrag(gesture({ dy: 20, dx: 80 }), portrait)).toBe(false);
    expect(shouldCaptureDrag(gesture({ dy: 80, dx: 20 }), portrait)).toBe(true);
  });

  it('leaves the gesture to the facts list when it is scrolled down', () => {
    // The conflict case: in portrait, dragging down inside a scrolled list has to
    // scroll it back up rather than dismiss the card.
    expect(shouldCaptureDrag(gesture({ dy: 60 }), { landscape: false, factsAtTop: false })).toBe(
      false,
    );

    // Landscape has no conflict - it dismisses sideways while the list scrolls
    // vertically - so a scrolled list is no reason to refuse.
    expect(shouldCaptureDrag(gesture({ dx: 60 }), { landscape: true, factsAtTop: false })).toBe(
      true,
    );
  });
});

describe('shouldDismiss', () => {
  const extent = 400;
  const past = extent * DISMISS_DISTANCE_FRACTION + 1;
  const short = extent * DISMISS_DISTANCE_FRACTION - 1;

  it('dismisses a drag past the distance threshold', () => {
    expect(shouldDismiss({ distance: past, velocity: 0, extent })).toBe(true);
    expect(shouldDismiss({ distance: short, velocity: 0, extent })).toBe(false);
  });

  it('dismisses a short fast flick', () => {
    expect(shouldDismiss({ distance: 20, velocity: DISMISS_VELOCITY, extent })).toBe(true);
  });

  it('keeps the card when a long drag is flicked back', () => {
    // Follow the finger, not the endpoint: dragged most of the way down but thrown
    // back up at the last moment.
    expect(shouldDismiss({ distance: past, velocity: -DISMISS_VELOCITY, extent })).toBe(false);
  });

  it('never dismisses before the card has measured itself', () => {
    expect(shouldDismiss({ distance: 999, velocity: 9, extent: 0 })).toBe(false);
  });
});

describe('dragProgress', () => {
  it('maps distance dragged onto the 0-1 the slide animation uses', () => {
    expect(dragProgress(0, 400)).toBe(1); // fully docked
    expect(dragProgress(100, 400)).toBe(0.75);
    expect(dragProgress(400, 400)).toBe(0); // exactly off-screen
  });

  it('clamps rather than overshooting in either direction', () => {
    expect(dragProgress(900, 400)).toBe(0);
    expect(dragProgress(-50, 400)).toBe(1);
  });

  it('stays open when the size is not known yet', () => {
    expect(dragProgress(50, 0)).toBe(1);
  });
});
