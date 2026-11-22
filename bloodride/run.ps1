# Runs the whole BloodRide prototype with one command:
#   .\run.ps1            database + API + website (development mode, pages reload on save)
#   .\run.ps1 -Prod      build the website first, then run it in production mode
#   .\run.ps1 -Keep      keep the data from the last run. By default every run starts from a fresh
#                        database with sample data (testing phase), so test slip photos can be reused.
# The first run sets everything up (database server, Python packages, npm packages).
# Open http://localhost:3000 . Press Ctrl+C to stop the API and the website
# (the database keeps running; stop it with  .\scripts\db.ps1 stop).
param([switch]$Prod, [switch]$Keep)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pgbin = "C:\Program Files\PostgreSQL\18\bin"
if (Test-Path $pgbin) { $env:PATH = "$pgbin;$env:PATH" }

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`n$text" -ForegroundColor Red; exit 1 }
function Port-Busy($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

# ---------------------------------------------------------------- checks
foreach ($tool in "pg_ctl", "psql", "python", "npm") {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "'$tool' was not found. See README.md (Setup)." }
}
foreach ($port in 8000, 3000) {
    if (Port-Busy $port) { Fail "Port $port is already in use (an earlier run still open?). Close it, or stop that process, and run again." }
}

# ---------------------------------------------------------------- database
Step "Database (PostgreSQL 18 + PostGIS, port 5433)"
$data = Join-Path $root ".pgdata"
if (-not (Test-Path $data)) {
    & (Join-Path $root "scripts\db.ps1") init
} else {
    pg_isready -h localhost -p 5433 -q
    if ($LASTEXITCODE -eq 0) {
        Write-Host "already running"
    } else {
        # not answering: if a broken server is still around (e.g. its terminal was closed), stop it first
        pg_ctl -D $data status *> $null
        if ($LASTEXITCODE -eq 0) { Write-Host "database not answering, restarting it"; pg_ctl -D $data -m fast -w stop *> $null }
        & (Join-Path $root "scripts\db.ps1") start
    }
}
# testing phase: every run starts from a clean database (sample data, no requests, uploads cleared)
if ($Keep) { Write-Host "keeping the data from the last run (-Keep)" }
else { Write-Host "fresh database for this run (use -Keep to keep data)"; & (Join-Path $root "scripts\db.ps1") reset }

# ---------------------------------------------------------------- backend
Step "Backend (FastAPI)"
$backend = Join-Path $root "backend"
$py = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "first run: creating the Python environment"
    python -m venv (Join-Path $backend ".venv")
    & $py -m pip install -q --upgrade pip
    & $py -m pip install -q -r (Join-Path $backend "requirements.txt")
}
$envFile = Join-Path $backend ".env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $backend ".env.example") $envFile; Write-Host "created backend\.env from .env.example" }

# ---------------------------------------------------------------- frontend
Step "Frontend (Next.js)"
$frontend = Join-Path $root "frontend"
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "first run: npm install"
    Push-Location $frontend; npm install --no-fund --no-audit; Pop-Location
}
if ($Prod) {
    Write-Host "building the website"
    Push-Location $frontend; npm run build; $ok = $LASTEXITCODE -eq 0; Pop-Location
    if (-not $ok) { Fail "Website build failed (see above)." }
}

# ---------------------------------------------------------------- start
Step "Starting"
$api = Start-Process $py -ArgumentList "run.py" -WorkingDirectory $backend -NoNewWindow -PassThru
$web = $null
try {
    for ($i = 0; $i -lt 40 -and -not (Port-Busy 8000); $i++) {
        if ($api.HasExited) { Fail "The API stopped while starting (see the messages above)." }
        Start-Sleep -Milliseconds 500
    }
    $npmArgs = if ($Prod) { "run start" } else { "run dev" }
    $web = Start-Process "npm.cmd" -ArgumentList $npmArgs -WorkingDirectory $frontend -NoNewWindow -PassThru

    for ($i = 0; $i -lt 60 -and -not (Port-Busy 3000); $i++) { Start-Sleep -Milliseconds 500 }
    Write-Host "`nBloodRide is running:" -ForegroundColor Green
    Write-Host "  website   http://localhost:3000"
    Write-Host "  API       http://localhost:8000/docs"
    Write-Host "  admin key ADMIN_KEY in backend\.env (default: change-me)"
    Write-Host "Press Ctrl+C to stop.`n"

    while (-not $api.HasExited -and -not $web.HasExited) { Start-Sleep -Seconds 1 }
    if ($api.HasExited) { Write-Host "The API stopped." -ForegroundColor Yellow }
    if ($web.HasExited) { Write-Host "The website stopped." -ForegroundColor Yellow }
}
finally {
    # stop both, including their child processes (npm starts node; Ctrl+C also lands here)
    foreach ($p in @($web, $api)) {
        if ($p -and -not $p.HasExited) { taskkill /PID $p.Id /T /F *> $null }
    }
    Write-Host "Stopped the API and the website. (Database still running: .\scripts\db.ps1 stop)"
}
