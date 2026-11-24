#!/usr/bin/env bash
# Runs the whole Stage 1 flow against the running site (default http://localhost:3000, which forwards /api
# to FastAPI): request -> staff approval -> donors alerted -> donors answer -> widening search.
#   bash scripts/api_flow.sh
# Uses a fresh database's demo accounts (password bloodride123). Run it on a fresh database.
set -u
API=${API:-http://localhost:3000}
HERE=$(cd "$(dirname "$0")/.." && pwd)
PY="$HERE/backend/.venv/Scripts/python"; [ -x "$PY" ] || PY="$HERE/backend/.venv/bin/python"
TMP=$(mktemp -d)
command -v cygpath >/dev/null && TMP=$(cygpath -m "$TMP")   # Git Bash: give Windows Python the same folder
j() { "$PY" -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }
login() { curl -s -c "$TMP/$1.jar" -H "Content-Type: application/json" -d "{\"phone\":\"$2\",\"password\":\"bloodride123\"}" "$API/api/auth/login" >/dev/null; }
as() { local who=$1; shift; curl -s -b "$TMP/$who.jar" "$@"; echo; }

"$PY" "$HERE/backend/tests/make_sample_slip.py" "$TMP/slip.png" >/dev/null
NB=$("$PY" -c "from datetime import datetime,timedelta;print((datetime.now()+timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M'))")

echo "1) a family sends an AB- request at Dhaka Medical College (no account)"
R=$(curl -s -F hospital_id=1 -F "full_name=Rahim Uddin" -F phone=01611111111 -F blood_group=AB- \
         -F bags_needed=1 -F urgency=emergency -F needed_by=$NB -F "slip=@$TMP/slip.png;type=image/png" "$API/api/requests")
echo "$R"
TOK=$(echo "$R" | j "['tracking_token']"); RID=$(echo "$R" | j "['request_id']")

echo "2) nobody is alerted yet: the tracking page waits for the hospital"
curl -s "$API/api/track/$TOK" | j "['slip_status'], d['alerted']"

echo "3) the same slip photo again is refused"
curl -s -F hospital_id=1 -F "full_name=Someone Else" -F phone=01622222222 -F blood_group=AB- -F bags_needed=1 \
     -F urgency=urgent -F needed_by=$NB -F "slip=@$TMP/slip.png;type=image/png" "$API/api/requests"; echo

echo "4) staff of ANOTHER hospital (BMU) cannot see or approve it"
login bmu 01500000002
as bmu "$API/api/staff/queue"
as bmu -X POST "$API/api/staff/requests/$RID/approve"

echo "5) Dhaka Medical College's blood bank sees it and approves: round 1 goes out"
login dmch 01500000001
as dmch "$API/api/staff/queue" | head -c 300; echo
as dmch -X POST "$API/api/staff/requests/$RID/approve"

echo "6) tracking page now"
curl -s "$API/api/track/$TOK" | j "['slip_status'], d['alerted'], d['rounds'], d['radius_km']"

echo "7) Demo Donor One signs in, sees the alert, opens it and accepts, sharing their number"
login one 01800000001
as one "$API/api/me/alerts" | head -c 300; echo
as one -X POST "$API/api/alerts/$RID/seen"
as one -X POST -H "Content-Type: application/json" -d '{"share_phone":true}' "$API/api/alerts/$RID/accept"

echo "8) Demo Donor Two accepts too late: backup"
login two 01800000002
as two -X POST -H "Content-Type: application/json" -d '{"share_phone":false}' "$API/api/alerts/$RID/accept"

echo "9) final board: the family can call donor one"
curl -s "$API/api/track/$TOK" | j "['status'], d['accepted'], d['backup'], d['donors']"

echo "10) a new donor signs up and can sign in"
curl -s -c "$TMP/new.jar" -H "Content-Type: application/json" \
  -d '{"full_name":"Nusrat Jahan","phone":"01912345678","password":"secret12","blood_group":"O+","lat":23.7465,"lng":90.376,"listed_for_reveal":true}' \
  "$API/api/auth/signup"; echo
as new "$API/api/me/profile" | j "['full_name'], d['blood_group'], d['is_available']"

echo "tracking page: $API/track/$TOK"
