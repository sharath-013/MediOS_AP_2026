# MediOS_AP_2026
MediOS is an enterprise-level RESTful backend built with Node.js, Express.js, and PostgreSQL (via Prisma ORM) to manage core clinical workflows and reporting. The platform handles patient registration, doctor scheduling, and transactional billing, while leveraging advanced SQL engineering—including Common Table Expressions (CTEs), correlated subqueries, database views, and atomic multi-model transactions—to deliver high-performance analytics and enforce strict relational data integrity


## Project Structure

```
MediOS_AP_2026/
├── dbms/                       # Database project (DBMS)
│   ├── 01_normalization.md
│   ├── 02_er_diagram.png
│   ├── 03_schema.sql           # Plain SQL version of the 7 tables
│   ├── 04_queries.sql
│   └── 05_query_timings.md
├── prisma/
│   └── schema.prisma           # Tables and relations (same 7 tables)
├── src/
│   ├── routes/
│   │   ├── patients.js         # Patient endpoints + validation + database calls
│   │   ├── doctors.js          # Doctor endpoints + schedule
│   │   └── appointments.js     # Booking, status, billing (transaction)
│   ├── db.js                   # Prisma client
│   ├── errors.js               # fail() helper, 404 and error handler
│   └── logger.js               # Request logger (writes logs/access.log)
├── .env.example                # Copy to .env and set DATABASE_URL
├── package.json
└── server.js                   # Starts the app and connects everything
```

Each route file holds everything for one topic, so a feature can be read top to bottom
in one place. `logs/access.log` is created automatically when the server runs.

## Running the project

```bash
npm install
cp .env.example .env               # then set DATABASE_URL
npx prisma db push                 # create tables from schema.prisma
npm run dev
```

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/patients` | List / register patients |
| GET / PUT / DELETE | `/api/patients/:id` | Read (with appointments) / update / delete |
| GET / POST | `/api/doctors` | List / create doctors |
| GET / PUT / DELETE | `/api/doctors/:id` | Read / update / delete |
| GET | `/api/doctors/:id/schedule?date=YYYY-MM-DD` | A doctor's appointments for one day |
| GET / POST | `/api/appointments` | List / book appointments |
| GET / DELETE | `/api/appointments/:id` | Read (with invoice) / delete |
| PATCH | `/api/appointments/:id/status` | Change appointment status |
| POST | `/api/appointments/:id/bill` | Atomically complete the appointment and create its invoice |
| GET | `/health` | Health check |

## API Checks and Results

Run against a temporary PostgreSQL database with the schema pushed by Prisma
(seeded with one department and two services). All checks passed.

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Create patient | 201 | 201 Pass |
| 2 | Create patient with duplicate email | 409 | 409 Pass |
| 3 | Create patient with invalid phone | 400 | 400 Pass |
| 4 | Create doctor | 201 | 201 Pass |
| 5 | Create doctor with nonexistent department | 409 | 409 Pass |
| 6 | Book appointment | 201 | 201 Pass |
| 7 | Double-book the same doctor, date and time | 409 | 409 Pass |
| 8 | Doctor schedule for a date | 200, shows booking | 200 Pass |
| 9 | Bill with one unknown service | 400, no changes saved | 400, appointment stayed `SCHEDULED` (transaction rolled back) Pass |
| 10 | Bill with valid services | 201, invoice created | 201, `charged_price` copied from `list_price` Pass |
| 11 | Bill the same appointment again | 409 | 409 Pass |
| 12 | Delete patient who has appointments | 409 (`RESTRICT`) | 409 Pass |
| 13 | Get a missing patient | 404 | 404 Pass |
| 14 | Unknown route | 404 JSON | 404 Pass |
