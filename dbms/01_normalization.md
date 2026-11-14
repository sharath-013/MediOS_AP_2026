# Normalization: MediOS

**App:** MediOS, a backend (Node.js, Express.js, PostgreSQL with Prisma) for patient registration, doctor scheduling and billing.
**Goal of this file:** take the data of MediOS from one big unnormalized table to 1NF, 2NF, 3NF and BCNF, and show the functional dependencies (FDs) at each step.

## 0. Assumptions
These are the business rules we used. The FDs depend on them.
1. A patient has one phone number and one email. The email is unique.
2. A doctor belongs to exactly one department, and has one specialization. A specialization does not decide the department.
3. An appointment is for one patient and one doctor. A doctor cannot have two appointments at the same date and start time.
4. Each appointment has exactly one invoice, and each invoice belongs to exactly one appointment.
5. An invoice has one or more services (consultation, ECG, blood test and so on), each with a quantity.
6. The price of a service can change later, so the invoice must remember the price that was charged at that time.
7. Service names are unique.

## 1. Unnormalized data (UNF)
At the start, all the information is kept in one record per appointment. `{ ... }` means a repeating group.

```
MEDIOS_RECORD(
  appointment_id, appointment_date, start_time, appointment_status,
  patient_id, patient_name, patient_phone, patient_email, patient_dob, patient_gender,
  doctor_id, doctor_name, specialization, department_id, department_name,
  invoice_no, invoice_date, payment_status, payment_method,
  { service_code, service_name, list_price, quantity, charged_price }
)
```

Example record:

| appointment_id | date | patient | doctor | department | invoice | services (repeating) |
|---|---|---|---|---|---|---|
| A101 | 2026-11-02 | P1, Ravi Kumar | D7, Dr. Meena Rao, Cardiology | DEP2, Cardiology | INV501, PAID, UPI | (S1, ECG, 500, 1, 500) and (S2, Consultation, 300, 1, 300) |

Problems of this design:
- **Insert anomaly:** we cannot add a new doctor or service until some appointment uses it.
- **Update anomaly:** if Dr. Meena Rao changes her specialization, we must change it in every appointment she ever had. Missing one row makes the data inconsistent.
- **Delete anomaly:** deleting the only appointment of a patient also deletes the patient's details.
- **Repeating group:** one row holds many services.

## 2. First Normal Form (1NF)
**Rule:** every column has one single value (atomic) and there are no repeating groups.

What we changed:
1. `patient_name` has two parts, so we split it into `patient_first_name` and `patient_last_name`.
2. The repeating group of services becomes **one row for each service of an appointment**.

```
R1(
  appointment_id, service_code,                       -- primary key (together)
  appointment_date, start_time, appointment_status,
  patient_id, patient_first_name, patient_last_name, patient_phone, patient_email, patient_dob, patient_gender,
  doctor_id, doctor_name, specialization, department_id, department_name,
  invoice_no, invoice_date, payment_status, payment_method,
  service_name, list_price, quantity, charged_price
)
```
**Primary key:** (appointment_id, service_code)

**Functional dependencies in R1:**
| # | FD | Kind |
|---|---|---|
| F1 | (appointment_id, service_code) → quantity, charged_price | Full dependency on the key (good) |
| F2 | appointment_id → appointment_date, start_time, appointment_status, patient_id, doctor_id, invoice_no | **Partial** (uses only a part of the key) |
| F3 | service_code → service_name, list_price | **Partial** |
| F4 | patient_id → patient_first_name, patient_last_name, patient_phone, patient_email, patient_dob, patient_gender | Transitive (through F2) |
| F5 | doctor_id → doctor_name, specialization, department_id | Transitive (through F2) |
| F6 | department_id → department_name | Transitive (through F5) |
| F7 | invoice_no → invoice_date, payment_status, payment_method | Transitive (through F2) |

R1 is in 1NF, but the appointment details are repeated for every service row, so the anomalies are still there.

## 3. Second Normal Form (2NF)
**Rule:** 1NF, and no **partial dependency**: a non-key column must depend on the **whole** key, not on a part of it.

The partial dependencies are F2 (on `appointment_id`) and F3 (on `service_code`). We move them out:

```
appointments_full(appointment_id PK, appointment_date, start_time, appointment_status,
                  patient_id, patient_first_name, patient_last_name, patient_phone, patient_email, patient_dob, patient_gender,
                  doctor_id, doctor_name, specialization, department_id, department_name,
                  invoice_no, invoice_date, payment_status, payment_method)

services(service_code PK, service_name, list_price)

appointment_services(appointment_id, service_code, quantity, charged_price)   -- PK (appointment_id, service_code)
```

Check: in `appointment_services` both `quantity` and `charged_price` need the full key (F1), so there is no partial dependency left. The three tables are in 2NF.

`appointments_full` still has the transitive dependencies F4 to F7, so it is **not** in 3NF yet.

## 4. Third Normal Form (3NF)
**Rule:** 2NF, and no **transitive dependency**: a non-key column must not depend on another non-key column.

We split `appointments_full` using F4 to F7:

| New table | Taken from | Reason |
|---|---|---|
| `patients` | F4: patient_id → patient columns | Patient details were repeated for every appointment |
| `departments` | F6: department_id → department_name | Department name was repeated for every doctor |
| `doctors` | F5: doctor_id → doctor_name, specialization, department_id | Doctor details were repeated for every appointment |
| `invoices` | F7: invoice_no → invoice columns | Invoice details belong to the invoice, not to the appointment |
| `appointments` | what is left of F2 | Only appointment facts and links remain |

Because each appointment has exactly one invoice (assumption 4), the billing rows now belong to the **invoice**, so `appointment_services` becomes `invoice_items` with key `(invoice_no, service_code)`. It carries the same information.

### Final tables (3NF)
```
patients(patient_id PK, first_name, last_name, phone, email UNIQUE, date_of_birth, gender)

departments(department_id PK, department_name UNIQUE)

doctors(doctor_id PK, doctor_name, specialization, department_id FK -> departments)

services(service_code PK, service_name UNIQUE, list_price)

appointments(appointment_id PK, appointment_date, start_time, status,
             patient_id FK -> patients, doctor_id FK -> doctors,
             UNIQUE (doctor_id, appointment_date, start_time))

invoices(invoice_no PK, appointment_id UNIQUE FK -> appointments,
         invoice_date, payment_status, payment_method)

invoice_items(invoice_no FK -> invoices, service_code FK -> services,
              quantity, charged_price,
              PK (invoice_no, service_code))
```

## 5. Boyce-Codd Normal Form (BCNF)
**Rule:** for every FD `X → Y` in a table, `X` must be a key (or a candidate key) of that table.

| Table | FDs | Is every left side a key? | BCNF? |
|---|---|---|---|
| patients | patient_id → all columns; email → patient_id | Yes: patient_id is the PK and email is a candidate key | Yes |
| departments | department_id → department_name; department_name → department_id | Yes: both are keys | Yes |
| doctors | doctor_id → doctor_name, specialization, department_id | Yes | Yes |
| services | service_code → service_name, list_price; service_name → service_code | Yes: both are keys | Yes |
| appointments | appointment_id → all columns; (doctor_id, appointment_date, start_time) → appointment_id | Yes: both are keys | Yes |
| invoices | invoice_no → all columns; appointment_id → invoice_no | Yes: both are keys | Yes |
| invoice_items | (invoice_no, service_code) → quantity, charged_price | Yes | Yes |

**All 7 tables are in BCNF.** No more splitting is needed.

## 6. Design decisions
1. **`invoice_items.charged_price` is kept on purpose.** `services.list_price` is the price today. If the price changes later, old invoices must still show what the patient really paid (assumption 6). So `charged_price` is a different fact, not a copy, and it depends on the full key (invoice_no, service_code).
2. **The invoice total is not stored.** It can be calculated as the sum of `quantity × charged_price` from `invoice_items`. Storing it would create a derived column that can become wrong. In MediOS the total is calculated in a database view or a CTE when a report needs it.
3. **The patient's age is not stored.** It is calculated from `date_of_birth`.
4. **UNIQUE (doctor_id, appointment_date, start_time)** is the rule that stops double booking, and it is also a candidate key, so BCNF still holds.

## 7. Before and after
| | Before (UNF) | After (BCNF) |
|---|---|---|
| Tables | 1 wide table with a repeating group | 7 small tables |
| Patient details | Repeated in every appointment | Stored once in `patients` |
| Doctor change (specialization) | Update many rows | Update 1 row in `doctors` |
| New doctor or service with no appointments | Not possible | Possible |
| Delete the last appointment of a patient | Patient details are lost | Patient stays in `patients` |

## 8. Link with the Prisma schema
Each final table is one Prisma `model`. Primary keys, UNIQUE columns and foreign keys listed above should be the same as in `schema.prisma`.
