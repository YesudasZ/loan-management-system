import type { PipelineStage, Types } from 'mongoose';
import type { EmploymentMode } from '../../config/constants.js';
import { BorrowerProfileModel } from '../../models/borrower-profile.model.js';
import { LoanModel } from '../../models/loan.model.js';
import { UserModel } from '../../models/user.model.js';
import { evaluateEligibility, type BreFailure } from '../../utils/bre.js';
import { toBusinessDate, utcMidnightToCalendarDate } from '../../utils/dates.js';
import { resolveLeadStage, type LeadStage } from '../../utils/lead-stage.js';
import { LOAN_STATUSES, type LoanStatus } from '../../utils/loan-state-machine.js';
import { toPaginated, toSkip, type Paginated } from '../../utils/pagination.js';
import type { PaginationQuery } from '../../utils/schemas.js';

export interface LeadDto {
  id: string;
  name: string;
  email: string;
  registeredAt: Date;
  stage: LeadStage;
  breFailures: BreFailure[];
}

export interface DashboardSummaryDto {
  loansByStatus: Record<LoanStatus, number>;
  leadCount: number;
}

interface LeadProfile {
  dateOfBirth: Date;
  monthlySalary: number;
  pan: string;
  employmentMode: EmploymentMode;
  salarySlip: object | null;
}

interface LeadRow {
  _id: Types.ObjectId;
  name: string;
  email: string;
  createdAt: Date;
  profile: LeadProfile[];
}

/**
 * Borrowers who have registered but never applied (zero loans of any status), newest first.
 * The sort runs before the loan lookup so it can use the { role, createdAt, _id } index.
 * Aggregations aren't sanitized by Mongoose; every value here is a server constant.
 */
function leadsPipeline(): PipelineStage[] {
  return [
    { $match: { role: 'BORROWER' } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $lookup: {
        from: LoanModel.collection.collectionName,
        localField: '_id',
        foreignField: 'borrowerId',
        pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }],
        as: 'loans',
      },
    },
    { $match: { loans: { $size: 0 } } },
  ];
}

function toLeadDto(row: LeadRow, today: string): LeadDto {
  const profile = row.profile[0];
  const breResult = profile
    ? evaluateEligibility(
        {
          dateOfBirth: utcMidnightToCalendarDate(profile.dateOfBirth),
          monthlySalary: profile.monthlySalary,
          pan: profile.pan,
          employmentMode: profile.employmentMode,
        },
        today,
      )
    : null;

  return {
    id: row._id.toString(),
    name: row.name,
    email: row.email,
    registeredAt: row.createdAt,
    stage: resolveLeadStage({
      hasProfile: profile !== undefined,
      isEligible: breResult?.isEligible ?? false,
      hasSalarySlip: Boolean(profile?.salarySlip),
    }),
    breFailures: breResult?.failures ?? [],
  };
}

export async function listLeads(query: PaginationQuery): Promise<Paginated<LeadDto>> {
  const [result] = await UserModel.aggregate<{ items: LeadRow[]; total: { count: number }[] }>([
    ...leadsPipeline(),
    {
      $facet: {
        items: [
          { $skip: toSkip(query.page, query.limit) },
          { $limit: query.limit },
          {
            $lookup: {
              from: BorrowerProfileModel.collection.collectionName,
              localField: '_id',
              foreignField: 'userId',
              as: 'profile',
            },
          },
          {
            $project: {
              name: 1,
              email: 1,
              createdAt: 1,
              profile: {
                dateOfBirth: 1,
                monthlySalary: 1,
                pan: 1,
                employmentMode: 1,
                salarySlip: 1,
              },
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const today = toBusinessDate();
  const items = (result?.items ?? []).map((row) => toLeadDto(row, today));
  return toPaginated(items, result?.total[0]?.count ?? 0, query.page, query.limit);
}

async function countLeads(): Promise<number> {
  const [result] = await UserModel.aggregate<{ count: number }>([
    ...leadsPipeline(),
    { $count: 'count' },
  ]);
  return result?.count ?? 0;
}

/** Loan counts for every status (zero when there are none) plus the number of open leads. */
export async function getSummary(): Promise<DashboardSummaryDto> {
  const [counts, leadCount] = await Promise.all([
    Promise.all(LOAN_STATUSES.map((status) => LoanModel.countDocuments({ status }))),
    countLeads(),
  ]);
  const loansByStatus = Object.fromEntries(
    LOAN_STATUSES.map((status, index) => [status, counts[index] ?? 0]),
  ) as Record<LoanStatus, number>;
  return { loansByStatus, leadCount };
}
