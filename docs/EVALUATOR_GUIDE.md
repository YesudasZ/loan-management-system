# Evaluator guide

How to log in as each role and test the full loan flow on the live app.

- **Live app:** https://loan-management-system-beta-pearl.vercel.app
- **Demo video:** <VIDEO_LINK>

> The backend runs on Render's free tier; the first request after idle can take up to a minute to wake up. The app shows a "Waking up the server" banner while it retries.

## Login credentials

Every account below uses the password **`Password@123`** (from `backend/src/scripts/seed-demo.ts`).

| Role         | Email                  | Password       | Lands on                                   | What to test                                                                                                   |
| ------------ | ---------------------- | -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Admin        | `admin@lms.dev`        | `Password@123` | `/dashboard` (Overview)                    | Loan counts by status; every module in the sidebar; the **Staff** page (add staff, change roles)               |
| Sales        | `sales@lms.dev`        | `Password@123` | `/dashboard/sales`                         | Leads: borrowers who registered but haven't applied, with their stage                                          |
| Sanction     | `sanction@lms.dev`     | `Password@123` | `/dashboard/sanction`                      | APPLIED loans: view the salary slip, **Approve**, or **Reject** with a reason                                  |
| Disbursement | `disbursement@lms.dev` | `Password@123` | `/dashboard/disbursement`                  | SANCTIONED loans: **Mark disbursed**                                                                           |
| Collection   | `collection@lms.dev`   | `Password@123` | `/dashboard/collection`                    | DISBURSED loans: **Record payment** (UTR, amount, date); duplicate UTR and overpayment are refused; auto-close |
| Borrower     | `borrower@lms.dev`     | `Password@123` | `/apply` (resumes at the next wizard step) | Personal details + eligibility check, salary slip upload, loan sliders, apply, status page, **My loans**       |

Public signup always creates a BORROWER; staff roles are assigned by an admin on the Staff page.

More seeded borrowers in specific states (`lead.*@lms.dev`, `demo.*@lms.dev`, same password) are listed in the [README](../README.md#demo-accounts).

### Logging out and switching roles

**Log out** is the button at the top right of every page: in the staff dashboard it's next to your name and role, in the borrower portal it's at the right of the header, and the 403 page has one too. Test each role in turn: log out, then log in as the next account. A role that opens another role's page (for example Sanction typing `/dashboard/collection`) sees the 403 page, and the API refuses the request too.

## Test the full flow (10 steps)

Use a new email for the borrower so the flow starts clean. Please don't enter real personal data or upload real documents: any small PDF, JPG or PNG (up to 5 MB) works as the salary slip.

1. **Sign up as a borrower.** Log out if needed, click **Create an account**, and sign up with a new email (for example `evaluator.1@example.com`) and a password of your choice. You land on **Personal details** (`/apply/profile`).
2. **Fail the eligibility check (BRE).** Enter a date of birth that makes you 21, a monthly salary of `20000`, PAN `ABCDE1234` (one character short) and employment **Unemployed**, then **Check eligibility and continue**. The server lists **all four** failures at once (age, salary, PAN, employment), and you stay on the step.
3. **Pass the eligibility check.** Fix the details: an age between 23 and 50, salary `50000`, PAN `ABCDE1234F`, employment **Salaried**. **Check eligibility and continue** takes you to **Salary slip**.
4. **Upload the salary slip.** Choose a PDF, JPG or PNG up to 5 MB and **Upload**. A different file type, or a file over 5 MB, is refused. Then **Continue to loan amount**.
5. **Apply.** Set the amount to **₹1,00,000** and the tenure to **365 days** (sliders; the arrow keys move them in steps). The panel shows 12% p.a. simple interest: interest **₹12,000**, total repayment **₹1,12,000**. Click **Apply for ₹1,00,000**. The status page shows **APPLIED**.
6. **Sanction approves.** Log out and log in as `sanction@lms.dev`. Open your borrower's loan, **View slip**, then **Approve**. (To see rejection instead, use **Reject** on another applied loan with a reason of at least 5 characters; the borrower sees that reason.) The loan leaves the Sanction queue as **SANCTIONED**.
7. **Disburse.** Log in as `disbursement@lms.dev`, open the loan and **Mark disbursed** → **Confirm disbursal**. It moves to Collection as **DISBURSED**.
8. **Record payments, including a duplicate UTR.** Log in as `collection@lms.dev` and open the loan (outstanding ₹1,12,000).
   - **Record payment** with UTR `EVAL100001`, amount `50000` and today's date. Outstanding drops to **₹62,000**.
   - Record another payment with the **same** UTR `EVAL100001`: refused with "A payment with this UTR has already been recorded."
   - Try UTR `EVAL100002` with amount `70000`: refused, because it's more than the outstanding ₹62,000. A future payment date is refused too.
9. **Auto-close.** Record UTR `EVAL100002` with **Fill outstanding amount** (₹62,000). Total paid now equals the total repayment, so the loan is **CLOSED** automatically and leaves the Collection queue.
10. **Check as the borrower, then as admin.**
    - Log in as your borrower: the status page shows **CLOSED** with the full timeline, and **My loans** lists the loan. **Apply again** is offered.
    - Log in as `admin@lms.dev`: the **Overview** counts include the closed loan, and the Sales page no longer lists your borrower as a lead. Open **Staff**: search for your borrower, add a staff member (for example a new Sanction user), and see that an admin can't change their own role or demote the last admin.
