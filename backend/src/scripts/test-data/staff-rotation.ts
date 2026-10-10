import type { Actor, PickActor, StaffTask } from './test-data-types.js';
import type { StaffRole } from './test-accounts.js';

/** The executive role that normally does each task (ADMIN can do all of them). */
const EXECUTIVE_FOR_TASK: Record<StaffTask, StaffRole> = {
  REVIEW: 'SANCTION',
  DISBURSE: 'DISBURSEMENT',
  COLLECT: 'COLLECTION',
};
/** Every Nth task of each kind is done by an admin, so admins appear in the history too. */
const ADMIN_EVERY: Record<StaffTask, number> = { REVIEW: 4, DISBURSE: 5, COLLECT: 6 };

function pickInTurn(actors: readonly Actor[], turn: number): Actor {
  const actor = actors[turn % actors.length];
  if (!actor) throw new Error('No test staff member can do this task');
  return actor;
}

/**
 * Hands out staff round-robin, so every test executive (and admin) shows up in loan histories
 * and payment records instead of one person doing everything.
 */
export function createStaffRotation(staff: readonly Actor[]): PickActor {
  const admins = staff.filter((actor) => actor.role === 'ADMIN');
  const tasksDone: Record<StaffTask, number> = { REVIEW: 0, DISBURSE: 0, COLLECT: 0 };
  // Counted separately: reusing the task counter would skip one executive whenever the
  // admin interval equals the team size (every 5th task → executive 0 never gets a turn).
  const executiveTurns: Record<StaffTask, number> = { REVIEW: 0, DISBURSE: 0, COLLECT: 0 };

  return (task) => {
    tasksDone[task] += 1;
    if (tasksDone[task] % ADMIN_EVERY[task] === 0) {
      return pickInTurn(admins, tasksDone[task] / ADMIN_EVERY[task]);
    }
    executiveTurns[task] += 1;
    const executives = staff.filter((actor) => actor.role === EXECUTIVE_FOR_TASK[task]);
    return pickInTurn(executives, executiveTurns[task]);
  };
}
