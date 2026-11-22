# BloodRide

Find a blood donor near the hospital in Dhaka, and get far donors there and back with a student volunteer rider.

Test repository for the team; the work will move to the main repository later.

| Folder | What it is |
|---|---|
| [`bloodride/`](bloodride/) | Sprint 1 prototype: PostgreSQL + PostGIS database, FastAPI backend, Next.js website. Setup and run steps are in [`bloodride/README.md`](bloodride/README.md) |
| [`BloodRide_2026-11-21/`](BloodRide_2026-11-21/) | Project documents: [`summary.md`](BloodRide_2026-11-21/summary.md) (start here), [`WORKFLOW.md`](BloodRide_2026-11-21/WORKFLOW.md), the product backlog, and the DBMS and SD proposal PDFs |

## Quick start (Windows)

You need PostgreSQL 18 with PostGIS 3.7, Python 3.12+ and Node 20+. Then:

```powershell
cd bloodride
.\run.cmd
```

Open http://localhost:3000. Each run starts from a fresh database with sample data.
