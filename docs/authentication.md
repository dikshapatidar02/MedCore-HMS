# MedCore HMS — Authentication Architecture

## 1. Overview

MedCore HMS implements a secure, stateless authentication mechanism built on NestJS, Passport, JSON Web Tokens (JWT), and Prisma ORM with PostgreSQL. The authentication subsystem is designed specifically for a multi-tenant hospital environment where identity, tenant membership, and role are tightly bound to every session.

```
+-----------------------------------------------------------------------------------------+
|                                  Authentication Flow                                    |
+-----------------------------------------------------------------------------------------+
        Client                           NestJS API / AuthModule                 PostgreSQL
          |                                        |                                  |
          |  1. POST /api/v1/auth/login            |                                  |
          |  { email, password }                   |                                  |
          |--------------------------------------->|                                  |
          |                                        |  2. Find active user by email    |
          |                                        |--------------------------------->|
          |                                        |     (User + Hospital + Profiles) |
          |                                        |<---------------------------------|
          |                                        |  3. bcrypt.compare(pass, hash)   |
          |                                        |     Generate 32-byte Refresh Token
          |                                        |     Compute SHA-256(token)       |
          |                                        |  4. Store hashed refresh token   |
          |                                        |--------------------------------->|
          |  5. 200 OK                             |                                  |
          |  { accessToken, refreshToken, user }   |                                  |
          |<---------------------------------------|                                  |
          |                                        |                                  |
          |  6. GET /api/v1/auth/me                |                                  |
          |     Authorization: Bearer <token>      |                                  |
          |--------------------------------------->|                                  |
          |                                        |  7. JwtAuthGuard / JwtStrategy   |
          |                                        |     Validate signature & exp     |
          |                                        |     Verify user active in DB     |
          |  8. 200 OK { sanitized user context } |                                  |
          |<---------------------------------------|                                  |
          |                                        |                                  |
          |  9. POST /api/v1/auth/refresh          |                                  |
          |  { refreshToken }                      |                                  |
          |--------------------------------------->|                                  |
          |                                        | 10. Hash token, find active rec  |
          |                                        |     Verify not revoked/expired   |
          |                                        | 11. Revoke old token             |
          |                                        |     Issue new Access + Refresh   |
          | 12. 200 OK { new tokens, user }        |                                  |
          |<---------------------------------------|                                  |
          |                                        |                                  |
          | 13. POST /api/v1/auth/logout           |                                  |
          |  { refreshToken }                      |                                  |
          |--------------------------------------->|                                  |
          |                                        | 14. Mark token isRevoked = true  |
          | 15. 200 OK { loggedOut: true }         |                                  |
          |<---------------------------------------|                                  |
```

---

## 2. Password Security & Credential Protection

### Hashing Strategy
- Passwords are encrypted using **bcrypt** with a work factor (salt rounds) of **12**.
- Password verification uses `bcrypt.compare` to resist timing attacks.
- Passwords must meet minimum complexity requirements (minimum 8 characters, checked via `LoginDto` using `class-validator`).

### Credential Protection
- `passwordHash` is excluded from all API responses via explicit projection stripping in `AuthService` and `HospitalsService`.
- User enumeration resistance: Generic error message `"Invalid email or password."` is returned on both unknown account and incorrect password attempts.
- Audit logs record security events without printing credentials or tokens.

---

## 3. JWT Access Token Lifecycle

### Token Configuration
Access tokens are signed using the **HMAC SHA-256 (HS256)** algorithm with a cryptographically strong secret stored in `JWT_ACCESS_SECRET`.

| Property | Value | Description |
| :--- | :--- | :--- |
| **Algorithm** | `HS256` | Symmetric HMAC with secret |
| **Expiration** | `15m` (900 seconds) | Short-lived to limit exposure |
| **Secret Config** | `JWT_ACCESS_SECRET` | Environment variable (never hardcoded) |

### Token Claims Structure
```json
{
  "sub": "user-admin-apex",
  "email": "admin.apex@medcore.io",
  "role": "HOSPITAL_ADMIN",
  "hospitalId": "hosp-apex-001",
  "firstName": "Vikram",
  "lastName": "Singhania",
  "iat": 1793550350,
  "exp": 1793551250
}
```

- `sub`: Primary UUID/CUID of the user in `User.id`.
- `role`: Role enum value conforming to Prisma `Role`.
- `hospitalId`: Tenant identifier linking the user to their hospital organization (`null` for `SUPER_ADMIN`).

---

## 4. Refresh Token Mechanism & Rotation

To provide seamless user sessions without long-lived access tokens, MedCore HMS implements a secure, database-persisted refresh token rotation pattern.

### Security Principles:
1. **Opaque Random Strings**: Refresh tokens are 32 bytes (256 bits) of cryptographically secure pseudorandom data generated via `crypto.randomBytes(32).toString('hex')` (64 hexadecimal characters).
2. **SHA-256 Storage Hashing**: Plaintext refresh tokens are **never** stored in the database. Instead, only `crypto.createHash('sha256').update(token).digest('hex')` is stored in `RefreshToken.tokenHash`. Even if the database is read, the plaintext token cannot be retrieved.
3. **Single-Use Rotation**: When a client presents a valid refresh token at `/api/v1/auth/refresh`, the presented token is immediately revoked (`isRevoked: true`, `revokedAt: new Date()`), and a completely new pair of access and refresh tokens is issued.
4. **Reuse Detection**: If a revoked refresh token is presented, the system rejects the request with HTTP `401 Unauthorized` (`"Invalid or revoked refresh token. Please login again."`).
5. **Time to Live (TTL)**: Refresh tokens expire automatically after **7 days** (`expiresAt: new Date(Date.now() + 7 * 86400 * 1000)`).
6. **Explicit Revocation**: The logout endpoint (`POST /api/v1/auth/logout`) sets `isRevoked: true` on the presented token, immediately invalidating the session.

### Database Schema (`RefreshToken` Model)
```prisma
model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  isRevoked Boolean   @default(false)
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([tokenHash])
}
```

---

## 5. Inactive User Handling

Users flagged with `isActive: false` (e.g. deactivated employees, suspended accounts):
- Cannot authenticate at `/api/v1/auth/login` (returns HTTP `401 Unauthorized` with message `"User account is inactive. Please contact your hospital administrator."`).
- Existing access tokens are rejected during `JwtStrategy.validate` because the strategy verifies the active flag in the database on token validation.

---

## 6. Authentication API Specification

### 1. User Login
- **Endpoint**: `POST /api/v1/auth/login`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "admin.apex@medcore.io",
  "password": "DemoPassword@123"
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "39e2fc458dcb4f96400...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "user-admin-apex",
      "email": "admin.apex@medcore.io",
      "role": "HOSPITAL_ADMIN",
      "hospitalId": "hosp-apex-001",
      "firstName": "Vikram",
      "lastName": "Singhania",
      "hospital": {
        "id": "hosp-apex-001",
        "name": "Apex Multispecialty Hospital & Research Institute",
        "code": "APEX-MAIN"
      }
    }
  },
  "message": "Authentication successful"
}
```

### 2. Token Refresh
- **Endpoint**: `POST /api/v1/auth/refresh`
- **Access**: Public (requires valid opaque refresh token)
- **Request Body**:
```json
{
  "refreshToken": "39e2fc458dcb4f96400..."
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "f032e152dcc73769...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "user-admin-apex",
      "email": "admin.apex@medcore.io",
      "role": "HOSPITAL_ADMIN",
      "hospitalId": "hosp-apex-001",
      "firstName": "Vikram",
      "lastName": "Singhania"
    }
  },
  "message": "Session token refreshed successfully"
}
```

### 3. User Logout
- **Endpoint**: `POST /api/v1/auth/logout`
- **Access**: Authenticated (`Bearer <accessToken>`)
- **Request Body**:
```json
{
  "refreshToken": "f032e152dcc73769..."
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": null,
  "message": "Successfully logged out and session revoked."
}
```

### 4. Authenticated User Profile (`/auth/me`)
- **Endpoint**: `GET /api/v1/auth/me`
- **Access**: Authenticated (`Bearer <accessToken>`)
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "id": "user-admin-apex",
    "email": "admin.apex@medcore.io",
    "role": "HOSPITAL_ADMIN",
    "hospitalId": "hosp-apex-001",
    "firstName": "Vikram",
    "lastName": "Singhania",
    "phone": "+91-9811000001",
    "isActive": true,
    "createdAt": "2026-11-01T15:12:50.741Z",
    "hospital": {
      "id": "hosp-apex-001",
      "name": "Apex Multispecialty Hospital & Research Institute",
      "code": "APEX-MAIN",
      "status": "ACTIVE"
    },
    "doctorProfile": null,
    "patientProfile": null
  },
  "message": "User profile retrieved successfully"
}
```

---

## 7. Environment Configuration

The following environment variables configure the authentication subsystem:

```env
# JWT Access Token Configuration
JWT_ACCESS_SECRET="medcore_jwt_access_super_secret_key_prod_2026_min32chars"
JWT_ACCESS_EXPIRATION="15m"

# Refresh Token Configuration
JWT_REFRESH_SECRET="medcore_jwt_refresh_super_secret_key_prod_2026_min32chars"
JWT_REFRESH_EXPIRATION="7d"

# Bcrypt Security Cost
BCRYPT_SALT_ROUNDS="12"
```
