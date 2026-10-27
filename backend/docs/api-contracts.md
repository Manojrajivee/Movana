# Movana Backend — API Contracts Specification

## Batch 1: Identity, Authentication & User Management (Modules 3, 4, 5)

All endpoints adhere to base URL `/api/v1` and return standard JSON envelopes.

---

### 1. Authentication Endpoints (`/api/v1/auth`)

#### `POST /api/v1/auth/register`
* **Purpose**: Registers a new passenger user account and initializes default profile and preferences.
* **Auth**: Public (No JWT required).
* **Request Payload**:
  ```json
  {
    "email": "passenger@example.com",
    "password": "StrongPassword123!",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+919876543210"
  }
  ```
* **Validation**:
  * `email`: Valid RFC 5322 email string, max 255 chars.
  * `password`: Min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character.
  * `firstName`, `lastName`: Min 1, max 100 chars.
  * `phone`: Optional, E.164 formatted telephone number.
* **Response (HTTP 201 Created)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "c1f7b445-5f69-4252-87ad-d023b8f21915",
      "email": "passenger@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "status": "ACTIVE",
      "roles": ["PASSENGER"]
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "7c9e6... (raw random hex token)",
      "expiresIn": 86400
    }
  }
  ```
* **Error Responses**:
  * `400 Bad Request`: Payload validation failed.
  * `409 Conflict`: Email or phone already registered.

---

#### `POST /api/v1/auth/login`
* **Purpose**: Authenticates user credentials, issues access/refresh tokens, records session in `user_sessions`, and logs attempt in `login_attempts`.
* **Auth**: Public.
* **Request Payload**:
  ```json
  {
    "email": "passenger@example.com",
    "password": "StrongPassword123!"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "c1f7b445-5f69-4252-87ad-d023b8f21915",
      "email": "passenger@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "roles": ["PASSENGER"]
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "9a12e...",
      "expiresIn": 86400
    }
  }
  ```
* **Error Responses**:
  * `401 Unauthorized`: Generic `'Invalid email or password'`. (Prevents account enumeration).
  * `403 Forbidden`: Account is `SUSPENDED` or `DEACTIVATED`.

---

#### `POST /api/v1/auth/refresh`
* **Purpose**: Issues a new access token and rotates the refresh token using SHA-256 session token verification.
* **Auth**: Public (Requires valid refresh token).
* **Request Payload**:
  ```json
  {
    "refreshToken": "9a12e..."
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "new_random_token_hex...",
      "expiresIn": 86400
    }
  }
  ```
* **Error Responses**:
  * `401 Unauthorized`: Token invalid, expired, or revoked.

---

#### `POST /api/v1/auth/logout`
* **Purpose**: Revokes the active session in `user_sessions`.
* **Auth**: Authenticated (`Bearer <access_token>`) or refresh token payload.
* **Request Payload**:
  ```json
  {
    "refreshToken": "9a12e..."
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "message": "Session successfully terminated"
  }
  ```

---

#### `POST /api/v1/auth/forgot-password`
* **Purpose**: Creates single-use password reset token in `password_reset_tokens`.
* **Auth**: Public.
* **Request Payload**:
  ```json
  {
    "email": "passenger@example.com"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "message": "If the account exists, password reset instructions have been dispatched."
  }
  ```

---

#### `POST /api/v1/auth/reset-password`
* **Purpose**: Consumes a password reset token and updates the user's password hash.
* **Auth**: Public.
* **Request Payload**:
  ```json
  {
    "token": "reset_token_hex...",
    "newPassword": "NewStrongPassword456!"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "message": "Password successfully updated"
  }
  ```

---

### 2. User & Profile Endpoints (`/api/v1/users`)

#### `GET /api/v1/users/me`
* **Purpose**: Retrieves the authenticated caller's identity, profile details, and role list.
* **Auth**: Required (`Bearer <access_token>`).
* **Response (HTTP 200 OK)**:
  ```json
  {
    "id": "c1f7b445-5f69-4252-87ad-d023b8f21915",
    "email": "passenger@example.com",
    "phone": "+919876543210",
    "firstName": "John",
    "lastName": "Doe",
    "status": "ACTIVE",
    "roles": ["PASSENGER"],
    "profile": {
      "preferredLanguage": "en",
      "preferredCurrency": "INR",
      "accessibilityRequirements": null
    },
    "preferences": {
      "smsEnabled": true,
      "emailEnabled": true,
      "pushEnabled": true,
      "tripUpdatesEnabled": true
    }
  }
  ```

---

#### `PATCH /api/v1/users/me`
* **Purpose**: Updates caller's name, profile fields, or notification preferences.
* **Auth**: Required (`Bearer <access_token>`).
* **Request Payload**:
  ```json
  {
    "firstName": "Johnny",
    "preferredLanguage": "hi",
    "smsEnabled": false
  }
  ```
* **Response (HTTP 200 OK)**: Updated user object.

---

#### `GET /api/v1/users/:id`
* **Purpose**: Fetches user identity details by ID.
* **Auth**: Required.
* **Access Control**: Caller can view own record (`user.id === params.id`) or caller must hold role `ADMIN` or `OPERATOR`.

---

#### `PATCH /api/v1/users/:id/status`
* **Purpose**: Administrative suspension or deactivation of an account.
* **Auth**: Required. Role: `ADMIN`.
* **Request Payload**:
  ```json
  {
    "status": "SUSPENDED",
    "reason": "Terms of service violation"
  }
  ```
