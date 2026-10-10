# UI: theme, accessibility and responsive behaviour

## Theme tokens

Colours are defined once, as Tailwind 4 theme tokens in `frontend/src/app/globals.css`. Components use the token names (`bg-primary`, `text-danger-strong`, …) through the UI kit in `frontend/src/components/ui/`, never raw palette colours. The one exception is the badges (status, role, lead stage), which use the palette named in the design brief.

| Token                                 | Colour                 | Used for                                                   |
| ------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `primary`                             | blue-700 `#1D4ED8`     | buttons, links, focus rings, the current wizard step       |
| `primary-hover`                       | blue-800 `#1E40AF`     | button hover                                               |
| `primary-dark`                        | blue-950 `#172554`     | the login/sign-up brand panel, text on `primary-soft`      |
| `primary-soft` / `primary-border`     | blue-50 / blue-200     | selected nav item, info alerts, the repayment panel        |
| `accent`                              | emerald-600 `#059669`  | completed wizard steps (graphics only)                     |
| `accent-strong` / `-soft` / `-border` | emerald-700 / 50 / 200 | success text and panels; the brand panel's check marks     |
| `warning`                             | amber-500              | the "waking up the server" banner's border only            |
| `warning-strong` / `-soft`            | amber-900 / 100        | warning text and background                                |
| `danger`                              | red-600 `#DC2626`      | destructive buttons, field errors                          |
| `danger-strong` / `-soft` / `-border` | red-800 / 50 / 200     | error alerts                                               |
| `background` / `foreground`           | slate-50 / slate-900   | page background and body text; secondary text is slate-500 |

**Status badges** always show their text label:

- APPLIED: blue
- SANCTIONED: indigo
- DISBURSED: amber
- CLOSED: emerald
- REJECTED: red

## Contrast (WCAG 2.2 AA)

Text needs 4.5:1; large text, icons and other graphics need 3:1. These ratios were computed from the hex values with the WCAG relative-luminance formula.

| Pair                                                                                                            | Ratio                           | Result                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| White on blue-700 (primary button, step numbers)                                                                | 6.70:1                          | pass                                                        |
| White on blue-800 (button hover)                                                                                | 8.72:1                          | pass                                                        |
| Blue-700 links on white / on slate-50                                                                           | 6.70:1 / 6.41:1                 | pass                                                        |
| White on red-600 (danger button)                                                                                | 4.83:1                          | pass                                                        |
| Red-600 field errors on white                                                                                   | 4.83:1                          | pass                                                        |
| Red-800 on red-50 (error alert)                                                                                 | 7.60:1                          | pass                                                        |
| Emerald-700 on emerald-50 / on white (success text)                                                             | 5.21:1 / 5.48:1                 | pass                                                        |
| Emerald-600 on white (graphics only)                                                                            | 3.77:1                          | pass for graphics; not used for small text                  |
| Amber-900 on amber-100 (warning banner, DISBURSED badge)                                                        | 8.15:1                          | pass                                                        |
| Amber-500 on white                                                                                              | 2.15:1                          | used only as a decorative border, never for text or meaning |
| Blue-950 on blue-50 (info alert)                                                                                | 13.50:1                         | pass                                                        |
| Slate-900 on slate-50 (body text)                                                                               | 17.06:1                         | pass                                                        |
| Slate-500 on white / on slate-50 (secondary text)                                                               | 4.76:1 / 4.55:1                 | pass                                                        |
| White / blue-200 on blue-950 (brand panel text)                                                                 | 14.69:1 / 10.34:1               | pass                                                        |
| Emerald-200 on blue-950 (brand panel check marks)                                                               | 11.46:1                         | pass                                                        |
| Badges: blue-800/blue-100, indigo-800/indigo-100, amber-900/amber-100, emerald-800/emerald-100, red-800/red-100 | 7.15, 8.06, 8.15, 6.78, 6.80 :1 | pass                                                        |

## Touch and phones

- **Tap targets.** Buttons, button-style links, inputs, the dashboard drawer links and the borrower tabs are at least **44px tall below 640px** (`min-h-11`), and the usual 36px above that. The exceptions are inline links inside sentences, such as "Create an account".
- **Sliders.** They have a 28px thumb on a 44px-tall touch area. The filled part of the track shows the value (the `.slider` class in `globals.css`), and they still work with the keyboard.
- **No zoom on focus.** Inputs, selects and the reject-reason textarea use 16px text on phones, so iOS Safari doesn't zoom into the field. They drop to 14px from 640px up.
- **Dialogs.** They are never wider than the screen minus 2rem, never taller than the dynamic viewport minus 2rem, and they scroll inside. So they fit a 360px phone with the keyboard open.
- **Long text.** Long names and emails use `wrap-anywhere` with `min-w-0`, so they wrap instead of widening the page. Header names are truncated.
- **Tables.** My loans is cards below 640px; the loan queues and Staff are cards below 1024px (DECISIONS #81); the Sales leads list stays a scrolling table. Every table sits in its own `overflow-x-auto` container.
- **Navigation.** On phones the dashboard sidebar is a drawer behind the **Menu** button (`aria-expanded`); it closes after a link is chosen.

## Errors and loading

- **Error boundaries.** These show a friendly message, **Try again** (re-renders the failed part) and **Go to my home page**, never a blank screen:
  - `app/error.tsx` for any page;
  - `app/(borrower)/apply/error.tsx` and `app/dashboard/error.tsx`, inside their headers, so navigation keeps working;
  - `app/global-error.tsx` if the root layout itself fails.
  - `app/not-found.tsx` is the 404 page.
- **Data states.** Every data view has a loading spinner, an empty state and an error state with **Try again**.
- **Backend down.** GET requests retry while the API wakes up and show the "Waking up the server" banner. If it stays down, the view shows "The server is starting up. Please try again in a moment." with **Try again**. Form submissions show the same message inline.
- **Double-click protection.** Apply, Approve, Reject, Mark disbursed and Record payment run through `useSingleFlight` (`lib/single-flight.ts`). A second click while the request is running is ignored, even within the same frame, and the button shows a spinner and is disabled. After a successful Apply or decision, the buttons stay disabled until the page changes.

## Responsive audit

Each page was checked on localhost with seeded data, at 360, 390, 768, 1024 and 1440px wide, using the in-app browser's device emulation and a script. The script measures page width against viewport width, flags elements sticking out of the viewport outside a scroll container, measures tap targets on phones, and checks that dialogs fit. Screenshots were reviewed at each width. The results are in the PR for this branch (`style/theme-login-responsive-audit`).

### Audit checklist (this branch)

**pass** means no issue was found; **fixed** means an issue was found and fixed here. Every page also ended with page width equal to viewport width at all five sizes.

| Page / state                               | 360                                                                 | 390                 | 768                                      | 1024                       | 1440  |
| ------------------------------------------ | ------------------------------------------------------------------- | ------------------- | ---------------------------------------- | -------------------------- | ----- |
| `/login` (split screen)                    | pass                                                                | pass                | pass                                     | fixed (term cards wrapped) | pass  |
| `/signup`                                  | pass                                                                | pass                | pass                                     | pass                       | pass  |
| `/apply/profile`                           | fixed (16px inputs)                                                 | fixed (16px inputs) | pass                                     | pass                       | pass  |
| `/apply/salary-slip`                       | pass                                                                | pass                | pass                                     | pass                       | pass  |
| `/apply/loan` (sliders)                    | fixed (16px → 28px thumb, 44px track)                               | fixed               | fixed                                    | fixed                      | fixed |
| `/apply/status`                            | pass                                                                | pass                | pass                                     | pass                       | pass  |
| `/apply/loans` (My loans)                  | fixed (View link 17px → 44px)                                       | fixed               | pass                                     | pass                       | pass  |
| `/apply/loans/:id`                         | fixed (back link 44px)                                              | fixed               | pass                                     | pass                       | pass  |
| `/forbidden`                               | pass                                                                | pass                | pass                                     | pass                       | pass  |
| 404 page                                   | pass                                                                | pass                | pass                                     | pass                       | pass  |
| `/dashboard` overview                      | fixed (long email: page was 450px wide)                             | fixed               | pass                                     | pass                       | pass  |
| `/dashboard/sales`                         | pass (table scrolls inside its box)                                 | pass (same)         | pass                                     | pass                       | pass  |
| `/dashboard/sanction`                      | fixed (long email, 44px Review)                                     | fixed               | pass                                     | pass                       | pass  |
| `/dashboard/sanction/:id`                  | fixed (long name, back link)                                        | fixed               | pass                                     | pass                       | pass  |
| `/dashboard/disbursement`                  | fixed (header labels wrapped)                                       | fixed               | pass                                     | pass                       | pass  |
| `/dashboard/collection`                    | fixed (long email)                                                  | fixed               | fixed (page was 857px; cards until 1024) | pass                       | pass  |
| `/dashboard/collection/:id` + payment form | fixed (back link, 16px inputs)                                      | fixed               | pass                                     | pass                       | pass  |
| `/dashboard/staff`                         | pass                                                                | pass                | pass                                     | pass                       | pass  |
| Mobile drawer (dashboard menu)             | fixed (Menu 30px → 44px, 44px links)                                | fixed               | n/a (sidebar)                            | n/a                        | n/a   |
| Reject-reason dialog                       | fixed (14px → 16px textarea)                                        | fixed               | pass                                     | pass                       | pass  |
| Disburse confirm dialog                    | pass                                                                | pass                | pass                                     | pass                       | pass  |
| Add staff / change role dialogs            | pass                                                                | pass                | pass                                     | pass                       | pass  |
| Backend stopped                            | pass ("Waking up" banner, then "server is starting up" + Try again) | pass                | pass                                     | pass                       | pass  |
| Render error (forced)                      | pass (boundary with Try again + home link)                          | pass                | pass                                     | pass                       | pass  |

**Console** (production build, 15 pages): no errors, warnings or hydration messages. The only entry is the expected 404 response of the 404 page.

Before and after screenshots are in `docs/screenshots/`.
