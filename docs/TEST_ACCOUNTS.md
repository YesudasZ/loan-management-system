# Test accounts

QA data for checking every role by hand. It lives entirely on the **`@test.lms.dev`** domain, so it can be added and removed without touching the `@lms.dev` demo accounts (README "Demo accounts") or real users.

**Password for every account below: `Test@1234`**

| Command (from `backend/`)            | What it does                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm run seed -- --test-data`        | Adds (or resets) all the data on this page. Safe to re-run; account ids stay the same.               |
| `npm run seed -- --remove-test-data` | Deletes every `@test.lms.dev` user and everything they own: profiles, salary slips, loans, payments. |
| `npm run seed`                       | Unchanged: the `@lms.dev` demo data only. Run it as well if you want both.                           |

Add `--force` (with `NODE_ENV=production`) for production; the exact commands are in [DEPLOYMENT.md](DEPLOYMENT.md#test-data-in-production).

How the data is built:

- **Dates.** Every date is relative to when the seed ran, within the last 90 days. The "Applied" column below is how many days before the seed run.
- **Real rules.** Every loan goes through the API's rules: the apply limits, the BRE on the apply date, 12% simple interest, the status machine and the payment rules. So totals, history, payments and balances always agree.
- **Staff in the history.** The test executives take turns approving, disbursing and recording payments, and an admin steps in now and then. Their names appear in loan histories and payment records.
- **UTRs.** Payment UTRs are `TEST00000001`, `TEST00000002`, and so on.
- **Reserved domain.** `@test.lms.dev` is reserved for this data. Anything on that domain is reset or deleted by the commands above.

## What each role sees after login

Counts are from the test data alone. With the demo seed too, staff queues show a few more.

| Role                                                                                 | Lands on                  | Sees                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN (`admin1–5`)                                                                   | Overview                  | Counts: 5 APPLIED, 5 SANCTIONED, 5 DISBURSED, 75 CLOSED, 35 REJECTED, 10 leads. Every module in the sidebar, each with data. Plus **Staff** (user and role management). |
| SALES (`sales1–5`)                                                                   | Sales                     | 10 leads at every stage, with BRE failure reasons.                                                                                                                      |
| SANCTION (`sanction1–5`)                                                             | Sanction                  | 5 APPLIED loans; each opens with a viewable PDF salary slip.                                                                                                            |
| DISBURSEMENT (`disbursement1–5`)                                                     | Disbursement              | 5 SANCTIONED loans.                                                                                                                                                     |
| COLLECTION (`collection1–5`)                                                         | Collection                | 5 DISBURSED loans: one unpaid, two with one payment, one with two, one with three.                                                                                      |
| BORROWER (`applied1–5`, `sanctioned1–5`, `disbursed1–5`, `closed1–5`, `rejected1–5`) | Status page (latest loan) | **My loans** (header tab, or "See all my loans") lists all 5 loans, each opening its timeline.                                                                          |
| Lead (`lead1–10`)                                                                    | Their wizard step         | No loans by definition; see the leads table.                                                                                                                            |

## Staff

| Role         | Accounts                                                    | Names (1–5)                                                                 |
| ------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| ADMIN        | `admin1@test.lms.dev` … `admin5@test.lms.dev`               | Ananya Krishnamurthy, Rohit Kapoor, Sunita Reddy, Vivek Chandra, Neha Bhatt |
| SALES        | `sales1@test.lms.dev` … `sales5@test.lms.dev`               | Amit Saini, Ritika Arora, Deepak Nair, Swati Kulkarni, Mohit Jain           |
| SANCTION     | `sanction1@test.lms.dev` … `sanction5@test.lms.dev`         | Shalini Menon, Rajesh Iyer, Preeti Sharma, Naveen Kumar, Asha Pillai        |
| DISBURSEMENT | `disbursement1@test.lms.dev` … `disbursement5@test.lms.dev` | Suresh Babu, Kirti Joshi, Arvind Rao, Megha Das, Prakash Patil              |
| COLLECTION   | `collection1@test.lms.dev` … `collection5@test.lms.dev`     | Lata Hegde, Sanjay Gupta, Rekha Nambiar, Ajay Thakur, Pooja Mehra           |

## Sales leads (no loans)

| Account               | Name            | Stage in Sales  | Why                                  | Lands on                         |
| --------------------- | --------------- | --------------- | ------------------------------------ | -------------------------------- |
| `lead1@test.lms.dev`  | Neel Kapoor     | Details pending | no profile yet                       | Personal details                 |
| `lead2@test.lms.dev`  | Zoya Qureshi    | Not eligible    | AGE: born 2005 (21)                  | Personal details, failures shown |
| `lead3@test.lms.dev`  | Gaurav Yadav    | Slip pending    | eligible, no salary slip             | Salary slip                      |
| `lead4@test.lms.dev`  | Pallavi Hegde   | Ready to apply  | eligible, slip uploaded              | Loan amount                      |
| `lead5@test.lms.dev`  | Imran Sheikh    | Not eligible    | SALARY: ₹18,000 a month              | Personal details, failures shown |
| `lead6@test.lms.dev`  | Shreya Bose     | Details pending | no profile yet                       | Personal details                 |
| `lead7@test.lms.dev`  | Abhishek Pandey | Not eligible    | PAN: `ABC123` is not a valid format  | Personal details, failures shown |
| `lead8@test.lms.dev`  | Divya Rangan    | Not eligible    | AGE (56) and EMPLOYMENT (unemployed) | Personal details, failures shown |
| `lead9@test.lms.dev`  | Farhan Ali      | Slip pending    | eligible (self-employed), no slip    | Salary slip                      |
| `lead10@test.lms.dev` | Tanvi Mishra    | Ready to apply  | eligible, slip uploaded              | Loan amount                      |

## Borrowers and their 5 loans

Each borrower has 4 finished past loans and 1 current loan, which names their group. Rows are newest first, as on **My loans**.

- **Applied** is days before the seed run.
- **Paid / Outstanding** show "—" while nothing is owed (not yet disbursed, or rejected). The API's `outstanding` field still equals the total for those loans.
- Every CLOSED loan's payments add up exactly to its total.

### Applied group (current loan APPLIED)

| Borrower                         | Loan    | Status   |    Amount | Tenure |        Total |         Paid | Outstanding | Payments |  Applied |
| -------------------------------- | ------- | -------- | --------: | -----: | -----------: | -----------: | ----------: | -------: | -------: |
| **Aarav Sharma**<br>`applied1`   | current | APPLIED  | ₹2,00,000 |   60 d | ₹2,03,945.21 |            — |           — |        0 |  5 d ago |
|                                  | past 4  | CLOSED   |   ₹50,000 |  365 d |      ₹56,000 |      ₹56,000 |          ₹0 |        1 | 37 d ago |
|                                  | past 3  | CLOSED   | ₹4,50,000 |  180 d | ₹4,76,630.14 | ₹4,76,630.14 |          ₹0 |        3 | 54 d ago |
|                                  | past 2  | REJECTED | ₹2,00,000 |   90 d | ₹2,05,917.81 |            — |           — |        0 | 71 d ago |
|                                  | past 1  | CLOSED   |   ₹50,000 |   30 d |   ₹50,493.15 |   ₹50,493.15 |          ₹0 |        1 | 88 d ago |
| **Diya Patel**<br>`applied2`     | current | APPLIED  | ₹3,50,000 |  365 d |    ₹3,92,000 |            — |           — |        0 |  4 d ago |
|                                  | past 4  | CLOSED   | ₹1,25,000 |  180 d | ₹1,32,397.26 | ₹1,32,397.26 |          ₹0 |        2 | 36 d ago |
|                                  | past 3  | REJECTED |   ₹85,000 |   90 d |   ₹87,515.07 |            — |           — |        0 | 53 d ago |
|                                  | past 2  | CLOSED   | ₹3,50,000 |   30 d | ₹3,53,452.05 | ₹3,53,452.05 |          ₹0 |        3 | 70 d ago |
|                                  | past 1  | CLOSED   | ₹1,25,000 |  240 d | ₹1,34,863.01 | ₹1,34,863.01 |          ₹0 |        2 | 87 d ago |
| **Kabir Reddy**<br>`applied3`    | current | APPLIED  | ₹5,00,000 |  180 d | ₹5,29,589.04 |            — |           — |        0 |  3 d ago |
|                                  | past 4  | CLOSED   | ₹2,50,000 |   90 d | ₹2,57,397.26 | ₹2,57,397.26 |          ₹0 |        3 | 35 d ago |
|                                  | past 3  | CLOSED   |   ₹75,000 |   30 d |   ₹75,739.73 |   ₹75,739.73 |          ₹0 |        2 | 52 d ago |
|                                  | past 2  | CLOSED   | ₹5,00,000 |  240 d | ₹5,39,452.05 | ₹5,39,452.05 |          ₹0 |        1 | 69 d ago |
|                                  | past 1  | REJECTED | ₹2,50,000 |  120 d | ₹2,59,863.01 |            — |           — |        0 | 86 d ago |
| **Meera Nair**<br>`applied4`     | current | APPLIED  | ₹1,75,000 |   90 d | ₹1,80,178.08 |            — |           — |        0 |  2 d ago |
|                                  | past 4  | REJECTED | ₹4,00,000 |   30 d | ₹4,03,945.21 |            — |           — |        0 | 34 d ago |
|                                  | past 3  | CLOSED   | ₹1,50,000 |  240 d | ₹1,61,835.62 | ₹1,61,835.62 |          ₹0 |        3 | 51 d ago |
|                                  | past 2  | REJECTED | ₹1,75,000 |  120 d | ₹1,81,904.11 |            — |           — |        0 | 68 d ago |
|                                  | past 1  | CLOSED   | ₹4,00,000 |   45 d | ₹4,05,917.81 | ₹4,05,917.81 |          ₹0 |        1 | 85 d ago |
| **Arjun Malhotra**<br>`applied5` | current | APPLIED  | ₹1,00,000 |   30 d | ₹1,00,986.30 |            — |           — |        0 |  1 d ago |
|                                  | past 4  | REJECTED |   ₹60,000 |  240 d |   ₹64,734.25 |            — |           — |        0 | 33 d ago |
|                                  | past 3  | CLOSED   | ₹3,00,000 |  120 d | ₹3,11,835.62 | ₹3,11,835.62 |          ₹0 |        1 | 50 d ago |
|                                  | past 2  | CLOSED   | ₹1,00,000 |   45 d | ₹1,01,479.45 | ₹1,01,479.45 |          ₹0 |        3 | 67 d ago |
|                                  | past 1  | CLOSED   |   ₹60,000 |  270 d |   ₹65,326.03 |   ₹65,326.03 |          ₹0 |        2 | 84 d ago |

### Sanctioned group (current loan SANCTIONED)

| Borrower                              | Loan    | Status     |    Amount | Tenure |        Total |         Paid | Outstanding | Payments |  Applied |
| ------------------------------------- | ------- | ---------- | --------: | -----: | -----------: | -----------: | ----------: | -------: | -------: |
| **Ishaan Gupta**<br>`sanctioned1`     | current | SANCTIONED | ₹2,00,000 |  240 d | ₹2,15,780.82 |            — |           — |        0 |  8 d ago |
|                                       | past 4  | CLOSED     |   ₹50,000 |  120 d |   ₹51,972.60 |   ₹51,972.60 |          ₹0 |        3 | 37 d ago |
|                                       | past 3  | CLOSED     | ₹4,50,000 |   45 d | ₹4,56,657.53 | ₹4,56,657.53 |          ₹0 |        2 | 54 d ago |
|                                       | past 2  | REJECTED   | ₹2,00,000 |  270 d | ₹2,17,753.42 |            — |           — |        0 | 71 d ago |
|                                       | past 1  | CLOSED     |   ₹50,000 |  150 d |   ₹52,465.75 |   ₹52,465.75 |          ₹0 |        3 | 88 d ago |
| **Saanvi Iyer**<br>`sanctioned2`      | current | SANCTIONED | ₹3,50,000 |  120 d | ₹3,63,808.22 |            — |           — |        0 |  7 d ago |
|                                       | past 4  | CLOSED     | ₹1,25,000 |   45 d | ₹1,26,849.32 | ₹1,26,849.32 |          ₹0 |        1 | 36 d ago |
|                                       | past 3  | REJECTED   |   ₹85,000 |  270 d |   ₹92,545.21 |            — |           — |        0 | 53 d ago |
|                                       | past 2  | CLOSED     | ₹3,50,000 |  150 d | ₹3,67,260.27 | ₹3,67,260.27 |          ₹0 |        2 | 70 d ago |
|                                       | past 1  | CLOSED     | ₹1,25,000 |   60 d | ₹1,27,465.75 | ₹1,27,465.75 |          ₹0 |        1 | 87 d ago |
| **Vihaan Joshi**<br>`sanctioned3`     | current | SANCTIONED | ₹5,00,000 |   45 d | ₹5,07,397.26 |            — |           — |        0 |  6 d ago |
|                                       | past 4  | CLOSED     | ₹2,50,000 |  270 d | ₹2,72,191.78 | ₹2,72,191.78 |          ₹0 |        2 | 35 d ago |
|                                       | past 3  | CLOSED     |   ₹75,000 |  150 d |   ₹78,698.63 |   ₹78,698.63 |          ₹0 |        1 | 52 d ago |
|                                       | past 2  | CLOSED     | ₹5,00,000 |   60 d | ₹5,09,863.01 | ₹5,09,863.01 |          ₹0 |        3 | 69 d ago |
|                                       | past 1  | REJECTED   | ₹2,50,000 |  365 d |    ₹2,80,000 |            — |           — |        0 | 86 d ago |
| **Anika Menon**<br>`sanctioned4`      | current | SANCTIONED | ₹1,75,000 |  270 d | ₹1,90,534.25 |            — |           — |        0 |  5 d ago |
|                                       | past 4  | REJECTED   | ₹4,00,000 |  150 d | ₹4,19,726.03 |            — |           — |        0 | 34 d ago |
|                                       | past 3  | CLOSED     | ₹1,50,000 |   60 d | ₹1,52,958.90 | ₹1,52,958.90 |          ₹0 |        2 | 51 d ago |
|                                       | past 2  | REJECTED   | ₹1,75,000 |  365 d |    ₹1,96,000 |            — |           — |        0 | 68 d ago |
|                                       | past 1  | CLOSED     | ₹4,00,000 |  180 d | ₹4,23,671.23 | ₹4,23,671.23 |          ₹0 |        3 | 85 d ago |
| **Reyansh Kulkarni**<br>`sanctioned5` | current | SANCTIONED | ₹1,00,000 |  150 d | ₹1,04,931.51 |            — |           — |        0 |  4 d ago |
|                                       | past 4  | REJECTED   |   ₹60,000 |   60 d |   ₹61,183.56 |            — |           — |        0 | 33 d ago |
|                                       | past 3  | CLOSED     | ₹3,00,000 |  365 d |    ₹3,36,000 |    ₹3,36,000 |          ₹0 |        3 | 50 d ago |
|                                       | past 2  | CLOSED     | ₹1,00,000 |  180 d | ₹1,05,917.81 | ₹1,05,917.81 |          ₹0 |        2 | 67 d ago |
|                                       | past 1  | CLOSED     |   ₹60,000 |   90 d |   ₹61,775.34 |   ₹61,775.34 |          ₹0 |        1 | 84 d ago |

### Disbursed group (current loan DISBURSED)

| Borrower                            | Loan    | Status    |    Amount | Tenure |        Total |         Paid |  Outstanding | Payments |  Applied |
| ----------------------------------- | ------- | --------- | --------: | -----: | -----------: | -----------: | -----------: | -------: | -------: |
| **Aditi Banerjee**<br>`disbursed1`  | current | DISBURSED | ₹2,00,000 |   60 d | ₹2,03,945.21 |           ₹0 | ₹2,03,945.21 |        0 | 22 d ago |
|                                     | past 4  | CLOSED    |   ₹50,000 |  365 d |      ₹56,000 |      ₹56,000 |           ₹0 |        2 | 37 d ago |
|                                     | past 3  | CLOSED    | ₹4,50,000 |  180 d | ₹4,76,630.14 | ₹4,76,630.14 |           ₹0 |        1 | 54 d ago |
|                                     | past 2  | REJECTED  | ₹2,00,000 |   90 d | ₹2,05,917.81 |            — |            — |        0 | 71 d ago |
|                                     | past 1  | CLOSED    |   ₹50,000 |   30 d |   ₹50,493.15 |   ₹50,493.15 |           ₹0 |        2 | 88 d ago |
| **Siddharth Rao**<br>`disbursed2`   | current | DISBURSED | ₹3,50,000 |  365 d |    ₹3,92,000 |    ₹1,17,600 |    ₹2,74,400 |        1 | 21 d ago |
|                                     | past 4  | CLOSED    | ₹1,25,000 |  180 d | ₹1,32,397.26 | ₹1,32,397.26 |           ₹0 |        3 | 36 d ago |
|                                     | past 3  | REJECTED  |   ₹85,000 |   90 d |   ₹87,515.07 |            — |            — |        0 | 53 d ago |
|                                     | past 2  | CLOSED    | ₹3,50,000 |   30 d | ₹3,53,452.05 | ₹3,53,452.05 |           ₹0 |        1 | 70 d ago |
|                                     | past 1  | CLOSED    | ₹1,25,000 |  240 d | ₹1,34,863.01 | ₹1,34,863.01 |           ₹0 |        3 | 87 d ago |
| **Tara Chatterjee**<br>`disbursed3` | current | DISBURSED | ₹5,00,000 |  180 d | ₹5,29,589.04 |    ₹2,38,315 | ₹2,91,274.04 |        2 | 20 d ago |
|                                     | past 4  | CLOSED    | ₹2,50,000 |   90 d | ₹2,57,397.26 | ₹2,57,397.26 |           ₹0 |        1 | 35 d ago |
|                                     | past 3  | CLOSED    |   ₹75,000 |   30 d |   ₹75,739.73 |   ₹75,739.73 |           ₹0 |        3 | 52 d ago |
|                                     | past 2  | CLOSED    | ₹5,00,000 |  240 d | ₹5,39,452.05 | ₹5,39,452.05 |           ₹0 |        2 | 69 d ago |
|                                     | past 1  | REJECTED  | ₹2,50,000 |  120 d | ₹2,59,863.01 |            — |            — |        0 | 86 d ago |
| **Karan Bhatia**<br>`disbursed4`    | current | DISBURSED | ₹1,75,000 |   90 d | ₹1,80,178.08 |      ₹90,090 |   ₹90,088.08 |        3 | 19 d ago |
|                                     | past 4  | REJECTED  | ₹4,00,000 |   30 d | ₹4,03,945.21 |            — |            — |        0 | 34 d ago |
|                                     | past 3  | CLOSED    | ₹1,50,000 |  240 d | ₹1,61,835.62 | ₹1,61,835.62 |           ₹0 |        1 | 51 d ago |
|                                     | past 2  | REJECTED  | ₹1,75,000 |  120 d | ₹1,81,904.11 |            — |            — |        0 | 68 d ago |
|                                     | past 1  | CLOSED    | ₹4,00,000 |   45 d | ₹4,05,917.81 | ₹4,05,917.81 |           ₹0 |        2 | 85 d ago |
| **Nisha Pillai**<br>`disbursed5`    | current | DISBURSED | ₹1,00,000 |   30 d | ₹1,00,986.30 |      ₹50,493 |   ₹50,493.30 |        1 | 18 d ago |
|                                     | past 4  | REJECTED  |   ₹60,000 |  240 d |   ₹64,734.25 |            — |            — |        0 | 33 d ago |
|                                     | past 3  | CLOSED    | ₹3,00,000 |  120 d | ₹3,11,835.62 | ₹3,11,835.62 |           ₹0 |        2 | 50 d ago |
|                                     | past 2  | CLOSED    | ₹1,00,000 |   45 d | ₹1,01,479.45 | ₹1,01,479.45 |           ₹0 |        1 | 67 d ago |
|                                     | past 1  | CLOSED    |   ₹60,000 |  270 d |   ₹65,326.03 |   ₹65,326.03 |           ₹0 |        3 | 84 d ago |

### Closed group (current loan CLOSED)

| Borrower                          | Loan    | Status   |    Amount | Tenure |        Total |         Paid | Outstanding | Payments |  Applied |
| --------------------------------- | ------- | -------- | --------: | -----: | -----------: | -----------: | ----------: | -------: | -------: |
| **Rohan Verma**<br>`closed1`      | current | CLOSED   | ₹2,00,000 |  240 d | ₹2,15,780.82 | ₹2,15,780.82 |          ₹0 |        2 | 22 d ago |
|                                   | past 4  | CLOSED   |   ₹50,000 |  120 d |   ₹51,972.60 |   ₹51,972.60 |          ₹0 |        1 | 37 d ago |
|                                   | past 3  | CLOSED   | ₹4,50,000 |   45 d | ₹4,56,657.53 | ₹4,56,657.53 |          ₹0 |        3 | 54 d ago |
|                                   | past 2  | REJECTED | ₹2,00,000 |  270 d | ₹2,17,753.42 |            — |           — |        0 | 71 d ago |
|                                   | past 1  | CLOSED   |   ₹50,000 |  150 d |   ₹52,465.75 |   ₹52,465.75 |          ₹0 |        1 | 88 d ago |
| **Priya Krishnan**<br>`closed2`   | current | CLOSED   | ₹3,50,000 |  120 d | ₹3,63,808.22 | ₹3,63,808.22 |          ₹0 |        3 | 21 d ago |
|                                   | past 4  | CLOSED   | ₹1,25,000 |   45 d | ₹1,26,849.32 | ₹1,26,849.32 |          ₹0 |        2 | 36 d ago |
|                                   | past 3  | REJECTED |   ₹85,000 |  270 d |   ₹92,545.21 |            — |           — |        0 | 53 d ago |
|                                   | past 2  | CLOSED   | ₹3,50,000 |  150 d | ₹3,67,260.27 | ₹3,67,260.27 |          ₹0 |        3 | 70 d ago |
|                                   | past 1  | CLOSED   | ₹1,25,000 |   60 d | ₹1,27,465.75 | ₹1,27,465.75 |          ₹0 |        2 | 87 d ago |
| **Aniket Deshpande**<br>`closed3` | current | CLOSED   | ₹5,00,000 |   45 d | ₹5,07,397.26 | ₹5,07,397.26 |          ₹0 |        1 | 20 d ago |
|                                   | past 4  | CLOSED   | ₹2,50,000 |  270 d | ₹2,72,191.78 | ₹2,72,191.78 |          ₹0 |        3 | 35 d ago |
|                                   | past 3  | CLOSED   |   ₹75,000 |  150 d |   ₹78,698.63 |   ₹78,698.63 |          ₹0 |        2 | 52 d ago |
|                                   | past 2  | CLOSED   | ₹5,00,000 |   60 d | ₹5,09,863.01 | ₹5,09,863.01 |          ₹0 |        1 | 69 d ago |
|                                   | past 1  | REJECTED | ₹2,50,000 |  365 d |    ₹2,80,000 |            — |           — |        0 | 86 d ago |
| **Sneha Mukherjee**<br>`closed4`  | current | CLOSED   | ₹1,75,000 |  270 d | ₹1,90,534.25 | ₹1,90,534.25 |          ₹0 |        2 | 19 d ago |
|                                   | past 4  | REJECTED | ₹4,00,000 |  150 d | ₹4,19,726.03 |            — |           — |        0 | 34 d ago |
|                                   | past 3  | CLOSED   | ₹1,50,000 |   60 d | ₹1,52,958.90 | ₹1,52,958.90 |          ₹0 |        3 | 51 d ago |
|                                   | past 2  | REJECTED | ₹1,75,000 |  365 d |    ₹1,96,000 |            — |           — |        0 | 68 d ago |
|                                   | past 1  | CLOSED   | ₹4,00,000 |  180 d | ₹4,23,671.23 | ₹4,23,671.23 |          ₹0 |        1 | 85 d ago |
| **Varun Sinha**<br>`closed5`      | current | CLOSED   | ₹1,00,000 |  150 d | ₹1,04,931.51 | ₹1,04,931.51 |          ₹0 |        3 | 18 d ago |
|                                   | past 4  | REJECTED |   ₹60,000 |   60 d |   ₹61,183.56 |            — |           — |        0 | 33 d ago |
|                                   | past 3  | CLOSED   | ₹3,00,000 |  365 d |    ₹3,36,000 |    ₹3,36,000 |          ₹0 |        1 | 50 d ago |
|                                   | past 2  | CLOSED   | ₹1,00,000 |  180 d | ₹1,05,917.81 | ₹1,05,917.81 |          ₹0 |        3 | 67 d ago |
|                                   | past 1  | CLOSED   |   ₹60,000 |   90 d |   ₹61,775.34 |   ₹61,775.34 |          ₹0 |        2 | 84 d ago |

### Rejected group (current loan REJECTED)

| Borrower                               | Loan    | Status   |    Amount | Tenure |        Total |         Paid | Outstanding | Payments |  Applied |
| -------------------------------------- | ------- | -------- | --------: | -----: | -----------: | -----------: | ----------: | -------: | -------: |
| **Lakshmi Subramanian**<br>`rejected1` | current | REJECTED | ₹2,00,000 |   60 d | ₹2,03,945.21 |            — |           — |        0 |  7 d ago |
|                                        | past 4  | CLOSED   |   ₹50,000 |  365 d |      ₹56,000 |      ₹56,000 |          ₹0 |        3 | 37 d ago |
|                                        | past 3  | CLOSED   | ₹4,50,000 |  180 d | ₹4,76,630.14 | ₹4,76,630.14 |          ₹0 |        2 | 54 d ago |
|                                        | past 2  | REJECTED | ₹2,00,000 |   90 d | ₹2,05,917.81 |            — |           — |        0 | 71 d ago |
|                                        | past 1  | CLOSED   |   ₹50,000 |   30 d |   ₹50,493.15 |   ₹50,493.15 |          ₹0 |        3 | 88 d ago |
| **Harsh Agarwal**<br>`rejected2`       | current | REJECTED | ₹3,50,000 |  365 d |    ₹3,92,000 |            — |           — |        0 |  6 d ago |
|                                        | past 4  | CLOSED   | ₹1,25,000 |  180 d | ₹1,32,397.26 | ₹1,32,397.26 |          ₹0 |        1 | 36 d ago |
|                                        | past 3  | REJECTED |   ₹85,000 |   90 d |   ₹87,515.07 |            — |           — |        0 | 53 d ago |
|                                        | past 2  | CLOSED   | ₹3,50,000 |   30 d | ₹3,53,452.05 | ₹3,53,452.05 |          ₹0 |        2 | 70 d ago |
|                                        | past 1  | CLOSED   | ₹1,25,000 |  240 d | ₹1,34,863.01 | ₹1,34,863.01 |          ₹0 |        1 | 87 d ago |
| **Kavya Shetty**<br>`rejected3`        | current | REJECTED | ₹5,00,000 |  180 d | ₹5,29,589.04 |            — |           — |        0 |  5 d ago |
|                                        | past 4  | CLOSED   | ₹2,50,000 |   90 d | ₹2,57,397.26 | ₹2,57,397.26 |          ₹0 |        2 | 35 d ago |
|                                        | past 3  | CLOSED   |   ₹75,000 |   30 d |   ₹75,739.73 |   ₹75,739.73 |          ₹0 |        1 | 52 d ago |
|                                        | past 2  | CLOSED   | ₹5,00,000 |  240 d | ₹5,39,452.05 | ₹5,39,452.05 |          ₹0 |        3 | 69 d ago |
|                                        | past 1  | REJECTED | ₹2,50,000 |  120 d | ₹2,59,863.01 |            — |           — |        0 | 86 d ago |
| **Manish Tiwari**<br>`rejected4`       | current | REJECTED | ₹1,75,000 |   90 d | ₹1,80,178.08 |            — |           — |        0 |  4 d ago |
|                                        | past 4  | REJECTED | ₹4,00,000 |   30 d | ₹4,03,945.21 |            — |           — |        0 | 34 d ago |
|                                        | past 3  | CLOSED   | ₹1,50,000 |  240 d | ₹1,61,835.62 | ₹1,61,835.62 |          ₹0 |        2 | 51 d ago |
|                                        | past 2  | REJECTED | ₹1,75,000 |  120 d | ₹1,81,904.11 |            — |           — |        0 | 68 d ago |
|                                        | past 1  | CLOSED   | ₹4,00,000 |   45 d | ₹4,05,917.81 | ₹4,05,917.81 |          ₹0 |        3 | 85 d ago |
| **Ritu Saxena**<br>`rejected5`         | current | REJECTED | ₹1,00,000 |   30 d | ₹1,00,986.30 |            — |           — |        0 |  3 d ago |
|                                        | past 4  | REJECTED |   ₹60,000 |  240 d |   ₹64,734.25 |            — |           — |        0 | 33 d ago |
|                                        | past 3  | CLOSED   | ₹3,00,000 |  120 d | ₹3,11,835.62 | ₹3,11,835.62 |          ₹0 |        3 | 50 d ago |
|                                        | past 2  | CLOSED   | ₹1,00,000 |   45 d | ₹1,01,479.45 | ₹1,01,479.45 |          ₹0 |        2 | 67 d ago |
|                                        | past 1  | CLOSED   |   ₹60,000 |  270 d |   ₹65,326.03 |   ₹65,326.03 |          ₹0 |        1 | 84 d ago |

## RBAC checklist

Log in as one account per role and open each URL. "403 page" means the app shows "You don't have access to this page". The API enforces the same rules: the same request with `curl` gets a 403 JSON error.

| Role         | Should open                                                                                                                                                       | Should show the 403 page                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ADMIN        | `/dashboard`, `/dashboard/sales`, `/dashboard/sanction` (+ a review page), `/dashboard/disbursement`, `/dashboard/collection` (+ a loan page), `/dashboard/staff` | `/apply`, `/apply/loans`                                                                                |
| SALES        | `/dashboard/sales` (`/dashboard` redirects here)                                                                                                                  | `/dashboard/sanction`, `/dashboard/disbursement`, `/dashboard/collection`, `/dashboard/staff`, `/apply` |
| SANCTION     | `/dashboard/sanction`, `/dashboard/sanction/<id of an APPLIED loan>`                                                                                              | `/dashboard/sales`, `/dashboard/disbursement`, `/dashboard/collection`, `/dashboard/staff`, `/apply`    |
| DISBURSEMENT | `/dashboard/disbursement`                                                                                                                                         | `/dashboard/sales`, `/dashboard/sanction`, `/dashboard/collection`, `/dashboard/staff`, `/apply`        |
| COLLECTION   | `/dashboard/collection`, `/dashboard/collection/<id of a DISBURSED loan>`                                                                                         | `/dashboard/sales`, `/dashboard/sanction`, `/dashboard/disbursement`, `/dashboard/staff`, `/apply`      |
| BORROWER     | `/apply` (and its steps), `/apply/loans`, `/apply/loans/<own loan id>`                                                                                            | `/dashboard` and every module                                                                           |

Also check:

- **A borrower opening another borrower's loan id** (`/apply/loans/<id>`) sees "Loan not found". The API returns 404, as if it didn't exist.
- **Executives outside their module:** a review URL for a loan in another status shows "Loan not found". For example, `sanction1` opening `/dashboard/sanction/<id of a DISBURSED loan>`.
- **Logged out:** any `/apply` or `/dashboard` URL redirects to the login page.

## Staff management (admin)

Admins manage roles on **Staff** (`/dashboard/staff`). Any admin works: `admin@lms.dev` / `Password@123` or `admin1@test.lms.dev` / `Test@1234`.

1. **Open Staff.** Log in as an admin and open **Staff** in the sidebar. Everyone is listed with a role badge. Try the search ("sharma") and the role filter (Admin, Borrower, …).
2. **Add a staff member.** Click **Add staff member** and enter a name, a new email (for example `new.sanction@example.com`), a temporary password (8+ characters with a letter and a digit, e.g. `Welcome123`) and the role **Sanction**. You get a toast, and they appear in the list.
   - Using an email that already exists (e.g. `sales@lms.dev`) shows "An account with this email already exists" under Email.
3. **Log in as them.** Log out, then log in with the new email and the temporary password. You land on the **Sanction** queue; `/dashboard/staff` shows the 403 page.
4. **Change their role.** Log back in as the admin. Use **Change role** on the new user → **Collection** → **Change role**. The dialog notes that they must log out and back in. When they do, they land on **Collection**.
5. **Check the safety rules.** Each is refused with an inline message and nothing changes:
   - **Your own row** has no Change role button ("You can't change your own role"). The API also refuses with 409.
   - **A borrower with loans** (e.g. `applied1@test.lms.dev` or `demo.closed@lms.dev`) → any staff role: "This borrower has loans, so they cannot be given a staff role."
   - **The last admin:** you can't change your own role, so with two admins you can demote the other one but never yourself. An admin always remains.

Accounts you create here are real accounts. They aren't `@test.lms.dev`, so `--remove-test-data` won't delete them; change them back to Borrower, or delete them in Atlas if needed.

## Suggested action flow

This walks one loan through every module. Re-seed afterwards to reset.

1. **Approve.** Log in as `sanction1@test.lms.dev`, open **Aarav Sharma** (`applied1`, ₹2,00,000 for 60 days), view the slip and **Approve**. It leaves the Sanction queue.
2. **Disburse.** Log in as `disbursement1@test.lms.dev`. You'll see Aarav's loan and **Ishaan Gupta** (`sanctioned1`, ₹2,00,000 for 240 days). **Mark disbursed** on Ishaan's loan. It moves to Collection.
3. **Pay off and auto-close.** Log in as `collection1@test.lms.dev` and open **Aditi Banerjee** (`disbursed1`, outstanding ₹2,03,945.21, no payments yet).
   - Record ₹1,00,000 with a new UTR; the outstanding drops to ₹1,03,945.21.
   - Record the same UTR again: it's rejected as a duplicate.
   - Click **Fill outstanding amount** and record it with another new UTR. The loan **auto-closes** and leaves the queue.
4. **Check as the borrower.** Log in as `disbursed1@test.lms.dev`. The status page shows CLOSED with the full timeline, and **My loans** still lists 5 loans.
5. **Check as admin.** Log in as `admin1@test.lms.dev`. Overview shows CLOSED +1, DISBURSED −1 (plus the moves from steps 1–2).
