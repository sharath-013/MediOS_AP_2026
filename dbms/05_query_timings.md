# Query Timings: MediOS

This file shows how fast every SQL query of MediOS runs. The queries are in `dbms/04_queries.sql` and the tables are in `dbms/03_schema.sql`.

## 1. How we measured
| Item | Value |
|---|---|
| PostgreSQL version | TODO (run `SELECT version();`) |
| Laptop | TODO (model, CPU, RAM) |
| Data | **Generated sample data** from `dbms/seed_sample_data.sql`, not real patients |
| Indexes | TODO (only the automatic ones from PRIMARY KEY and UNIQUE, or write which indexes we added) |

Rows in the database:

| Table | Rows |
|---|---:|
| departments | TODO |
| doctors | TODO |
| patients | TODO |
| services | TODO |
| appointments | TODO |
| invoices | TODO |
| invoice_items | TODO |

Method:
1. Every query runs with `EXPLAIN (ANALYZE, BUFFERS)` and we read the `Execution Time`.
2. Every query runs **3 times** and we take the **average**.
3. Write queries run inside `BEGIN; ... ROLLBACK;` so the data does not change.
4. We closed other heavy applications while measuring.

Command we used:
```bash
python3 dbms/run_timings.py <our_database> dbms/04_queries.sql dbms/05_query_timings.md dbms/plans
```
It saved the full plan of every run in `dbms/plans/` (one file for each query, for example `dbms/plans/R1.txt`). **Every number below is copied from those plan files.**

## 2. Timing table
| Query | Type | What it does | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Average (ms) | Scan type |
|-------|------|--------------|-----------:|-----------:|-----------:|-------------:|-----------|
| R1 | READ | Find a patient by email | | | | | |
| R2 | READ | Doctor's schedule for one day | | | | | |
| R3 | READ | Appointment history of one patient | | | | | |
| R4 | READ | One invoice with all its services | | | | | |
| R5 | READ | Total of one invoice (uses the view) | | | | | |
| R6 | READ | Unpaid invoices older than 7 days, with the patient | | | | | |
| R7 | READ | Revenue of every department for every month (CTE) | | | | | |
| R8 | READ | Top 5 doctors by revenue (CTE with RANK) | | | | | |
| R9 | READ | Doctors above the average invoice of their department (CTEs) | | | | | |
| R10 | READ | Patients with no appointment in the last 6 months (NOT EXISTS) | | | | | |
| W1 | WRITE | Register a new patient | | | | | |
| W2 | WRITE | Book an appointment | | | | | |
| W3 | WRITE | Complete an appointment and create its invoice (one statement inside a transaction) | | | | | |
| W4 | WRITE | Mark an invoice as paid | | | | | |
| W5 | WRITE | Cancel an appointment | | | | | |

For W3 we measure the single statement that changes the three tables. The `BEGIN;` and `COMMIT;` around it are not part of the measurement.

## 3. Why each query is fast or slow
`TODO: for each query, one line from its plan: the scan type and why. For example "R1: Index Scan on patients_email_key, because email is UNIQUE".` The scan type column above is copied from the plan. Hints on what to look for:
- **R1** uses `email`, which has a UNIQUE index.
- **R2** filters by doctor and date. The UNIQUE rule `(doctor_id, appointment_date, start_time)` starts with these two columns.
- **R3** filters by `patient_id`. Is there an index that starts with `patient_id`?
- **R4, R5** look up one invoice by its primary key.
- **R6, R7, R8, R9, R10** read many rows (the report queries). Check the join order and if a Seq Scan appears on `appointments` or `invoices`.
- **W1 to W5**: check which indexes they must update.

## 4. What we noticed
`TODO: after running, write 3 to 5 lines in our own words: which queries are the slowest, and which index could help them. If we add an index, we measure again and write the new numbers.`
