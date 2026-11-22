@echo off
rem Double-click or type "run" to start BloodRide (database + API + website).
rem Options are passed through, e.g.  run -Prod   or   run -Keep  (keep data; default is a fresh database)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
