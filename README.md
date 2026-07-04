# CareFlow — Healthcare Appointment & Follow-up Manager

CareFlow is a full-stack clinic workflow for patients, doctors, and administrators. Patients can find a specialist, hold a slot, book with symptoms, reschedule, cancel, and read prescriptions. Doctors get an AI-assisted pre-visit brief, record notes, create a patient-friendly summary, prescribe medicine, and schedule reminders. Administrators manage doctors and leave conflicts.

## Features

- JWT authentication with Patient, Doctor, and Admin authorization
- Modern responsive React UI with separate role dashboards
- Doctor search, live availability, five-minute slot holds, booking, cancellation, and rescheduling
- MongoDB-level protection against simultaneous double booking
- Doctor leave handling with appointment cancellation and patient email
- Failure-tolerant OpenAI or Gemini summaries stored in MongoDB
- Nodemailer delivery with persisted status and three-attempt retry handling
- Google Calendar event create/update/delete with OAuth 2.0
- Appointment and medication reminders using node-cron
- Seeded demo users, appointments, visit summary, and prescription

> Medical safety: AI text is only an organizational aid. It is not diagnosis or emergency guidance.

## Tech stack

React 18, Vite, Tailwind CSS, Lucide icons, Node.js, Express, MongoDB/Mongoose, JWT, Nodemailer, Google Calendar API, OpenAI/Gemini, and node-cron.

## Folder structure

```text
doctor/
├── backend/
│   ├── controllers/       # Route behavior
│   ├── middleware/        # JWT and role checks
│   ├── models/            # Seven Mongoose models
│   ├── routes/            # REST and Google OAuth routes
│   ├── services/          # AI, email, calendar, cron, reminders
│   ├── test/              # Fast unit tests
│   ├── utils/             # Date/time and HTTP helpers
│   ├── app.js             # Express app (testable, no listener)
│   ├── server.js          # Mongo connection and listener
│   └── seed.js            # Demo data
├── frontend/
│   ├── src/components/    # App shell and shared UI
│   ├── src/pages/         # Patient, doctor, admin pages
│   ├── src/utils/api.js   # API client
│   └── vite.config.js     # Local API proxy
└── README.md
```

## Run locally — step by step

### 1. Prerequisites

Install Node.js 18+. The included local JSON development database runs without MongoDB installation. For production, use MongoDB Atlas.

### 2. Backend

```powershell
cd C:\Users\Darks\Desktop\doctor\backend
Copy-Item .env.example .env
npm install
npm run seed
npm run dev
```

The API runs at `http://localhost:5000`. Verify it with `http://localhost:5000/api/health`.

### 3. Frontend (second terminal)

```powershell
cd C:\Users\Darks\Desktop\doctor\frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

### 4. Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@careflow.demo` | `Admin123!` |
| Doctor | `doctor@careflow.demo` | `Doctor123!` |
| Patient | `patient@careflow.demo` | `Patient123!` |

Public registration intentionally creates patients only. Admins are seeded; doctors are created by an admin. This prevents role escalation from the public form.


## REST API

All private routes use `Authorization: Bearer <jwt>`.

### Auth

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register` | Public patient registration |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Signed in |

### Admin

| Method | Endpoint | Purpose |
|---|---|---|
| POST/GET | `/api/admin/doctors` | Create/list doctors |
| PUT/DELETE | `/api/admin/doctors/:id` | Update/deactivate doctor |
| POST | `/api/admin/doctors/:id/leave` | Mark leave and resolve conflicts |

### Patient

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/patient/doctors?specialisation=` | Search doctors |
| GET | `/api/patient/doctors/:id/slots?date=YYYY-MM-DD` | Available slots |
| POST | `/api/patient/appointments/hold` | Five-minute slot hold |
| POST | `/api/patient/appointments/confirm` | Confirm with symptoms |
| GET | `/api/patient/appointments` | History, summaries, prescriptions |
| PUT | `/api/patient/appointments/:id/reschedule` | Reschedule |
| DELETE | `/api/patient/appointments/:id/cancel` | Cancel |

### Doctor

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/doctor/appointments` | Assigned appointments |
| GET | `/api/doctor/appointments/:id` | Consultation detail |
| POST | `/api/doctor/appointments/:id/notes` | Notes and post-visit summary |
| POST | `/api/doctor/appointments/:id/prescription` | Prescription and reminders |

### Calendar and health

- `GET /api/health`
- `GET /api/calendar/status` (Admin)
- `GET /api/calendar/connect` (Admin; returns Google consent URL)
- `GET /api/calendar/callback` (OAuth callback)

## Database schema

| Model | Important fields |
|---|---|
| User | name, email (unique), password hash, role, isActive |
| DoctorProfile | userId (unique), specialisation, workingHours, slotDuration, leaveDays |
| Appointment | patientId, doctorId, date, slotTime, symptoms, AI output, notes, summary, status, active |
| Prescription | appointmentId (unique), patientId, doctorId, medicines[] |
| NotificationLog | type, recipient, status, retryCount, nextAttemptAt, dedupeKey |
| CalendarEvent | appointmentId (unique), providerEventId, provider, sync status |
| SlotHold | doctorId, slotDate, slotTime, patientId, expiresAt |

`Appointment` has a partial unique index on `{ doctorId, date, slotTime }` when `active: true`. `SlotHold` has a unique slot index and an `expiresAt` TTL index.

## LLM prompts

Pre-visit:

```text
Analyse these symptoms and return: urgency level Low/Medium/High, chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>
```

Post-visit:

```text
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>
```

Both outputs include provider/availability metadata and are stored on the appointment.

## Google Calendar OAuth 2.0 setup

1. In Google Cloud Console, create a project and enable **Google Calendar API**.
2. Configure the OAuth consent screen and add your Google account as a test user.
3. Create a **Web application** OAuth client.
4. Add `http://localhost:5000/api/calendar/callback` as an authorized redirect URI.
5. Put the client ID, client secret, and redirect URI in `backend/.env`; restart the API.
6. Sign in as admin and request `GET /api/calendar/connect` with the admin JWT.
7. Open the returned URL, approve access, and let Google return to the callback.
8. Copy `refreshToken` from the callback response into `GOOGLE_REFRESH_TOKEN` and restart.

Use a dedicated clinic calendar/account. For production, change the redirect URI in both Google Cloud and Render.

## Verification

```powershell
cd backend
npm test
npm run check

cd ..\frontend
npm run build
```

## System design (under 800 words)

**Double-booking prevention.** Availability checks make the UI friendly, but MongoDB is the final authority. Active appointments participate in a partial compound unique index on doctor, date, and time. If two confirmation requests race, only one insert can succeed; the other receives Mongo error 11000, translated to HTTP 409. Rescheduling is protected by the same index. Cancelled records set `active: false`, preserving history while releasing the time.

**Slot hold mechanism.** Selecting a slot creates a `SlotHold` with a unique doctor/date/time index and an expiry five minutes ahead. That unique index makes simultaneous holds atomic. Confirmation atomically finds and deletes a hold belonging to the signed-in patient and only when it has not expired, so a hold cannot be reused or stolen. A TTL index plus a one-minute cron cleanup releases abandoned holds. During confirmation an appointment briefly uses `HELD`; stale interrupted confirmations are cancelled by cron.

**Doctor leave conflicts.** Admin leave is stored on `DoctorProfile`, blocking future slot generation. The server finds active appointments on that date, marks them cancelled/inactive, deletes related holds, requests calendar deletion, and queues a personalized leave notice for each patient. Calendar or SMTP errors are isolated with settled promises, so the leave operation completes and failures remain observable.

**Notification failure handling.** Every email first becomes a `NotificationLog`. Immediate and scheduled messages share the same delivery worker. Failed attempts move to `RETRYING`, store the error, and use delayed retries; after three attempts the status becomes `FAILED`. A unique dedupe key prevents duplicate appointment and medication reminders. Cron processes due `PENDING` and `RETRYING` records in bounded batches. Thus booking and clinical writes never depend on SMTP availability.

**External-service resilience.** LLM calls have a 15-second application timeout and provider fallback. Failure stores an explicit manual-review message instead of rejecting booking. Google Calendar sync is recorded separately in `CalendarEvent`; create, update, or delete failure is visible without rolling back the healthcare record. This keeps MongoDB as the source of truth while integrations remain recoverable side effects.
