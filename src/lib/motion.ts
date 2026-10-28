// How long animations last: none at all when the system asks for reduced motion.

/** `ms`, or 0 when the system asks for reduced motion. */
export const motion = (ms: number) => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms);
