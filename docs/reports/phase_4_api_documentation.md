# MedCore HMS — Phase 4 API Documentation

This document describes all REST API endpoints implemented in MedCore HMS Phase 4. All endpoints reside under the `/api/v1` global prefix and require Bearer JWT authentication (unless marked Public).

---

## 1. Hospital Management (`/hospitals`)

### `GET /api/v1/hospitals`
- **Role Required**: `SUPER_ADMIN`
- **Description**: Returns paginated list of all onboarded hospitals across tenants.
- **Query Parameters**:
  - `page`: number (default: 1)
  - `limit`: number (default: 20)
  - `search`: string (filters by name, code, email, phone)
  - `status`: `ACTIVE` | `INACTIVE` | `SUSPENDED` | `ONBOARDING`
- **Response**: `{ success: true, data: { items: Hospital[], total: number, page: number, totalPages: number } }`

### `GET /api/v1/hospitals/my-hospital`
- **Role Required**: Any authenticated user with `hospitalId`
- **Description**: Returns profile details and address for the caller's hospital tenant.

### `PATCH /api/v1/hospitals/my-hospital`
- **Role Required**: `HOSPITAL_ADMIN`
- **Description**: Updates hospital name, tagline, phone, website, and physical address. Prevents modifying `id`, `code`, or `status`.

### `GET /api/v1/hospitals/detail/:id`
- **Role Required**: `SUPER_ADMIN`
- **Description**: Cross-tenant hospital detail retrieval.

### `PATCH /api/v1/hospitals/detail/:id`
- **Role Required**: `SUPER_ADMIN`
- **Description**: Cross-tenant hospital modification including institutional status updates.

---

## 2. Department Management (`/departments`)

### `POST /api/v1/departments`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`
- **Payload**:
  ```json
  {
    "code": "CARD",
    "name": "Cardiology",
    "description": "Vascular and heart disease clinic",
    "headOfDepartmentId": "uuid-optional"
  }
  ```
- **Validation**: Enforces unique code per hospital. Rejects cross-hospital head of department doctor ID.

### `GET /api/v1/departments`
- **Role Required**: Authenticated users within tenant boundary
- **Query Parameters**: `search`, `page`, `limit`, `hospitalId` (SUPER_ADMIN only)
- **Response**: Paginated departments with count of active doctors and rooms.

### `GET /api/v1/departments/:id`
- **Role Required**: Authenticated users within tenant boundary
- **Response**: Detailed department model including doctor roster and room numbers.

### `PATCH /api/v1/departments/:id`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`
- **Payload**: Partial update of `code`, `name`, `description`, `headOfDepartmentId`.

### `DELETE /api/v1/departments/:id`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`
- **Validation**: Rejects deletion if active doctors are assigned to the department (`BadRequestException`).

---

## 3. Doctor Management (`/doctors`)

### `POST /api/v1/doctors`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`
- **Payload**:
  ```json
  {
    "firstName": "Arun",
    "lastName": "Sharma",
    "email": "dr.arun@hospital.org",
    "password": "Password@123",
    "phone": "+91-9876543210",
    "departmentId": "uuid",
    "licenseNumber": "MCI-CARD-10291",
    "specialization": "Interventional Cardiology",
    "experienceYears": 12,
    "consultationFee": 1200.00,
    "bio": "Consultant Cardiologist"
  }
  ```
- **Validation**:
  - Enforces department belongs to doctor's hospital.
  - Enforces unique license number per hospital.
  - Automatically provisions user account with role `DOCTOR` or connects existing user account in same hospital.

### `GET /api/v1/doctors`
- **Role Required**: Authenticated users within tenant boundary
- **Query Parameters**: `search`, `departmentId`, `specialization`, `page`, `limit`
- **Response**: Paginated doctors list with user demographics, department, and appointment counts. Excludes soft-deleted doctors (`deletedAt IS NULL`).

### `GET /api/v1/doctors/:id`
- **Role Required**: Authenticated users within tenant boundary
- **Response**: Detailed doctor profile, weekly schedules, upcoming exceptions, and clinical stats.

### `PATCH /api/v1/doctors/:id`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`, or `DOCTOR` (own profile)
- **Rules**:
  - `DOCTOR` can only update their own profile and only modify `bio` and contact `phone`.
  - `HOSPITAL_ADMIN` can update department, license, specialization, experience, fee.

### `DELETE /api/v1/doctors/:id`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`
- **Behavior**: Sets `deletedAt = now()` (soft delete). Preserves past medical records and audit history.

---

## 4. Scheduling & Availability (`/scheduling`)

### `PUT /api/v1/scheduling/doctors/:doctorId/availability`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`, or `DOCTOR` (own profile)
- **Payload**:
  ```json
  {
    "slots": [
      { "dayOfWeek": 1, "startTime": "09:00", "endTime": "13:00", "slotDurationMinutes": 30 },
      { "dayOfWeek": 1, "startTime": "14:00", "endTime": "17:00", "slotDurationMinutes": 30 }
    ]
  }
  ```
- **Validation**: Enforces `startTime < endTime` and rejects overlapping slots for the same day.

### `GET /api/v1/scheduling/doctors/:doctorId/availability`
- **Role Required**: Authenticated users
- **Response**: Weekly availability schedule configuration.

### `POST /api/v1/scheduling/doctors/:doctorId/exceptions`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`, or `DOCTOR` (own profile)
- **Payload**:
  ```json
  {
    "date": "2026-11-25",
    "isAvailable": false,
    "reason": "National Medical Conference Speaker"
  }
  ```

### `DELETE /api/v1/scheduling/doctors/:doctorId/exceptions/:exceptionId`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`, or `DOCTOR` (own profile)
- **Description**: Removes scheduled leave or time exception.

### `GET /api/v1/scheduling/doctors/:doctorId/slots`
- **Query Parameters**: `date=YYYY-MM-DD`
- **Response**: Computed available booking intervals taking into account weekly hours, leave exceptions, and existing active bookings.
  ```json
  {
    "date": "2026-11-16",
    "dayOfWeek": 1,
    "isAvailable": true,
    "slots": [
      { "startTime": "09:00", "endTime": "09:30", "isAvailable": true },
      { "startTime": "09:30", "endTime": "10:00", "isAvailable": false, "conflictReason": "Already booked" }
    ]
  }
  ```

---

## 5. Patient Management (`/patients`)

### `POST /api/v1/patients`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `NURSE`
- **Payload**:
  ```json
  {
    "firstName": "Rajesh",
    "lastName": "Sharma",
    "dateOfBirth": "1985-05-15",
    "gender": "MALE",
    "bloodGroup": "O+",
    "phone": "+91-9876543210",
    "emergencyContactName": "Pooja Sharma",
    "emergencyContactPhone": "+91-9876543211",
    "address": {
      "street": "14 Park Avenue",
      "city": "Noida",
      "state": "Uttar Pradesh",
      "postalCode": "201301"
    }
  }
  ```
- **Response**: Auto-generates unique hospital-scoped MRN (e.g. `APEX-MAIN-000017`).

### `GET /api/v1/patients/me`
- **Role Required**: `PATIENT`
- **Response**: Returns the authenticated patient's own profile and address.

### `GET /api/v1/patients`
- **Role Required**: Authorized hospital staff (`SUPER_ADMIN`, `HOSPITAL_ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`). `PATIENT` role receives `403 Forbidden`.
- **Query Parameters**: `search`, `page`, `limit`

### `GET /api/v1/patients/:id`
- **Role Required**: Authorized hospital staff or `PATIENT` (only if `patient.userId === user.id`).

### `PATCH /api/v1/patients/:id`
- **Role Required**: Authorized staff or `PATIENT` (patients may only update contact phone, emergency contact, and address).

### `DELETE /api/v1/patients/:id`
- **Role Required**: `SUPER_ADMIN`, `HOSPITAL_ADMIN`
- **Behavior**: Soft-delete (`deletedAt = now()`).

---

## 6. Appointment Management (`/appointments`)

### `POST /api/v1/appointments`
- **Role Required**: Authorized staff or `PATIENT` (only for self)
- **Payload**:
  ```json
  {
    "patientId": "uuid",
    "doctorId": "uuid",
    "appointmentDate": "2026-11-16",
    "startTime": "09:00",
    "endTime": "09:30",
    "type": "CONSULTATION",
    "reason": "Routine clinical checkup"
  }
  ```
- **Validation**:
  - Rejects past appointment dates.
  - Enforces patient and doctor belong to the same hospital.
  - Concurrency-safe double booking check for doctor.
  - Simultaneous booking check for patient.

### `GET /api/v1/appointments`
- **Role Scoping**:
  - `PATIENT`: automatically filters to own appointments.
  - `DOCTOR`: automatically filters to own appointments.
  - Staff / `SUPER_ADMIN`: hospital-scoped.

### `GET /api/v1/appointments/:id`
- **Role Scoping**: Scoped to appointment tenant, doctor, or patient owner.

### `PATCH /api/v1/appointments/:id/reschedule`
- **Payload**: `{ "appointmentDate": "2026-11-18", "startTime": "10:00", "endTime": "10:30", "reason": "string" }`
- **Validation**: Locked for terminal statuses (`COMPLETED`, `CANCELLED`, `NO_SHOW`). Performs conflict checking on new slot.

### `PATCH /api/v1/appointments/:id/status`
- **Role Required**: `DOCTOR` (own appointments), Staff
- **Payload**: `{ "status": "CONFIRMED" | "IN_PROGRESS" | "COMPLETED", "notes": "string" }`
- **Validation**: Validates valid state machine transitions.

### `POST /api/v1/appointments/:id/cancel`
- **Role Required**: `PATIENT` (own), `DOCTOR` (own), Staff
- **Payload**: `{ "reason": "Patient requested cancellation" }`
- **Validation**: Locked if already in terminal state.
