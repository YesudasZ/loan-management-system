/**
 * Wraps async actions so only one runs at a time: calls made while one is running are ignored
 * (a double-click, Enter pressed twice). The guard is a plain variable, so even a second click
 * in the same frame, before React re-renders the disabled button, is blocked.
 * `onRunningChange` lets the component show a spinner and disable its button.
 */
export function createSingleFlight(onRunningChange: (isRunning: boolean) => void) {
  let isRunning = false;

  return async function run(action: () => Promise<void>): Promise<boolean> {
    if (isRunning) return false;
    isRunning = true;
    onRunningChange(true);
    try {
      await action();
    } finally {
      isRunning = false;
      onRunningChange(false);
    }
    return true;
  };
}
