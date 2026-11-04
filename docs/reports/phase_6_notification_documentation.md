# MedCore HMS — Phase 6 Notification System Documentation

**Location:** `MedCore-HMS-Phase-1`  
**Module:** Event-Driven Notifications, Fan-Out & Real-Time Socket.IO  
**Status:** Complete & Production Ready  

---

### 1. Notification Architecture

The notification engine uses an event-driven, decoupled fan-out architecture powered by Redis, BullMQ, and Socket.IO.

```
[SYSTEM EVENT] (e.g. LAB_REPORT_APPROVED, PRESCRIPTION_READY, INVOICE_GENERATED)
       │
       ▼
[NOTIFICATIONS SERVICE]
       │
       ├──> [DATABASE AUDIT] (Create Notification record with isRead=false)
       │
       ├──> [REAL-TIME DISPATCH] (Socket.IO emit to room 'user_<userId>')
       │
       └──> [BULLMQ QUEUE: notifications] (Asynchronous Channel Fan-Out)
                  │
                  ├──> Channel 1: IN_APP (Socket.IO fallback & push)
                  ├──> Channel 2: EMAIL  (Resend API Adapter)
                  └──> Channel 3: SMS    (Twilio API Adapter)
```

#### Key Architecture Principles
1. **Isolated Channel Fan-Out**: Outgoing dispatches use `Promise.allSettled`. A third-party network failure or unconfigured SMS credential on Twilio never blocks or causes failures in in-app notifications or email dispatches.
2. **Safe Credential Adapters**: When third-party API keys (`RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`) are omitted or unconfigured, the adapters log the delivery state as unconfigured and safely resolve without pretending fake external delivery occurred.
3. **Clinical Content Privacy**: Email and SMS previews deliberately sanitize and redact sensitive clinical details (e.g. diagnoses, specific test numeric values) to prevent HIPAA/GDPR disclosure on lock-screens or insecure email inboxes. Messages contain secure invitations to view details in the authenticated Patient Portal.

---

### 2. Supported Events & Default Channels

| Event Type | Description | Recipient | Default Channels |
| :--- | :--- | :--- | :--- |
| `APPOINTMENT_CONFIRMED` | Outpatient booking confirmed | Patient | Email, In-App |
| `APPOINTMENT_REMINDER` | 24-hour upcoming consultation reminder | Patient | SMS, Email |
| `LAB_REPORT_APPROVED` | Pathologist approved diagnostic results | Patient, Doctor | Email, In-App |
| `PRESCRIPTION_READY` | Pharmacy fulfilled medicine batches | Patient | SMS, In-App |
| `INVOICE_GENERATED` | Encounter bill issued | Patient | Email, In-App |
| `PAYMENT_RECEIVED` | Counter cash or digital receipt recorded | Patient | Email, SMS, In-App |
| `LOW_STOCK_ALERT` | Medicine inventory reached reorder level | Pharmacist, Admin | Email, In-App |
| `EMERGENCY_APPOINTMENT` | Urgent emergency appointment booked | Doctor | In-App, SMS |

---

### 3. Socket.IO Gateway & Room Security

The WebSocket gateway is implemented in [NotificationsGateway](../../backend/src/notifications/notifications.gateway.ts):
- **Authentication**: WebSocket handshake validates the incoming JWT Bearer token extracted from `socket.handshake.auth.token` or HTTP headers.
- **Room Isolation**: Each connected client is joined strictly into:
  - `user_${user.id}`: Private user notification channel.
  - `hospital_${user.hospitalId}`: Tenant-wide broadcast channel.
- **Boundary Enforcement**: Sockets attempting to subscribe or listen to unauthorized foreign tenant rooms are rejected or disconnected.

---

### 4. API Endpoints

#### `GET /api/v1/notifications`
- **Authorized Roles:** All authenticated users
- **Query Parameter:** `readStatus: "ALL" | "UNREAD" | "READ"`
- **Behavior:** Returns user's private notification feed ordered by `createdAt DESC`.

#### `GET /api/v1/notifications/unread-count`
- **Behavior:** Returns `{ count: number }` for live dashboard notification badges.

#### `PATCH /api/v1/notifications/:id/read`
- **Behavior:** Marks notification as read. Enforces ownership: users cannot mutate another user's notifications.

#### `POST /api/v1/notifications/mark-all-read`
- **Behavior:** Atomically marks all unread notifications for the authenticated user as read.

#### `GET /api/v1/notifications/preferences` & `PUT /api/v1/notifications/preferences`
- **Behavior:** Retrieves and updates user delivery preferences (`emailEnabled`, `smsEnabled`, `inAppEnabled`).
