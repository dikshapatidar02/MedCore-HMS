# MedCore HMS — Backend Security Architecture

## 1. Security Architecture Principles

MedCore HMS adopts a **Defense-in-Depth** model designed for high-assurance healthcare multi-tenancy. Security is not delegated to a single gatekeeper or frontend check; every request traverses multiple independent security controls before touching persistent patient data.

```
       +-------------------------------------------------------------+
       |                     INCOMING HTTP REQUEST                   |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 1: Network & Protocol Security                        |
       | - CORS configured with explicit allowed origins             |
       | - JSON body size limits to prevent DoS                      |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 2: Input Validation & Sanitization                    |
       | - NestJS ValidationPipe (class-validator & class-transformer)
       | - whitelist: true (strips unrecognized payload properties)  |
       | - forbidNonWhitelisted: true                                |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 3: Authentication & Identity Assurance               |
       | - JwtAuthGuard + JwtStrategy (Passport JWT)                 |
       | - HS256 signature verification with secret key              |
       | - Token expiration check (15m window)                       |
       | - Inactive account validation against PostgreSQL            |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 4: Role-Based Access Control (RBAC)                   |
       | - RolesGuard evaluates @Roles metadata against user.role    |
       | - Strict 9-role permission model with least privilege       |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 5: Tenant Boundary Enforcement                        |
       | - TenantGuard verifies client :hospitalId matches token     |
       | - Super Admin cross-tenant operations explicitly authorized |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 6: Service-Level Query & Relation Isolation           |
       | - Query WHERE criteria enforces hospitalId = user.hospitalId|
       | - Cross-entity tenant validation prevents cross-hospital    |
       |   linkage (e.g., Hospital A patient with Hospital B doctor) |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | LAYER 7: Data Protection & Sanitization                     |
       | - Password hashes stripped from all output payloads         |
       | - Refresh tokens stored as SHA-256 hashes                   |
       | - Internal stack traces suppressed by HttpExceptionFilter   |
       +-------------------------------------------------------------+
```

---

## 2. Cryptographic Standards & Token Storage

| Component | Standard / Algorithm | Details |
| :--- | :--- | :--- |
| **User Passwords** | `bcrypt` (work factor 12) | Salted, adaptive hashing resistant to GPU-based brute-force attacks. |
| **Access Tokens** | `JWT (HS256)` | Cryptographically signed, 15-minute validity window. |
| **Refresh Tokens** | `CSPRNG (256-bit)` | 32 random bytes from `crypto.randomBytes(32)` formatted as hex. |
| **Refresh Token Hash** | `SHA-256` | Plaintext tokens never stored in database; only SHA-256 digest is stored. |

---

## 3. Threat Mitigation Matrix

| Threat | Mitigation Strategy | Implemented In |
| :--- | :--- | :--- |
| **User Enumeration** | Identical error message `"Invalid email or password."` and identical timing behavior for missing accounts and bad passwords. | `AuthService.login` |
| **Credential Harvesting** | `passwordHash` field explicitly deleted from responses. | `AuthService`, `HospitalsService` |
| **Token Theft & Replay** | Short-lived (15m) access tokens; refresh token rotation on every use; immediate revocation on reuse or logout. | `JwtStrategy`, `AuthService.refresh` |
| **Cross-Tenant Leakage** | `TenantGuard` rejects forged tenant params; service queries enforce `where: { hospitalId }`; foreign-key relationships across tenants are blocked. | `TenantGuard`, `HospitalsService` |
| **Patient Privacy Violation** | Self-scoped check (`invoice.patientId === currentUser.patientProfile.id`) ensures patients cannot read or alter other patients' records. | `HospitalsService.findOneInvoice`, `findOnePatient` |
| **Information Disclosure** | Custom `HttpExceptionFilter` intercepts errors, suppresses database driver codes and stack traces, and returns standardized `{ success: false, error: { code, message } }`. | `backend/src/common/filters/http-exception.filter.ts` |
| **Over-Posting / Mass Assignment** | Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` rejects requests with extraneous properties. | `backend/src/main.ts` |

---

## 4. Audit Logging & Security Events

Critical security and authentication events are logged with structured context:
- Successful user login (`AuthService.login`) with timestamp, user ID, and hospital ID.
- Failed authentication attempts (invalid credentials or inactive accounts).
- Token rotation and session revocation (`AuthService.logout`).
- Cross-tenant access violation attempts (`TenantGuard` and `HospitalsService`).

*Note: Tokens and passwords are explicitly sanitized from all log statements.*

---

## 5. Known Limitations & Roadmap for Subsequent Phases

1. **Rate Limiting**: IP-based rate limiting (e.g. `@nestjs/throttler` with Redis backing) will be introduced in subsequent phases to throttle login attempts and prevent brute-force attacks.
2. **Two-Factor Authentication (2FA/MFA)**: TOTP-based multi-factor authentication will be added for clinical and administrative staff roles in future phases.
3. **Automated Refresh Token Cleanup**: Expired and revoked refresh token records should be pruned via a scheduled cron job to prevent database table bloat over time.
