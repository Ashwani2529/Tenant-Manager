# Homely Tenants

A responsive tenant-management application for one property. The owner manages rooms, tenants, daily rent, per-room electricity, payments and audited corrections. Tenants receive read-only access to their own ledger, usage, receipts, notifications and Admin activity.

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set the Atlas URI and private secrets.
2. Optionally copy `frontend/.env.example` to `frontend/.env` when the API does not run at `http://localhost:5000`.
3. Run `npm install` and `npm run dev` inside both `backend` and `frontend`.
4. Open `http://localhost:5173`. On first use, create the single owner account with `ADMIN_SETUP_KEY`.

Passwords are stored as scrypt hashes. Existing passwords cannot be viewed; the owner can issue a new temporary password.

## Daily billing scheduler

The free external scheduler makes two daily POST requests. Render schedules and most external schedulers use UTC:

- `18:25 UTC` (`23:55 IST`): `POST https://YOUR-API/api/system/wake`
- `18:30 UTC` (`00:00 IST`): `POST https://YOUR-API/api/system/daily`

Send this header with both requests:

```text
x-cron-secret: YOUR_CRON_SECRET
```

Configure the scheduler to retry failed requests for at least a few minutes because a free Render service can take about a minute to wake. The daily endpoint is idempotent: a unique tenant/date key prevents duplicate rent, and the next successful run catches up missing dates.

## Render deployment

Backend web service:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Environment: `MONGO_URI`, `JWT_SECRET`, `CRON_SECRET`, `ADMIN_SETUP_KEY`, `CLIENT_ORIGIN`

Frontend static site:

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment: `VITE_API_URL=https://YOUR-API/api`

Set `CLIENT_ORIGIN` to the deployed frontend origin. Multiple origins can be comma-separated.

## Verification

```text
cd backend  && npm run check && npm test
cd frontend && npm run lint  && npm run build
```
