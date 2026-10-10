import { describe, expect, it, vi } from 'vitest';
import { createSingleFlight } from './single-flight';

describe('createSingleFlight', () => {
  it('ignores calls while an action is running, then allows the next one', async () => {
    const onRunningChange = vi.fn();
    const run = createSingleFlight(onRunningChange);
    let finish: () => void = () => {};
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));

    const first = run(action);
    const second = await run(action); // a double-click
    finish();

    expect(second).toBe(false);
    expect(await first).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onRunningChange.mock.calls).toEqual([[true], [false]]);
    expect(await run(async () => {})).toBe(true);
  });

  it('releases the guard when the action fails', async () => {
    const run = createSingleFlight(() => {});

    await expect(run(() => Promise.reject(new Error('network')))).rejects.toThrow('network');
    expect(await run(async () => {})).toBe(true);
  });
});
