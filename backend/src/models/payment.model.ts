import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface Payment {
  loanId: Types.ObjectId;
  utr: string; // trimmed + uppercased; unique across all payments
  amount: number; // paise
  paymentDate: Date; // UTC midnight of the calendar date
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentDocument = HydratedDocument<Payment>;

const paymentSchema = new Schema<Payment>(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true },
    utr: { type: String, required: true, unique: true, trim: true, uppercase: true },
    amount: { type: Number, required: true, min: 1 },
    paymentDate: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'payments', timestamps: true },
);

// A loan's payment history, newest first.
paymentSchema.index({ loanId: 1, paymentDate: -1, _id: -1 });

export const PaymentModel = model<Payment>('Payment', paymentSchema);
