# Campus Attendance

A local-first attendance management starter. The initial workflow uses faculty-managed sessions and QR/manual check-in; it does not collect or identify students using biometrics.

## Requirements

- Node.js LTS and npm
- Python 3.11+
- Docker Desktop only if you want PostgreSQL; SQLite works by default

## Seed local demo accounts

From the project root, after installing the backend dependencies:

```powershell
$env:PYTHONPATH = "$PWD\backend"
.\.venv\Scripts\python.exe -m app.seed_demo
```

This creates one admin, one faculty member, two students, a subject, a class section, and enrollments in `attendance.db`. It prints a random one-time password shared by the demo accounts. The command refuses to add accounts if the database already contains users.

## Start the API

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

The health endpoint is at `http://127.0.0.1:8000/health` and interactive API docs are at `http://127.0.0.1:8000/docs`.

## Start the frontend

In a second PowerShell terminal:

```powershell
$nodeRoot = Join-Path $env:LOCALAPPDATA 'Programs\node-portable\node-v26.13.0-win-x64'
$env:PATH = "$nodeRoot;$env:PATH"
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Faculty can create/end sessions and display the rotating QR code; signed-in students can scan it, and faculty/admin views update from API/database records. Browser camera access requires localhost or HTTPS.

## Optional PostgreSQL

Copy `backend/.env.example` to `backend/.env`, replace `JWT_SECRET_KEY` with a random local secret, then run `docker compose up -d db`. The database schema is created on API startup for this local MVP. Do not reuse the example database password outside local development.

## Deploy on GitHub Pages and Render

You can deploy the frontend and backend separately, or deploy the combined application on Render.

1. Push this repository to GitHub and enable **Settings > Pages > Source: GitHub Actions**.
2. In Render, choose **New > Blueprint** and select this repository.
3. Add `FRONTEND_ORIGINS` in Render for the Pages URL, for example `https://YOUR-USERNAME.github.io/qr_based_attend`, without a trailing slash.
4. Copy the Render API service URL and add it as the GitHub Actions repository variable `VITE_API_BASE_URL` (for example `https://campus-attendance-api.onrender.com`).
5. Push to `main` or run the **Deploy frontend to GitHub Pages** workflow.

The backend has PostgreSQL support and the frontend build is configured automatically for this repository's GitHub Pages path. Do not commit `.env` files or database files.

## Current scope

This local MVP includes password-hashed demo accounts, role checks, admin student/faculty/subject/class/enrollment forms, faculty QR sessions that rotate every 2 minutes, student check-in/history, duplicate prevention, and audited manual check-in. Student records include a name, HT number, branch, batch, and semester; a sign-in email and temporary password are also required. It does not identify faces, prove physical presence from a camera. Institutional SSO, CSV import, production hardening, and a real roster integration remain future work. Keep `.env` files and real student records out of source control.
