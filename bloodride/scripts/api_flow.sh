#!/usr/bin/env bash
# Runs the Sprint 1 flow against a running API (default http://localhost:8000).
#   bash scripts/api_flow.sh
set -u
API=${API:-http://localhost:8000}
KEY=${ADMIN_KEY:-change-me}
HERE=$(cd "$(dirname "$0")/.." && pwd)
PY="$HERE/backend/.venv/Scripts/python"; [ -x "$PY" ] || PY="$HERE/backend/.venv/bin/python"
TMP=$(mktemp -d)
command -v cygpath >/dev/null && TMP=$(cygpath -m "$TMP")   # Git Bash: give Windows Python the same folder
j() { "$PY" -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }
post() { curl -s -X POST -H "Content-Type: application/json" -d "${2:-{\}}" "$API$1"; echo; }

"$PY" "$HERE/backend/tests/make_sample_slip.py" "$TMP/slip.png" >/dev/null
NB=$("$PY" -c "from datetime import datetime,timedelta;print((datetime.now()+timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M'))")

echo "1) guest request, AB-, Dhaka Medical College"
R=$(curl -s -F hospital_id=1 -F "full_name=Rahim Uddin" -F phone=01611111111 -F blood_group=AB- \
         -F bags_needed=1 -F urgency=emergency -F needed_by=$NB -F "slip=@$TMP/slip.png;type=image/png" "$API/api/requests")
echo "$R"
TOK=$(echo "$R" | j "['tracking_token']"); RID=$(echo "$R" | j "['request_id']")

echo "2) the same slip photo again (must be refused)"
curl -s -F hospital_id=1 -F "full_name=Someone Else" -F phone=01622222222 -F blood_group=AB- -F bags_needed=1 \
     -F urgency=urgent -F needed_by=$NB -F "slip=@$TMP/slip.png;type=image/png" "$API/api/requests"; echo

echo "3) admin queue (slips OCR could not read; the request is live anyway)"
curl -s -H "X-Admin-Key: $KEY" "$API/api/admin/slips"; echo

echo "4) board after alerts"; curl -s "$API/api/track/$TOK"; echo
D1=302; D2=303
echo "5) donor $D1 opens the alert, accepts and shares their number"
post "/api/alerts/$RID/$D1/seen"; post "/api/alerts/$RID/$D1/accept" '{"share_phone":true}'
echo "6) donor $D2 accepts too late -> backup; then tries again -> already answered"
post "/api/alerts/$RID/$D2/accept"; post "/api/alerts/$RID/$D2/accept"
echo "7) another alerted donor (75) declines; donor 5 was never alerted"
post "/api/alerts/$RID/75/decline"; post "/api/alerts/$RID/5/decline"
echo "8) final board"; curl -s "$API/api/track/$TOK"; echo
echo "tracking page: http://localhost:3000/track/$TOK"
rm -rf "$TMP"
