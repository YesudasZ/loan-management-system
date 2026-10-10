import type { PaymentDocument } from '../../models/payment.model.js';
import { utcMidnightToCalendarDate, type CalendarDate } from '../../utils/dates.js';

export interface PaymentDto {
  id: string;
  utr: string;
  amount: number; // paise
  paymentDate: CalendarDate;
  recordedBy: { name: string };
  createdAt: Date;
}

export function toPaymentDto(payment: PaymentDocument, recordedByName: string): PaymentDto {
  return {
    id: payment._id.toString(),
    utr: payment.utr,
    amount: payment.amount,
    paymentDate: utcMidnightToCalendarDate(payment.paymentDate),
    recordedBy: { name: recordedByName },
    createdAt: payment.createdAt,
  };
}
