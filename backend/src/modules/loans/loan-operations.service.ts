import mongoose, { type Types } from 'mongoose';
import type { Role } from '../../config/constants.js';
import { LoanModel, type LoanDocument } from '../../models/loan.model.js';
import { UserModel } from '../../models/user.model.js';
import { AppError } from '../../utils/app-error.js';
import {
  canViewLoanInStatus,
  getNextStatus,
  LOAN_ACTIONS,
  MODULE_OWNED_STATUS,
  type LoanAction,
  type LoanStatus,
} from '../../utils/loan-state-machine.js';
import { toPaginated, toSkip, type Paginated } from '../../utils/pagination.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  toLoanDetailDto,
  toLoanSummaryDto,
  type LoanDetailDto,
  type LoanSummaryDto,
  type PeopleById,
} from './loans.dto.js';
import type { ListLoansQuery } from './loans.schema.js';

const LOAN_NOT_FOUND = 'Loan not found';

/** Looks up the names of everyone a set of loans refers to, in one query. */
async function loadPeople(ids: Types.ObjectId[]): Promise<PeopleById> {
  const uniqueIds = [...new Set(ids.map((id) => id.toString()))];
  const users = await UserModel.find({ _id: mongoose.trusted({ $in: uniqueIds }) }).select(
    'name email role',
  );
  return new Map(
    users.map((user) => [
      user._id.toString(),
      { name: user.name, email: user.email, role: user.role },
    ]),
  );
}

export async function toLoanDetail(loan: LoanDocument): Promise<LoanDetailDto> {
  const people = await loadPeople([
    loan.borrowerId,
    ...loan.statusHistory.map((entry) => entry.by),
  ]);
  return toLoanDetailDto(loan, people);
}

/**
 * Which status a staff member may list. Executives always get their module's status (asking
 * for another one is 403); ADMIN may filter by any status or see all.
 */
function resolveListStatus(role: Role, requested: LoanStatus | undefined): LoanStatus | undefined {
  if (role === 'ADMIN') {
    return requested;
  }
  const owned = MODULE_OWNED_STATUS[role];
  if (!owned || (requested && requested !== owned)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only list loans handled by your module');
  }
  return owned;
}

export async function listLoans(
  viewer: AuthUser,
  query: ListLoansQuery,
): Promise<Paginated<LoanSummaryDto>> {
  const status = resolveListStatus(viewer.role, query.status);
  const filter = status ? { status } : {};
  const [loans, totalItems] = await Promise.all([
    LoanModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(toSkip(query.page, query.limit))
      .limit(query.limit),
    LoanModel.countDocuments(filter),
  ]);
  const people = await loadPeople(loans.map((loan) => loan.borrowerId));
  return toPaginated(
    loans.map((loan) => toLoanSummaryDto(loan, people)),
    totalItems,
    query.page,
    query.limit,
  );
}

/**
 * A loan the viewer may read. Outside their module's status it is a 404, exactly as if it
 * didn't exist, so executives can't browse other stages. ADMIN reads every loan.
 */
export async function findLoanForViewer(viewer: AuthUser, loanId: string): Promise<LoanDocument> {
  const loan = await LoanModel.findById(loanId);
  if (!loan || !canViewLoanInStatus(viewer.role, loan.status)) {
    throw new AppError(404, 'NOT_FOUND', LOAN_NOT_FOUND);
  }
  return loan;
}

export async function getLoanDetail(viewer: AuthUser, loanId: string): Promise<LoanDetailDto> {
  return toLoanDetail(await findLoanForViewer(viewer, loanId));
}

interface TransitionChanges {
  note?: string;
  set?: Record<string, unknown>;
}

/**
 * Moves a loan through the state machine with ONE conditional update ({ _id, status: from }),
 * so two people acting at once can't both succeed. If nothing matched: 404 when the loan
 * doesn't exist, otherwise 409 INVALID_STATUS_TRANSITION.
 */
async function transitionLoan(
  actor: AuthUser,
  loanId: string,
  action: LoanAction,
  changes: TransitionChanges = {},
): Promise<LoanDetailDto> {
  const { from, to } = LOAN_ACTIONS[action];
  const updated = await LoanModel.findOneAndUpdate(
    { _id: loanId, status: from },
    {
      $set: { status: to, ...changes.set },
      $push: {
        statusHistory: {
          from,
          to,
          by: actor.id,
          byRole: actor.role,
          at: new Date(),
          note: changes.note,
        },
      },
    },
    { returnDocument: 'after', runValidators: true },
  );
  if (updated) {
    return toLoanDetail(updated);
  }

  const existing = await LoanModel.findById(loanId).select('status');
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', LOAN_NOT_FOUND);
  }
  getNextStatus(existing.status, action); // throws 409 with a message naming the current status
  throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'The loan changed. Refresh and try again.');
}

export function approveLoan(
  actor: AuthUser,
  loanId: string,
  note?: string,
): Promise<LoanDetailDto> {
  return transitionLoan(actor, loanId, 'APPROVE', { note });
}

export function rejectLoan(
  actor: AuthUser,
  loanId: string,
  reason: string,
): Promise<LoanDetailDto> {
  return transitionLoan(actor, loanId, 'REJECT', {
    note: reason,
    set: { rejectionReason: reason },
  });
}

export function disburseLoan(actor: AuthUser, loanId: string): Promise<LoanDetailDto> {
  return transitionLoan(actor, loanId, 'DISBURSE', {
    set: { disbursedAt: new Date(), disbursedBy: actor.id },
  });
}
