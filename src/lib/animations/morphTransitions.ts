/**
 * SVG morph transition utilities using flubber.
 * Used for page transition clip-path wipes and icon morphing.
 */
import { interpolate, toPathString, fromCircle, fromRect, combine, separate } from 'flubber';

/** Organic blob shapes for liquid wipe transitions */
const blobPaths = [
  'M 0,0 C 20,10 40,5 50,0 C 60,-5 80,10 100,0 L 100,100 L 0,100 Z',
  'M 0,0 C 15,20 35,10 50,15 C 65,20 85,5 100,0 L 100,100 L 0,100 Z',
  'M 0,0 C 10,15 30,25 50,10 C 70,-5 90,20 100,0 L 100,100 L 0,100 Z',
  'M 0,0 C 25,30 45,5 55,20 C 65,35 75,10 100,0 L 100,100 L 0,100 Z',
];

/**
 * Create an interpolator between two SVG paths.
 * Returns a function that takes progress (0-1) and returns a path string.
 */
export function createPathMorph(fromPath: string, toPath: string): (t: number) => string {
  return interpolate(fromPath, toPath, { maxSegmentLength: 5 });
}

/**
 * Create a liquid wipe reveal — morphs from closed blob to fully open.
 * Progress 0 = fully hidden, 1 = fully revealed.
 */
export function createLiquidWipe(): (progress: number) => string {
  const closedPath = 'M 0,100 C 25,100 50,100 75,100 C 100,100 100,100 100,100 L 100,100 L 0,100 Z';
  const midPath = blobPaths[Math.floor(Math.random() * blobPaths.length)];
  const openPath = 'M 0,0 C 25,0 50,0 75,0 C 100,0 100,0 100,0 L 100,100 L 0,100 Z';

  const phase1 = interpolate(closedPath, midPath, { maxSegmentLength: 8 });
  const phase2 = interpolate(midPath, openPath, { maxSegmentLength: 8 });

  return (progress: number) => {
    if (progress <= 0.5) {
      return phase1(progress * 2);
    }
    return phase2((progress - 0.5) * 2);
  };
}

/**
 * Create a circle expand reveal from a given center point.
 * Returns SVG path at given progress (0 = hidden, 1 = revealed).
 */
export function createCircleReveal(
  cx: number = 50,
  cy: number = 50,
  maxRadius: number = 150
): (progress: number) => string {
  return (progress: number) => {
    const r = maxRadius * progress;
    if (r <= 0) return 'M 0,0 L 0,0 Z';
    return `M ${cx - r},${cy} A ${r},${r} 0 1,0 ${cx + r},${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} Z`;
  };
}

/**
 * Morph SVG icon shapes — useful for loader animations.
 * Returns an array of interpolators for cycling through shapes.
 */
export function createShapeCycle(shapes: string[]): ((t: number) => string)[] {
  const morphers: ((t: number) => string)[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const next = (i + 1) % shapes.length;
    morphers.push(interpolate(shapes[i], shapes[next], { maxSegmentLength: 5 }));
  }
  return morphers;
}

/** Common SVG shapes for the morphing loader */
export const loaderShapes = {
  circle: 'M 25,50 A 25,25 0 1,1 75,50 A 25,25 0 1,1 25,50 Z',
  square: 'M 25,25 L 75,25 L 75,75 L 25,75 Z',
  triangle: 'M 50,20 L 80,75 L 20,75 Z',
  diamond: 'M 50,20 L 80,50 L 50,80 L 20,50 Z',
  star: 'M 50,15 L 58,40 L 85,40 L 63,55 L 72,80 L 50,65 L 28,80 L 37,55 L 15,40 L 42,40 Z',
};

export { toPathString, fromCircle, fromRect, combine, separate };
