import { describe, expect, it } from 'vitest';
import type { Role } from './constants';
import {
  getAllowedModules,
  getHomePath,
  getSafeNextPath,
  MY_LOANS_PATH,
  resolveRouteAccess,
} from './route-access';

const allow = { type: 'allow' };
const redirect = (to: string) => ({ type: 'redirect', to });

describe('resolveRouteAccess', () => {
  it('sends anonymous visitors to login, remembering where they were going', () => {
    expect(resolveRouteAccess('/', null)).toEqual(redirect('/login'));
    expect(resolveRouteAccess('/apply/profile', null)).toEqual(
      redirect('/login?next=%2Fapply%2Fprofile'),
    );
    expect(resolveRouteAccess('/dashboard/sanction', null)).toEqual(
      redirect('/login?next=%2Fdashboard%2Fsanction'),
    );
  });

  it('lets anonymous visitors open the auth pages and the 403 page', () => {
    expect(resolveRouteAccess('/login', null)).toEqual(allow);
    expect(resolveRouteAccess('/signup', null)).toEqual(allow);
    expect(resolveRouteAccess('/forbidden', null)).toEqual(allow);
  });

  it('sends logged-in users away from the auth pages to their home', () => {
    expect(resolveRouteAccess('/login', 'BORROWER')).toEqual(redirect('/apply'));
    expect(resolveRouteAccess('/signup', 'COLLECTION')).toEqual(redirect('/dashboard/collection'));
  });

  it.each<[Role, string]>([
    ['BORROWER', '/apply'],
    ['ADMIN', '/dashboard'],
    ['SALES', '/dashboard/sales'],
    ['SANCTION', '/dashboard/sanction'],
    ['DISBURSEMENT', '/dashboard/disbursement'],
    ['COLLECTION', '/dashboard/collection'],
  ])('sends %s from / to %s', (role, home) => {
    expect(resolveRouteAccess('/', role)).toEqual(redirect(home));
  });

  it('keeps borrowers out of the dashboard', () => {
    expect(resolveRouteAccess('/dashboard', 'BORROWER')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess('/dashboard/sales', 'BORROWER')).toEqual(redirect('/forbidden'));
  });

  it('keeps staff (including ADMIN) out of the borrower portal', () => {
    expect(resolveRouteAccess('/apply', 'ADMIN')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess('/apply/loan', 'SANCTION')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess('/apply/loan', 'BORROWER')).toEqual(allow);
  });

  it("opens My loans (and a loan's page) to borrowers only", () => {
    const loanPage = `${MY_LOANS_PATH}/64b7f0c2a1b2c3d4e5f60718`;
    expect(resolveRouteAccess(MY_LOANS_PATH, 'BORROWER')).toEqual(allow);
    expect(resolveRouteAccess(loanPage, 'BORROWER')).toEqual(allow);
    expect(resolveRouteAccess(MY_LOANS_PATH, 'ADMIN')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess(loanPage, 'COLLECTION')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess(MY_LOANS_PATH, null)).toEqual(
      redirect('/login?next=%2Fapply%2Floans'),
    );
  });

  it('lets an executive into their own module only', () => {
    expect(resolveRouteAccess('/dashboard/sanction', 'SANCTION')).toEqual(allow);
    expect(resolveRouteAccess('/dashboard/sanction/abc123', 'SANCTION')).toEqual(allow);
    expect(resolveRouteAccess('/dashboard/collection', 'SANCTION')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess('/dashboard/sanctionx', 'SANCTION')).toEqual(redirect('/forbidden'));
    expect(resolveRouteAccess('/dashboard', 'SALES')).toEqual(redirect('/dashboard/sales'));
  });

  it('opens Staff management to ADMIN only', () => {
    expect(resolveRouteAccess('/dashboard/staff', 'ADMIN')).toEqual(allow);
    for (const role of ['SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION', 'BORROWER'] as const) {
      expect(resolveRouteAccess('/dashboard/staff', role)).toEqual(redirect('/forbidden'));
    }
    expect(resolveRouteAccess('/dashboard/staff', null)).toEqual(
      redirect('/login?next=%2Fdashboard%2Fstaff'),
    );
  });

  it('lets ADMIN into every module and the overview', () => {
    expect(resolveRouteAccess('/dashboard', 'ADMIN')).toEqual(allow);
    for (const dashboardModule of getAllowedModules('ADMIN')) {
      expect(resolveRouteAccess(dashboardModule.path, 'ADMIN')).toEqual(allow);
    }
  });

  it('allows unknown pages so Next.js can render its 404', () => {
    expect(resolveRouteAccess('/no-such-page', null)).toEqual(allow);
  });
});

describe('getAllowedModules', () => {
  it('gives ADMIN every module including Staff, and an executive only theirs', () => {
    expect(getAllowedModules('ADMIN').map((dashboardModule) => dashboardModule.key)).toEqual([
      'sales',
      'sanction',
      'disbursement',
      'collection',
      'staff',
    ]);
    expect(getAllowedModules('DISBURSEMENT').map((dashboardModule) => dashboardModule.key)).toEqual(
      ['disbursement'],
    );
    expect(getAllowedModules('BORROWER')).toEqual([]);
  });

  it('gives every executive a home inside their module', () => {
    expect(getHomePath('SALES')).toBe('/dashboard/sales');
  });
});

describe('getSafeNextPath', () => {
  it.each([
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'evil.com/apply',
    '/apply\u0000',
    '',
  ])('rejects %j and falls back to the home path', (next) => {
    expect(getSafeNextPath(next, 'BORROWER')).toBe('/apply');
  });

  it('falls back to home when there is no next path', () => {
    expect(getSafeNextPath(null, 'ADMIN')).toBe('/dashboard');
    expect(getSafeNextPath(undefined, 'SALES')).toBe('/dashboard/sales');
  });

  it('keeps an allowed internal path, including its query', () => {
    expect(getSafeNextPath('/apply/loan', 'BORROWER')).toBe('/apply/loan');
    expect(getSafeNextPath('/dashboard?status=CLOSED', 'ADMIN')).toBe('/dashboard?status=CLOSED');
  });

  it('does not send a user to a page their role cannot open', () => {
    expect(getSafeNextPath('/dashboard/sales', 'BORROWER')).toBe('/apply');
    expect(getSafeNextPath('/dashboard/collection', 'SANCTION')).toBe('/dashboard/sanction');
  });
});
