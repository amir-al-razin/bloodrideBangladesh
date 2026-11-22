# Local database for BloodRide (PostgreSQL 18 + PostGIS 3.7), kept inside the project in .pgdata.
#   .\scripts\db.ps1 init    first time: create the server folder, start it, build the database
#   .\scripts\db.ps1 start   start the server (port 5433)
#   .\scripts\db.ps1 stop    stop the server
#   .\scripts\db.ps1 reset   drop and rebuild the database from db/*.sql (deletes all data)
#   .\scripts\db.ps1 psql    open psql on the database
param([Parameter(Mandatory)][ValidateSet("init", "start", "stop", "reset", "psql")] [string]$cmd)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $root ".pgdata"
$port = 5433
$pgbin = "C:\Program Files\PostgreSQL\18\bin"
if (Test-Path $pgbin) { $env:PATH = "$pgbin;$env:PATH" }

function Start-Db {
    # Start the server in its own hidden window. If it shared this terminal, closing the terminal
    # would leave it unable to start new connections on Windows (error 0xC0000142).
    $log = Join-Path $data "server.log"
    $p = Start-Process pg_ctl -ArgumentList "-D `"$data`" -l `"$log`" -w start" -WindowStyle Hidden -PassThru
    $p.WaitForExit()                       # waits for pg_ctl only, not for the server it started
    pg_isready -h localhost -p $port -q
    if ($LASTEXITCODE -ne 0) { throw "The database did not start. See $log" }
    Write-Host "database started"
}
function Reset-Db {
    psql -p $port -U postgres -qAtc "DROP DATABASE IF EXISTS bloodride WITH (FORCE)"
    psql -p $port -U postgres -qAtc "CREATE DATABASE bloodride"
    psql -p $port -U postgres -d bloodride -q -v ON_ERROR_STOP=1 -f (Join-Path $root "db\build.sql")
    $uploads = Join-Path $root "backend\uploads"
    if (Test-Path $uploads) { Remove-Item "$uploads\*" -Force -ErrorAction SilentlyContinue }
}

switch ($cmd) {
    "init" {
        if (Test-Path $data) { throw ".pgdata already exists; use 'start' or 'reset'" }
        initdb -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C -c listen_addresses=localhost -c port=$port
        Start-Db
        Reset-Db
    }
    "start" { Start-Db }
    "stop"  { pg_ctl -D $data -w stop }
    "reset" { Reset-Db }
    "psql"  { psql -p $port -U postgres -d bloodride }
}
