import mongoose from 'mongoose';
import { LoanModel, type LoanDocument } from '../../models/loan.model.js';
import { PaymentModel, type PaymentDocument } from '../../models/payment.model.js';
import { UserModel } from '../../models/user.model.js';
import { AppError } from '../../utils/app-error.js';
import { calendarDateToUtcMidnight, toBusinessDate } from '../../utils/dates.js';
import { isDuplicateKeyError } from '../../utils/duplicate-key.js';
import { LOAN_ACTIONS } from '../../utils/loan-state-machine.js';
import { toPaginated, toSkip, type Paginated } from '../../utils/pagination.js';
import type { PaginationQuery } from '../../utils/schemas.js';
import { validatePayment } from '../../utils/payment-rules.js';
import type { AuthUser } from '../auth/auth.types.js';
import { findLoanForViewer, toLoanDetail } from '../loans/loan-operations.service.js';
import { getOutstanding, type LoanDetailDto } from '../loans/loans.dto.js';
import { toPaymentDto, type PaymentDto } from './payments.dto.js';
import type { RecordPaymentBody } from './payments.schema.js';

const NOT_DISBURSED_MESSAGE = 'Payments can only be recorded for disbursed loans.';
/** The history note on the automatic CLOSED transition (the test-data seed writes it too). */
export const AUTO_CLOSE_NOTE = 'Auto-closed: fully repaid';

/** The auto-close update, applied in the same write that brings the balance to zero. */
function buildLoanUpdate(loan: LoanDocument, actor: AuthUser, amount: number) {
  const isFullyPaid = loan.totalPaid + amount === loan.totalRepayment;
  if (!isFullyPaid) {
    return { $inc: { totalPaid: amount } };
  }
  const now = new Date();
  const { from, to } = LOAN_ACTIONS.AUTO_CLOSE;
  return {
    $inc: { totalPaid: amount },
    $set: { status: to, closedAt: now },
    $push: {
      statusHistory: {
        from,
        to,
        by: actor.id,
        byRole: actor.role,
        at: now,
        note: AUTO_CLOSE_NOTE,
      },
    },
  };
}

/**
 * Records a payment and, when it clears the balance, closes the loan, all in ONE MongoDB
 * transaction: the payment insert, the totalPaid increment and the auto-close commit together
 * or not at all.
 *
 * The loan is read inside the transaction, so the outstanding check uses the current balance.
 * Two payments racing on the same loan both write the loan document; MongoDB aborts one with a
 * write conflict and the driver retries it with fresh data, so totalPaid can never pass
 * totalRepayment. The callback has no side effects because it may run more than once.
 */
export async function recordPayment(
  actor: AuthUser,
  loanId: string,
  input: RecordPaymentBody,
): Promise<{ payment: PaymentDto; loan: LoanDetailDto }> {
  let result: { payment: PaymentDocument; loan: LoanDocument };
  try {
    result = await mongoose.connection.transaction(async (session) => {
      const loan = await LoanModel.findById(loanId).session(session);
      if (!loan) {
        throw new AppError(404, 'NOT_FOUND', 'Loan not found');
      }
      if (loan.status !== 'DISBURSED' || !loan.disbursedAt) {
        throw new AppError(409, 'LOAN_NOT_DISBURSED', NOT_DISBURSED_MESSAGE);
      }

      const failures = validatePayment({
        amount: input.amount,
        paymentDate: input.paymentDate,
        outstanding: getOutstanding(loan),
        disbursedOn: toBusinessDate(loan.disbursedAt),
        today: toBusinessDate(),
      });
      if (failures.length > 0) {
        throw new AppError(422, 'PAYMENT_RULES_FAILED', 'This payment cannot be recorded.', {
          failures,
        });
      }

      const [payment] = await PaymentModel.create(
        [
          {
            loanId: loan._id,
            utr: input.utr,
            amount: input.amount,
            paymentDate: calendarDateToUtcMidnight(input.paymentDate),
            recordedBy: actor.id,
          },
        ],
        { session },
      );
      const updatedLoan = await LoanModel.findOneAndUpdate(
        { _id: loan._id, status: 'DISBURSED' },
        buildLoanUpdate(loan, actor, input.amount),
        { session, returnDocument: 'after' },
      );
      if (!payment || !updatedLoan) {
        throw new AppError(409, 'LOAN_NOT_DISBURSED', NOT_DISBURSED_MESSAGE);
      }
      return { payment, loan: updatedLoan };
    });
  } catch (error) {
    if (isDuplicateKeyError(error, 'utr')) {
      throw new AppError(
        409,
        'DUPLICATE_UTR',
        'A payment with this UTR has already been recorded.',
      );
    }
    throw error;
  }

  return {
    payment: toPaymentDto(result.payment, actor.name),
    loan: await toLoanDetail(result.loan),
  };
}

/** A loan's payments, newest first. Readable only where the loan itself is (404 otherwise). */
export async function listPayments(
  viewer: AuthUser,
  loanId: string,
  query: PaginationQuery,
): Promise<Paginated<PaymentDto>> {
  const loan = await findLoanForViewer(viewer, loanId);
  const filter = { loanId: loan._id };
  const [payments, totalItems] = await Promise.all([
    PaymentModel.find(filter)
      .sort({ paymentDate: -1, _id: -1 })
      .skip(toSkip(query.page, query.limit))
      .limit(query.limit),
    PaymentModel.countDocuments(filter),
  ]);

  const recorderIds = [...new Set(payments.map((payment) => payment.recordedBy.toString()))];
  const recorders = await UserModel.find({ _id: mongoose.trusted({ $in: recorderIds }) }).select(
    'name',
  );
  const names = new Map(recorders.map((user) => [user._id.toString(), user.name]));

  return toPaginated(
    payments.map((payment) =>
      toPaymentDto(payment, names.get(payment.recordedBy.toString()) ?? 'Unknown user'),
    ),
    totalItems,
    query.page,
    query.limit,
  );
}
