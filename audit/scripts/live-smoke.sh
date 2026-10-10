#!/usr/bin/env bash
# Read-only smoke test of the deployed LMS (audit Lens G4). Run it yourself: it signs in with the
# published demo/test passwords, reads data, and logs out. It creates and changes nothing, and
# never prints cookies or tokens (they live in a temp folder that is deleted at the end).
#
#   bash audit/scripts/live-smoke.sh
#
# Each line: PASS/FAIL, account, check, expected → actual.
set -u
V="${V:-https://loan-management-system-beta-pearl.vercel.app}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0

report() { # expected actual account check
  if [ "$1" = "$2" ]; then printf 'PASS  %-28s %-38s %s\n' "$3" "$4" "$2"
  else printf 'FAIL  %-28s %-38s expected %s, got %s\n' "$3" "$4" "$1" "$2"; FAILS=$((FAILS + 1)); fi
}

login() { # email password → sets JAR; prints login status + cookie flags
  JAR="$TMP/jar-$1"
  local status flags
  status=$(curl -s --max-time 90 -c "$JAR" -D "$TMP/hdr" -o "$TMP/body" -w '%{http_code}' \
    -H 'Content-Type: application/json' -H "Origin: $V" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" "$V/api/v1/auth/login")
  report 200 "$status" "$1" "login"
  flags=$(grep -i '^set-cookie: lms_token=' "$TMP/hdr" | grep -oiE 'httponly|secure|samesite=lax' | tr '[:upper:]' '[:lower:]' | sort -u | tr '\n' ' ')
  report "httponly samesite=lax secure " "$flags" "$1" "cookie flags"
  [ "$status" = 200 ]
}

api() { # account path expected
  local status count
  status=$(curl -s --max-time 60 -b "$JAR" -o "$TMP/body" -w '%{http_code}' "$V$2")
  count=$(grep -oE '"totalItems":[0-9]+' "$TMP/body" | head -1 | cut -d: -f2)
  report "$3" "$status" "$1" "GET $2${count:+ ($count items)}"
}

page() { # account path expected-location-path
  local location
  location=$(curl -s --max-time 60 -b "$JAR" -o /dev/null -w '%{redirect_url}' "$V$2" | sed "s#^$V##")
  report "$3" "${location:-<no redirect>}" "$1" "page $2 redirects to"
}

logout() {
  curl -s --max-time 60 -b "$JAR" -X POST -H 'Content-Type: application/json' -H "Origin: $V" -d '{}' -o /dev/null "$V/api/v1/auth/logout"
}

account() { # email password home api-ok... -- forbidden-api forbidden-page
  local email=$1 password=$2 home=$3; shift 3
  login "$email" "$password" || return
  page "$email" / "$home"
  while [ "$1" != "--" ]; do api "$email" "$1" 200; shift; done
  shift
  api "$email" "$1" 403
  page "$email" "$2" /forbidden
  logout
}

echo "Live smoke test of $V ($(date '+%Y-%m-%d %H:%M'))"
echo "== Demo accounts (Password@123)"
account admin@lms.dev Password@123 /dashboard /api/v1/dashboard/summary /api/v1/leads /api/v1/loans /api/v1/admin/users -- /api/v1/borrower/progress /apply
account sales@lms.dev Password@123 /dashboard/sales /api/v1/leads -- /api/v1/loans /dashboard/sanction
account sanction@lms.dev Password@123 /dashboard/sanction /api/v1/loans -- /api/v1/leads /dashboard/collection
account disbursement@lms.dev Password@123 /dashboard/disbursement /api/v1/loans -- /api/v1/admin/users /dashboard/staff
account collection@lms.dev Password@123 /dashboard/collection /api/v1/loans -- /api/v1/dashboard/summary /dashboard/sales
account borrower@lms.dev Password@123 /apply /api/v1/borrower/progress /api/v1/borrower/loans -- /api/v1/loans /dashboard
account demo.closed@lms.dev Password@123 /apply /api/v1/borrower/loans -- /api/v1/leads /dashboard

echo "== Test data (Test@1234); a failed login here means the test data is not in the database Render reads"
for email in admin1 sales1 sanction1 disbursement1 collection1 applied1 lead1; do
  if login "$email@test.lms.dev" Test@1234; then logout; fi
done

echo "Done: $FAILS failed check(s)."
