import { useState } from 'react';
import { createSingleFlight } from '@/lib/single-flight';

/** Double-click protection for an action button: `run(action)` and `isRunning` for its state. */
export function useSingleFlight() {
  const [isRunning, setIsRunning] = useState(false);
  // Created once per component (lazy initial state), so the guard survives re-renders.
  const [run] = useState(() => createSingleFlight(setIsRunning));
  return { isRunning, run };
}
