-- =====================================================
-- 04_queries.sql  (AP project: MediOS)
-- All the SQL queries our app uses, written for the tables in dbms/03_schema.sql.
--
-- How it is organised:
--   * Every query has an id: R1, R2, ... for reads and W1, W2, ... for writes.
--   * Every query is marked "-- READ" or "-- WRITE".
--   * We use JOINs wherever we can, and the advanced SQL that MediOS needs:
--     a VIEW, CTEs, correlated subqueries and an atomic transaction.
--   * The values (ids, dates, e-mail) are examples. In the app (Prisma and
--     Express) they come from the API request.
--
-- How to run: first dbms/03_schema.sql, then this file.
-- =====================================================


-- =====================================================
-- Supporting view
-- The invoice total is not stored in a table (see 01_normalization.md, section 6).
-- This view calculates it, so every query can reuse it.
-- =====================================================
CREATE OR REPLACE VIEW v_invoice_totals AS
SELECT i.invoice_no,
       i.appointment_id,
       i.invoice_date,
       i.payment_status,
       i.payment_method,
       sum(ii.quantity * ii.charged_price) AS total_amount
FROM invoices i
JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
GROUP BY i.invoice_no;


-- =====================================================
-- READ queries
-- =====================================================

-- READ R1: Find a patient by email (patient search / registration check)
SELECT patient_id, first_name, last_name, phone, date_of_birth, gender
FROM patients
WHERE email = 'ravi@x.com';


-- READ R2: Doctor's schedule for one day, in time order
SELECT a.appointment_id, a.start_time, a.status,
       p.first_name, p.last_name, p.phone
FROM appointments a
JOIN patients p ON p.patient_id = a.patient_id
WHERE a.doctor_id = 1
  AND a.appointment_date = '2026-11-20'
ORDER BY a.start_time;


-- READ R3: Appointment history of one patient, newest first
SELECT a.appointment_id, a.appointment_date, a.start_time, a.status,
       d.doctor_name, d.specialization, dep.department_name
FROM appointments a
JOIN doctors d      ON d.doctor_id = a.doctor_id
JOIN departments dep ON dep.department_id = d.department_id
WHERE a.patient_id = 1
ORDER BY a.appointment_date DESC, a.start_time DESC;


-- READ R4: One invoice with all its services (the bill the patient sees)
SELECT i.invoice_no, i.invoice_date, i.payment_status,
       s.service_name, ii.quantity, ii.charged_price,
       ii.quantity * ii.charged_price AS line_total
FROM invoices i
JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
JOIN services s       ON s.service_code = ii.service_code
WHERE i.invoice_no = 1
ORDER BY s.service_name;


-- READ R5: Total of one invoice (uses the view)
SELECT invoice_no, payment_status, total_amount
FROM v_invoice_totals
WHERE invoice_no = 1;


-- READ R6: Unpaid invoices older than 7 days, with the patient to contact
SELECT v.invoice_no, v.invoice_date, v.total_amount,
       p.first_name, p.last_name, p.phone
FROM v_invoice_totals v
JOIN appointments a ON a.appointment_id = v.appointment_id
JOIN patients p     ON p.patient_id = a.patient_id
WHERE v.payment_status = 'PENDING'
  AND v.invoice_date < CURRENT_DATE - INTERVAL '7 days'
ORDER BY v.invoice_date;


-- READ R7: Revenue of every department for every month (CTE)
-- Step 1 (paid): one row for every paid invoice with its department.
-- Step 2: add the totals for every department and month.
WITH paid AS (
    SELECT dep.department_name, v.invoice_date, v.total_amount
    FROM v_invoice_totals v
    JOIN appointments a  ON a.appointment_id = v.appointment_id
    JOIN doctors d       ON d.doctor_id = a.doctor_id
    JOIN departments dep ON dep.department_id = d.department_id
    WHERE v.payment_status = 'PAID'
)
SELECT department_name,
       date_trunc('month', invoice_date)::date AS month,
       sum(total_amount) AS revenue
FROM paid
GROUP BY department_name, date_trunc('month', invoice_date)
ORDER BY month, revenue DESC;


-- READ R8: Top 5 doctors by revenue (CTE with RANK)
WITH doctor_revenue AS (
    SELECT d.doctor_id, d.doctor_name, sum(v.total_amount) AS revenue
    FROM doctors d
    JOIN appointments a      ON a.doctor_id = d.doctor_id
    JOIN v_invoice_totals v  ON v.appointment_id = a.appointment_id
    WHERE v.payment_status = 'PAID'
    GROUP BY d.doctor_id, d.doctor_name
)
SELECT doctor_id, doctor_name, revenue,
       RANK() OVER (ORDER BY revenue DESC) AS position
FROM doctor_revenue
ORDER BY position
LIMIT 5;


-- READ R9: Doctors whose average invoice is above the average of their own department
-- (correlated subquery: the inner query uses the department of the current doctor)
SELECT d.doctor_id, d.doctor_name,
       round(avg(v.total_amount), 2) AS doctor_average
FROM doctors d
JOIN appointments a     ON a.doctor_id = d.doctor_id
JOIN v_invoice_totals v ON v.appointment_id = a.appointment_id
GROUP BY d.doctor_id, d.doctor_name, d.department_id
HAVING avg(v.total_amount) > (SELECT avg(v2.total_amount)
                              FROM v_invoice_totals v2
                              JOIN appointments a2 ON a2.appointment_id = v2.appointment_id
                              JOIN doctors d2      ON d2.doctor_id = a2.doctor_id
                              WHERE d2.department_id = d.department_id)
ORDER BY doctor_average DESC;


-- READ R10: Patients with no appointment in the last 6 months (correlated NOT EXISTS)
SELECT p.patient_id, p.first_name, p.last_name, p.phone
FROM patients p
WHERE NOT EXISTS (SELECT 1 FROM appointments a
                  WHERE a.patient_id = p.patient_id
                    AND a.appointment_date >= CURRENT_DATE - INTERVAL '6 months')
ORDER BY p.last_name, p.first_name;


-- =====================================================
-- WRITE queries
-- =====================================================

-- WRITE W1: Register a new patient (returns the new id)
INSERT INTO patients (first_name, last_name, phone, email, date_of_birth, gender)
VALUES ('Anita', 'Verma', '9123456780', 'anita.verma@x.com', '1995-03-14', 'FEMALE')
RETURNING patient_id;


-- WRITE W2: Book an appointment
-- If the doctor already has an appointment at this date and time, the UNIQUE rule
-- (doctor_id, appointment_date, start_time) skips the insert and no row is returned.
-- The API then tells the user that the slot is taken.
INSERT INTO appointments (appointment_date, start_time, patient_id, doctor_id)
VALUES ('2026-11-21', '11:30', 1, 1)
ON CONFLICT (doctor_id, appointment_date, start_time) DO NOTHING
RETURNING appointment_id;


-- WRITE W3: Complete an appointment and create its invoice (atomic transaction)
-- Three tables change together: appointments, invoices and invoice_items.
-- If any step fails, nothing is saved (all or nothing).
-- charged_price is copied from services.list_price on the day of billing.
BEGIN;

WITH done AS (
    UPDATE appointments
    SET status = 'COMPLETED'
    WHERE appointment_id = 1 AND status = 'SCHEDULED'
    RETURNING appointment_id
), new_invoice AS (
    INSERT INTO invoices (appointment_id)
    SELECT appointment_id FROM done
    RETURNING invoice_no
)
INSERT INTO invoice_items (invoice_no, service_code, quantity, charged_price)
SELECT n.invoice_no, s.service_code, 1, s.list_price
FROM new_invoice n
CROSS JOIN services s
WHERE s.service_code IN ('S1', 'S2');

COMMIT;


-- WRITE W4: Mark an invoice as paid (only if it is still pending)
UPDATE invoices
SET payment_status = 'PAID', payment_method = 'UPI'
WHERE invoice_no = 1 AND payment_status = 'PENDING';


-- WRITE W5: Cancel an appointment that has not happened yet
UPDATE appointments
SET status = 'CANCELLED'
WHERE appointment_id = 2 AND status = 'SCHEDULED';
