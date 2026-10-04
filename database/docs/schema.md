# Movana Database Schema — Complete Table Inventory

This document defines the authoritative inventory of all database tables in the **Movana** platform. Every table is documented with its technical specification, integrity constraints, indexing, triggers, auditability, and data retention rules.

## FOUNDATION: DATABASE MIGRATION ENGINE

### TABLE: `schema_migrations`
* **PURPOSE**: Authoritative ledger of applied database migrations, execution duration, and cryptographic checksums.
* **COLUMNS**:
  * `version` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `description` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `type` | `VARCHAR(20)` | NOT NULL | DEFAULT `'SQL'`
  * `script` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `checksum` | `VARCHAR(64)` | NULL | DEFAULT None
  * `installed_by` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `installed_on` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `execution_time_ms` | `INTEGER` | NOT NULL | DEFAULT None
  * `success` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
* **PRIMARY KEY**: `version`
* **FOREIGN KEYS**: None
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_schema_migrations_time` (`execution_time_ms >= 0`)
* **INDEXES**: `idx_schema_migrations_success` ON `success`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No (Already internal migration audit log)
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: None (Self-contained schema version control)

---

## DOMAIN 1: AUTHENTICATION & CORE USER DOMAIN

### TABLE: `users`
* **PURPOSE**: Master user identity record for passengers, drivers, and administrative staff.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `email` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `phone` | `VARCHAR(32)` | NULL | DEFAULT None
  * `password_hash` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `first_name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `last_name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `date_of_birth` | `DATE` | NULL | DEFAULT None
  * `gender` | `VARCHAR(20)` | NULL | DEFAULT None
  * `profile_image_url` | `TEXT` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `email_verified` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `phone_verified` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `last_login_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `last_login_ip` | `INET` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `deleted_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_users_email` (LOWER(email)) WHERE deleted_at IS NULL; `uq_users_phone` (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL
* **CHECK CONSTRAINTS**: `chk_users_status` (`status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')`)
* **INDEXES**: `idx_users_email` ON `LOWER(email)`; `idx_users_phone` ON `phone`; `idx_users_status` ON `status`
* **TRIGGERS**: `trg_users_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_users_audit` (AFTER INSERT OR UPDATE OR DELETE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Soft deleted)
* **RELATIONSHIPS**: 1:1 with `passenger_profiles`, 1:1 with `drivers`, 1:N with `user_roles`, 1:N with `user_sessions`, 1:N with `bookings`, 1:N with `notifications`, 1:N with `support_tickets`

---

### TABLE: `user_sessions`
* **PURPOSE**: Active user refresh tokens and session security state.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `refresh_token_hash` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `user_agent` | `TEXT` | NULL | DEFAULT None
  * `ip_address` | `INET` | NULL | DEFAULT None
  * `expires_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `is_revoked` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `last_activity_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_user_sessions_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_user_sessions_token_hash` (`refresh_token_hash`)
* **CHECK CONSTRAINTS**: `chk_user_sessions_expiry` (`expires_at > created_at`)
* **INDEXES**: `idx_user_sessions_user_id` ON `user_id`; `idx_user_sessions_expires_at` ON `expires_at` WHERE is_revoked IS FALSE
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: 90 days after expiration / revocation
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `login_attempts`
* **PURPOSE**: Security log of all successful and failed authentication attempts.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NULL | DEFAULT None
  * `email` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `ip_address` | `INET` | NOT NULL | DEFAULT None
  * `user_agent` | `TEXT` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `failure_reason` | `VARCHAR(255)` | NULL | DEFAULT None
  * `attempted_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_login_attempts_user` (`user_id`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_login_attempts_status` (`status IN ('SUCCESS', 'INVALID_CREDENTIALS', 'LOCKED_OUT', 'SUSPENDED', 'MFA_REQUIRED')`)
* **INDEXES**: `idx_login_attempts_email_time` ON `(email, attempted_at DESC)`; `idx_login_attempts_ip_time` ON `(ip_address, attempted_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No (Already security log)
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 180 days
* **RELATIONSHIPS**: N:1 with `users` (optional)

---

### TABLE: `security_events`
* **PURPOSE**: Record of high-impact security actions (password change, MFA reset, email change).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `event_type` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `ip_address` | `INET` | NOT NULL | DEFAULT None
  * `user_agent` | `TEXT` | NULL | DEFAULT None
  * `event_data` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_security_events_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_security_events_user_time` ON `(user_id, created_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 2 Years
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `password_reset_tokens`
* **PURPOSE**: Time-limited cryptographic tokens for password recovery.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `token_hash` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `expires_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `used_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_password_reset_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_password_reset_token_hash` (`token_hash`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_password_reset_user` ON `user_id`; `idx_password_reset_hash` ON `token_hash`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: 30 days after expiration
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `email_verification_tokens`
* **PURPOSE**: Cryptographic tokens for verifying email ownership.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `token_hash` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `expires_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `verified_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_email_verify_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_email_verify_token_hash` (`token_hash`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_email_verify_user` ON `user_id`; `idx_email_verify_hash` ON `token_hash`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: 30 days
* **RELATIONSHIPS**: N:1 with `users`

---

## DOMAIN 2: ROLES & PERMISSIONS DOMAIN (RBAC)

### TABLE: `roles`
* **PURPOSE**: System and administrative access roles.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `is_system_role` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_roles_code` (`code`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_roles_code` ON `code`
* **TRIGGERS**: `trg_roles_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `user_roles`, 1:N with `role_permissions`

---

### TABLE: `permissions`
* **PURPOSE**: Granular operational authorization rights.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `module` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `action` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_permissions_code` (`code`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_permissions_module` ON `module`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `role_permissions`

---

### TABLE: `user_roles`
* **PURPOSE**: Many-to-many assignment of roles to users.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `role_id` | `UUID` | NOT NULL | DEFAULT None
  * `assigned_by` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_user_roles_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE; `fk_user_roles_role` (`role_id`) REFERENCES `roles(id)` ON DELETE RESTRICT; `fk_user_roles_assigned_by` (`assigned_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_user_roles_user_role` (`user_id`, `role_id`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_user_roles_user_id` ON `user_id`; `idx_user_roles_role_id` ON `role_id`
* **TRIGGERS**: `trg_user_roles_audit` (AFTER INSERT OR DELETE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `users`, N:1 with `roles`

---

### TABLE: `role_permissions`
* **PURPOSE**: Association between roles and permissions.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `role_id` | `UUID` | NOT NULL | DEFAULT None
  * `permission_id` | `UUID` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_role_permissions_role` (`role_id`) REFERENCES `roles(id)` ON DELETE CASCADE; `fk_role_permissions_permission` (`permission_id`) REFERENCES `permissions(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_role_permissions_role_perm` (`role_id`, `permission_id`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_role_permissions_role_id` ON `role_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `roles`, N:1 with `permissions`

---

## DOMAIN 3: USER PROFILE DOMAIN

### TABLE: `passenger_profiles`
* **PURPOSE**: Extended personal preferences and accessibility specifications for passengers.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `date_of_birth` | `DATE` | NULL | DEFAULT None
  * `gender` | `VARCHAR(20)` | NULL | DEFAULT None
  * `profile_photo_url` | `TEXT` | NULL | DEFAULT None
  * `preferred_language` | `VARCHAR(10)` | NOT NULL | DEFAULT `'en'`
  * `preferred_currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `accessibility_requirements` | `TEXT` | NULL | DEFAULT None
  * `special_requirements` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_passenger_profiles_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_passenger_profiles_user` (`user_id`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_passenger_profiles_user_id` ON `user_id`
* **TRIGGERS**: `trg_passenger_profiles_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `users`

---

### TABLE: `emergency_contacts`
* **PURPOSE**: Emergency contact directory for passenger safety.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `relationship` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `phone` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `email` | `VARCHAR(255)` | NULL | DEFAULT None
  * `is_primary` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_emergency_contacts_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_emergency_contacts_user` ON `user_id`
* **TRIGGERS**: `trg_emergency_contacts_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: Permanent with user
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `user_addresses`
* **PURPOSE**: Saved home, office, and pickup addresses for users.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `address_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'HOME'`
  * `street_address` | `TEXT` | NOT NULL | DEFAULT None
  * `city` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `state` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `postal_code` | `VARCHAR(20)` | NOT NULL | DEFAULT None
  * `country` | `VARCHAR(100)` | NOT NULL | DEFAULT `'India'`
  * `latitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `is_default` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_user_addresses_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_user_addresses_lat` (`latitude BETWEEN -90.0 AND 90.0`); `chk_user_addresses_lon` (`longitude BETWEEN -180.0 AND 180.0`)
* **INDEXES**: `idx_user_addresses_user` ON `user_id`
* **TRIGGERS**: `trg_user_addresses_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: Permanent with user
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `user_preferences`
* **PURPOSE**: Fine-grained communication and UI preferences.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `sms_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `email_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `push_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `marketing_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `trip_updates_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_user_preferences_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_user_preferences_user` (`user_id`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_user_preferences_user` ON `user_id`
* **TRIGGERS**: `trg_user_preferences_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: Permanent with user
* **RELATIONSHIPS**: 1:1 with `users`

---

## DOMAIN 4: DRIVER DOMAIN

### TABLE: `driver_document_types`
* **PURPOSE**: Master catalog of compliance documents required for drivers (e.g., Commercial License, Police Clearance).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `is_mandatory` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `expires` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_driver_doc_types_code` (`code`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_driver_doc_types_code` ON `code`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `driver_documents`

---

### TABLE: `drivers`
* **PURPOSE**: Professional driver profiles, licensing metadata, ratings, and operational status.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `employee_code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `license_number` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `license_category` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `license_expiry_date` | `DATE` | NOT NULL | DEFAULT None
  * `date_of_joining` | `DATE` | NOT NULL | DEFAULT `CURRENT_DATE`
  * `employment_status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `verification_status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PENDING'`
  * `rating_average` | `NUMERIC(3,2)` | NOT NULL | DEFAULT `5.00`
  * `total_trips` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `deleted_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_drivers_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_drivers_user` (`user_id`); `uq_drivers_emp_code` (`employee_code`); `uq_drivers_license` (`license_number`)
* **CHECK CONSTRAINTS**: `chk_drivers_rating` (`rating_average BETWEEN 1.00 AND 5.00`); `chk_drivers_emp_status` (`employment_status IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED')`); `chk_drivers_verif_status` (`verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')`)
* **INDEXES**: `idx_drivers_emp_code` ON `employee_code`; `idx_drivers_license` ON `license_number`; `idx_drivers_verif_status` ON `verification_status`
* **TRIGGERS**: `trg_drivers_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_drivers_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `users`, 1:N with `driver_documents`, 1:N with `driver_availability`, 1:N with `driver_assignments`, 1:N with `trips`

---

### TABLE: `driver_documents`
* **PURPOSE**: Regulatory documents uploaded by drivers with verification audit trails.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `document_type_id` | `UUID` | NOT NULL | DEFAULT None
  * `document_number` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `document_url` | `TEXT` | NOT NULL | DEFAULT None
  * `issued_date` | `DATE` | NULL | DEFAULT None
  * `expiry_date` | `DATE` | NULL | DEFAULT None
  * `verification_status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PENDING'`
  * `verified_by` | `UUID` | NULL | DEFAULT None
  * `verified_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `rejection_reason` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_docs_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_driver_docs_type` (`document_type_id`) REFERENCES `driver_document_types(id)` ON DELETE RESTRICT; `fk_driver_docs_verifier` (`verified_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_driver_docs_type` (`driver_id`, `document_type_id`)
* **CHECK CONSTRAINTS**: `chk_driver_docs_dates` (`expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date`); `chk_driver_docs_status` (`verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')`)
* **INDEXES**: `idx_driver_docs_driver` ON `driver_id`; `idx_driver_docs_expiry` ON `expiry_date`
* **TRIGGERS**: `trg_driver_docs_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 7 Years
* **RELATIONSHIPS**: N:1 with `drivers`, N:1 with `driver_document_types`

---

### TABLE: `driver_verifications`
* **PURPOSE**: Detailed audit log of verification evaluations (background checks, drug tests).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `verification_type` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `notes` | `TEXT` | NULL | DEFAULT None
  * `verified_by` | `UUID` | NOT NULL | DEFAULT None
  * `verified_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_verif_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_driver_verif_user` (`verified_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_driver_verif_driver` ON `driver_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 7 Years
* **RELATIONSHIPS**: N:1 with `drivers`

---

### TABLE: `driver_availability`
* **PURPOSE**: Weekly driver shifts and calendar availability constraints.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `day_of_week` | `SMALLINT` | NOT NULL | DEFAULT None
  * `start_time` | `TIME` | NOT NULL | DEFAULT None
  * `end_time` | `TIME` | NOT NULL | DEFAULT None
  * `is_available` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `effective_date` | `DATE` | NOT NULL | DEFAULT `CURRENT_DATE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_avail_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_driver_avail_day` (`day_of_week BETWEEN 0 AND 6`); `chk_driver_avail_time` (`end_time > start_time`)
* **INDEXES**: `idx_driver_avail_driver` ON `(driver_id, day_of_week)`
* **TRIGGERS**: `trg_driver_avail_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: 1 Year
* **RELATIONSHIPS**: N:1 with `drivers`

---

### TABLE: `driver_status_history`
* **PURPOSE**: State machine transition history for driver compliance and availability.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `new_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `reason` | `TEXT` | NULL | DEFAULT None
  * `changed_by` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_status_hist_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_driver_status_hist_user` (`changed_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_driver_status_hist_driver` ON `(driver_id, created_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `drivers`

---

### TABLE: `driver_emergency_contacts`
* **PURPOSE**: Direct kin and emergency escalation contacts for commercial drivers.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `relationship` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `phone` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `email` | `VARCHAR(255)` | NULL | DEFAULT None
  * `is_primary` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_emerg_contacts_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_driver_emerg_contacts_driver` ON `driver_id`
* **TRIGGERS**: `trg_driver_emerg_contacts_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: Permanent with driver
* **RELATIONSHIPS**: N:1 with `drivers`

---

### TABLE: `driver_assignments`
* **PURPOSE**: Driver duty, roster shifts, route allocations, and vehicle assignment schedule.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `assignment_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'REGULAR_SHIFT'`
  * `start_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `end_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SCHEDULED'`
  * `assigned_by` | `UUID` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_assign_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_driver_assign_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL; `fk_driver_assign_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL; `fk_driver_assign_user` (`assigned_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_driver_assign_status` (`status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')`)
* **INDEXES**: `idx_driver_assign_driver` ON `driver_id`; `idx_driver_assign_dates` ON `(start_at, end_at)`
* **TRIGGERS**: `trg_driver_assign_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `drivers`, N:1 with `vehicles`, N:1 with `trips`, N:1 with `users`

---

## DOMAIN 5: VEHICLE / FLEET DOMAIN

### TABLE: `vehicle_manufacturers`
* **PURPOSE**: Bus OEMs and chassis builders (e.g. Volvo, Tata Motors, Scania, Ashok Leyland).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `country` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `website` | `VARCHAR(255)` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_vehicle_manufacturers_name` (`name`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: None
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `vehicle_models`

---

### TABLE: `vehicle_models`
* **PURPOSE**: Vehicle model catalog and factory configurations.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `manufacturer_id` | `UUID` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `release_year` | `SMALLINT` | NULL | DEFAULT None
  * `default_capacity` | `INTEGER` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_vehicle_models_mfg` (`manufacturer_id`) REFERENCES `vehicle_manufacturers(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_vehicle_models_mfg_name` (`manufacturer_id`, `name`)
* **CHECK CONSTRAINTS**: `chk_vehicle_models_cap` (`default_capacity > 0`)
* **INDEXES**: `idx_vehicle_models_mfg` ON `manufacturer_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `vehicle_manufacturers`, 1:N with `vehicles`

---

### TABLE: `vehicle_types`
* **PURPOSE**: Service classes (e.g., CITY_BUS, EXPRESS_AC, SLEEPER_LUXURY, MINI_BUS).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `default_fare_multiplier` | `NUMERIC(4,2)` | NOT NULL | DEFAULT `1.00`
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_vehicle_types_code` (`code`)
* **CHECK CONSTRAINTS**: `chk_vehicle_types_mult` (`default_fare_multiplier >= 0.50`)
* **INDEXES**: `idx_vehicle_types_code` ON `code`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `vehicles`, 1:N with `seat_layouts`

---

### TABLE: `vehicles`
* **PURPOSE**: Master physical bus registry with operational attributes and live coordinates.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `registration_number` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `vehicle_code` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `vehicle_type_id` | `UUID` | NOT NULL | DEFAULT None
  * `manufacturer_id` | `UUID` | NOT NULL | DEFAULT None
  * `model_id` | `UUID` | NOT NULL | DEFAULT None
  * `model_year` | `SMALLINT` | NOT NULL | DEFAULT None
  * `vin` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `engine_number` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `capacity` | `INTEGER` | NOT NULL | DEFAULT None
  * `standing_capacity` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `seat_capacity` | `INTEGER` | NOT NULL | DEFAULT None
  * `fuel_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'DIESEL'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `current_odometer` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `current_latitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `current_longitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `last_location_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `deleted_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_vehicles_type` (`vehicle_type_id`) REFERENCES `vehicle_types(id)` ON DELETE RESTRICT; `fk_vehicles_mfg` (`manufacturer_id`) REFERENCES `vehicle_manufacturers(id)` ON DELETE RESTRICT; `fk_vehicles_model` (`model_id`) REFERENCES `vehicle_models(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_vehicles_reg_num` (`registration_number`); `uq_vehicles_code` (`vehicle_code`); `uq_vehicles_vin` (`vin`)
* **CHECK CONSTRAINTS**: `chk_vehicles_cap` (`capacity = seat_capacity + standing_capacity`); `chk_vehicles_fuel` (`fuel_type IN ('DIESEL', 'ELECTRIC', 'CNG', 'HYBRID')`); `chk_vehicles_status` (`status IN ('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'RESERVED')`); `chk_vehicles_lat` (`current_latitude BETWEEN -90.0 AND 90.0`); `chk_vehicles_lon` (`current_longitude BETWEEN -180.0 AND 180.0`)
* **INDEXES**: `idx_vehicles_reg_num` ON `registration_number`; `idx_vehicles_status` ON `status`; `idx_vehicles_loc` ON `(current_latitude, current_longitude)` WHERE status = 'ACTIVE'
* **TRIGGERS**: `trg_vehicles_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_vehicles_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Soft deleted)
* **RELATIONSHIPS**: 1:N with `seats`, 1:N with `vehicle_documents`, 1:N with `trips`, 1:N with `vehicle_inspections`, 1:N with `vehicle_maintenance`

---

### TABLE: `vehicle_documents`
* **PURPOSE**: Registration certificate, commercial road permits, fitness certificates, emissions tests.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `document_type` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `document_number` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `document_url` | `TEXT` | NOT NULL | DEFAULT None
  * `issued_date` | `DATE` | NOT NULL | DEFAULT None
  * `expiry_date` | `DATE` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'VALID'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_vehicle_docs_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_vehicle_docs_dates` (`expiry_date >= issued_date`); `chk_vehicle_docs_status` (`status IN ('VALID', 'EXPIRED', 'PENDING_RENEWAL')`)
* **INDEXES**: `idx_vehicle_docs_vehicle` ON `vehicle_id`; `idx_vehicle_docs_expiry` ON `expiry_date`
* **TRIGGERS**: `trg_vehicle_docs_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 7 Years
* **RELATIONSHIPS**: N:1 with `vehicles`

---

### TABLE: `vehicle_status_history`
* **PURPOSE**: Audit log of vehicle status transitions.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `new_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `reason` | `TEXT` | NULL | DEFAULT None
  * `changed_by` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_vehicle_status_hist_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_vehicle_status_hist_user` (`changed_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_vehicle_status_hist_vehicle` ON `(vehicle_id, created_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `vehicles`

---

### TABLE: `vehicle_assignments`
* **PURPOSE**: Operational pairing of vehicles to designated drivers and operational shifts.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `assignment_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'TRIP'`
  * `start_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `end_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `assigned_by` | `UUID` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_vehicle_assign_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_vehicle_assign_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_vehicle_assign_user` (`assigned_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_vehicle_assign_status` (`status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')`)
* **INDEXES**: `idx_vehicle_assign_vehicle` ON `vehicle_id`; `idx_vehicle_assign_driver` ON `driver_id`
* **TRIGGERS**: `trg_vehicle_assign_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `vehicles`, N:1 with `drivers`

---

## DOMAIN 6: VEHICLE SEAT CONFIGURATION DOMAIN

### TABLE: `seat_layouts`
* **PURPOSE**: Grid blueprints defining seat dimensions, aisles, and multi-deck architecture.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `vehicle_type_id` | `UUID` | NOT NULL | DEFAULT None
  * `total_rows` | `INTEGER` | NOT NULL | DEFAULT None
  * `total_columns` | `INTEGER` | NOT NULL | DEFAULT None
  * `total_decks` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_seat_layouts_type` (`vehicle_type_id`) REFERENCES `vehicle_types(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_seat_layouts_name` (`name`)
* **CHECK CONSTRAINTS**: `chk_seat_layouts_dims` (`total_rows > 0 AND total_columns > 0 AND total_decks IN (1, 2)`)
* **INDEXES**: `idx_seat_layouts_type` ON `vehicle_type_id`
* **TRIGGERS**: `trg_seat_layouts_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `vehicle_types`, 1:N with `seats`

---

### TABLE: `seats`
* **PURPOSE**: Individual seat entities with physical positioning, deck tier, and passenger category rules.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `layout_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `seat_number` | `VARCHAR(10)` | NOT NULL | DEFAULT None
  * `row_number` | `INTEGER` | NOT NULL | DEFAULT None
  * `column_number` | `INTEGER` | NOT NULL | DEFAULT None
  * `seat_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'REGULAR'`
  * `deck` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `position` | `VARCHAR(32)` | NOT NULL | DEFAULT `'WINDOW'`
  * `is_window` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `is_aisle` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_seats_layout` (`layout_id`) REFERENCES `seat_layouts(id)` ON DELETE CASCADE; `fk_seats_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_seats_layout_deck_row_col` (`layout_id`, `deck`, `row_number`, `column_number`); `uq_seats_layout_number` (`layout_id`, `seat_number`)
* **CHECK CONSTRAINTS**: `chk_seats_type` (`seat_type IN ('REGULAR', 'PREMIUM', 'LADIES', 'ACCESSIBLE', 'DRIVER', 'CONDUCTOR', 'RESERVED')`); `chk_seats_deck` (`deck IN (1, 2)`)
* **INDEXES**: `idx_seats_layout` ON `layout_id`; `idx_seats_vehicle` ON `vehicle_id`
* **TRIGGERS**: `trg_seats_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `seat_layouts`, N:1 with `vehicles`, 1:N with `booking_seats`

---

## DOMAIN 7: ROUTE & STOP DOMAIN

### TABLE: `stops`
* **PURPOSE**: Physical boarding and drop-off stations, terminals, and geofenced transit points.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `stop_code` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `address` | `TEXT` | NOT NULL | DEFAULT None
  * `city` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `state` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `country` | `VARCHAR(100)` | NOT NULL | DEFAULT `'India'`
  * `postal_code` | `VARCHAR(20)` | NULL | DEFAULT None
  * `latitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `geofence_radius_meters` | `INTEGER` | NOT NULL | DEFAULT `100`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_stops_code` (`stop_code`)
* **CHECK CONSTRAINTS**: `chk_stops_lat` (`latitude BETWEEN -90.0 AND 90.0`); `chk_stops_lon` (`longitude BETWEEN -180.0 AND 180.0`); `chk_stops_radius` (`geofence_radius_meters >= 10`); `chk_stops_status` (`status IN ('ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED')`)
* **INDEXES**: `idx_stops_code` ON `stop_code`; `idx_stops_city` ON `city`; `idx_stops_coords` ON `(latitude, longitude)`
* **TRIGGERS**: `trg_stops_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `routes` (as origin / dest), 1:N with `route_stops`, 1:N with `trip_stops`

---

### TABLE: `routes`
* **PURPOSE**: Master transportation corridors linking origin to destination.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `route_code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `origin_stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `destination_stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `distance_km` | `NUMERIC(8,2)` | NOT NULL | DEFAULT None
  * `estimated_duration_minutes` | `INTEGER` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `deleted_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_routes_origin` (`origin_stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT; `fk_routes_dest` (`destination_stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_routes_code` (`route_code`)
* **CHECK CONSTRAINTS**: `chk_routes_diff_stops` (`origin_stop_id <> destination_stop_id`); `chk_routes_dist` (`distance_km > 0.0`); `chk_routes_dur` (`estimated_duration_minutes > 0`); `chk_routes_status` (`status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')`)
* **INDEXES**: `idx_routes_code` ON `route_code`; `idx_routes_origin_dest` ON `(origin_stop_id, destination_stop_id)`
* **TRIGGERS**: `trg_routes_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_routes_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Soft deleted)
* **RELATIONSHIPS**: 1:N with `route_stops`, 1:N with `route_versions`, 1:N with `trip_schedules`, 1:N with `trips`

---

### TABLE: `route_versions`
* **PURPOSE**: Version history tracking route changes over time without corrupting past trips.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `route_id` | `UUID` | NOT NULL | DEFAULT None
  * `version_number` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `effective_from` | `DATE` | NOT NULL | DEFAULT `CURRENT_DATE`
  * `effective_to` | `DATE` | NULL | DEFAULT None
  * `is_current` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `change_notes` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_route_versions_route` (`route_id`) REFERENCES `routes(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_route_versions_route_num` (`route_id`, `version_number`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_route_versions_current` ON `(route_id, is_current)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `routes`

---

### TABLE: `route_stops`
* **PURPOSE**: Ordered stop sequence within a route including travel offsets and boarding rules.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `route_id` | `UUID` | NOT NULL | DEFAULT None
  * `stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `sequence_number` | `INTEGER` | NOT NULL | DEFAULT None
  * `arrival_offset_minutes` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `departure_offset_minutes` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `distance_from_origin_km` | `NUMERIC(8,2)` | NOT NULL | DEFAULT `0.00`
  * `is_boarding_allowed` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `is_dropoff_allowed` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_route_stops_route` (`route_id`) REFERENCES `routes(id)` ON DELETE CASCADE; `fk_route_stops_stop` (`stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_route_stops_route_seq` (`route_id`, `sequence_number`); `uq_route_stops_route_stop` (`route_id`, `stop_id`)
* **CHECK CONSTRAINTS**: `chk_route_stops_seq` (`sequence_number >= 1`); `chk_route_stops_offsets` (`departure_offset_minutes >= arrival_offset_minutes`)
* **INDEXES**: `idx_route_stops_route_seq` ON `(route_id, sequence_number)`; `idx_route_stops_stop` ON `stop_id`
* **TRIGGERS**: `trg_route_stops_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `routes`, N:1 with `stops`

---

## DOMAIN 8: TRIP SCHEDULE & SERVICE CALENDAR DOMAIN

### TABLE: `service_calendars`
* **PURPOSE**: Operating days matrix for recurring transit schedules.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `calendar_name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `start_date` | `DATE` | NOT NULL | DEFAULT None
  * `end_date` | `DATE` | NOT NULL | DEFAULT None
  * `monday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `tuesday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `wednesday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `thursday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `friday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `saturday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `sunday` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_service_cal_dates` (`end_date >= start_date`)
* **INDEXES**: `idx_service_cal_range` ON `(start_date, end_date)`
* **TRIGGERS**: `trg_service_cal_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `service_calendar_exceptions`, 1:N with `trip_schedules`

---

### TABLE: `service_calendar_exceptions`
* **PURPOSE**: Specific holiday exclusions or special one-off additions to calendar service.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `service_calendar_id` | `UUID` | NOT NULL | DEFAULT None
  * `exception_date` | `DATE` | NOT NULL | DEFAULT None
  * `exception_type` | `VARCHAR(20)` | NOT NULL | DEFAULT `'REMOVED'`
  * `description` | `VARCHAR(255)` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_service_cal_exc_cal` (`service_calendar_id`) REFERENCES `service_calendars(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_service_cal_exc_cal_date` (`service_calendar_id`, `exception_date`)
* **CHECK CONSTRAINTS**: `chk_service_cal_exc_type` (`exception_type IN ('ADDED', 'REMOVED')`)
* **INDEXES**: `idx_service_cal_exc_date` ON `exception_date`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `service_calendars`

---

### TABLE: `trip_schedules`
* **PURPOSE**: Timetable templates defining recurring departure times on routes.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `schedule_code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `route_id` | `UUID` | NOT NULL | DEFAULT None
  * `service_calendar_id` | `UUID` | NOT NULL | DEFAULT None
  * `departure_time` | `TIME` | NOT NULL | DEFAULT None
  * `arrival_time` | `TIME` | NOT NULL | DEFAULT None
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trip_schedules_route` (`route_id`) REFERENCES `routes(id)` ON DELETE RESTRICT; `fk_trip_schedules_cal` (`service_calendar_id`) REFERENCES `service_calendars(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_trip_schedules_code` (`schedule_code`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_trip_schedules_route` ON `route_id`; `idx_trip_schedules_cal` ON `service_calendar_id`
* **TRIGGERS**: `trg_trip_schedules_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `routes`, N:1 with `service_calendars`, 1:N with `schedule_stops`, 1:N with `trips`

---

### TABLE: `schedule_stops`
* **PURPOSE**: Scheduled timing offsets for each stop under a recurring schedule.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `schedule_id` | `UUID` | NOT NULL | DEFAULT None
  * `stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `sequence_number` | `INTEGER` | NOT NULL | DEFAULT None
  * `scheduled_arrival_offset_minutes` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `scheduled_departure_offset_minutes` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_sched_stops_sched` (`schedule_id`) REFERENCES `trip_schedules(id)` ON DELETE CASCADE; `fk_sched_stops_stop` (`stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_sched_stops_sched_seq` (`schedule_id`, `sequence_number`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_sched_stops_sched` ON `schedule_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `trip_schedules`, N:1 with `stops`

---

## DOMAIN 9: TRIP DOMAIN

### TABLE: `trips`
* **PURPOSE**: Concrete, scheduled operational execution of a route at a specific date and time.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_number` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `route_id` | `UUID` | NOT NULL | DEFAULT None
  * `schedule_id` | `UUID` | NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `primary_driver_id` | `UUID` | NULL | DEFAULT None
  * `secondary_driver_id` | `UUID` | NULL | DEFAULT None
  * `scheduled_departure_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `scheduled_arrival_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `actual_departure_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `actual_arrival_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SCHEDULED'`
  * `current_stop_id` | `UUID` | NULL | DEFAULT None
  * `current_latitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `current_longitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `delay_minutes` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trips_route` (`route_id`) REFERENCES `routes(id)` ON DELETE RESTRICT; `fk_trips_schedule` (`schedule_id`) REFERENCES `trip_schedules(id)` ON DELETE SET NULL; `fk_trips_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL; `fk_trips_driver1` (`primary_driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_trips_driver2` (`secondary_driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_trips_stop` (`current_stop_id`) REFERENCES `stops(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_trips_number` (`trip_number`)
* **CHECK CONSTRAINTS**: `chk_trips_sched_times` (`scheduled_arrival_at > scheduled_departure_at`); `chk_trips_status` (`status IN ('SCHEDULED', 'BOARDING', 'DEPARTED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'SUSPENDED')`); `chk_trips_diff_drivers` (`primary_driver_id IS NULL OR secondary_driver_id IS NULL OR primary_driver_id <> secondary_driver_id`)
* **INDEXES**: `idx_trips_route_departure` ON `(route_id, scheduled_departure_at)`; `idx_trips_status` ON `status`; `idx_trips_vehicle` ON `vehicle_id`; `idx_trips_driver` ON `primary_driver_id`
* **TRIGGERS**: `trg_trips_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_trips_status_hist` (AFTER UPDATE OF status EXECUTE `fn_log_trip_status_transition()`); `trg_trips_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `routes`, N:1 with `vehicles`, N:1 with `drivers`, 1:N with `trip_stops`, 1:N with `bookings`, 1:N with `trip_events`

---

### TABLE: `trip_stops`
* **PURPOSE**: Scheduled vs actual arrival/departure timestamps for every stop of an active trip.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `sequence_number` | `INTEGER` | NOT NULL | DEFAULT None
  * `scheduled_arrival_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `scheduled_departure_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `actual_arrival_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `actual_departure_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `delay_minutes` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PENDING'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trip_stops_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE CASCADE; `fk_trip_stops_stop` (`stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_trip_stops_trip_seq` (`trip_id`, `sequence_number`); `uq_trip_stops_trip_stop` (`trip_id`, `stop_id`)
* **CHECK CONSTRAINTS**: `chk_trip_stops_sched` (`scheduled_departure_at >= scheduled_arrival_at`); `chk_trip_stops_status` (`status IN ('PENDING', 'ARRIVED', 'DEPARTED', 'SKIPPED')`)
* **INDEXES**: `idx_trip_stops_trip` ON `trip_id`; `idx_trip_stops_stop` ON `stop_id`
* **TRIGGERS**: `trg_trip_stops_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `trips`, N:1 with `stops`

---

### TABLE: `trip_assignments`
* **PURPOSE**: Historical audit log of vehicle and crew assignments for every trip.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `assignment_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PRIMARY_DRIVER'`
  * `assigned_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trip_assign_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE CASCADE; `fk_trip_assign_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_trip_assign_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_trip_assign_trip` ON `trip_id`; `idx_trip_assign_driver` ON `driver_id`
* **TRIGGERS**: `trg_trip_assign_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `trips`, N:1 with `drivers`, N:1 with `vehicles`

---

### TABLE: `trip_status_history`
* **PURPOSE**: Append-only log of trip progression and delay notifications.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `new_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `reason` | `TEXT` | NULL | DEFAULT None
  * `changed_by` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trip_status_hist_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE CASCADE; `fk_trip_status_hist_user` (`changed_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_trip_status_hist_trip` ON `(trip_id, created_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `trips`

---

### TABLE: `trip_events`
* **PURPOSE**: High-value milestones and operational signals (e.g., TRIP_STARTED, VEHICLE_BREAKDOWN, GEOFENCE_ENTER).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `driver_id` | `UUID` | NULL | DEFAULT None
  * `event_type` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `event_data` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `occurred_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trip_events_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE CASCADE; `fk_trip_events_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL; `fk_trip_events_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_trip_events_trip` ON `(trip_id, occurred_at DESC)`; `idx_trip_events_type` ON `event_type`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `trips`, N:1 with `vehicles`, N:1 with `drivers`

---

## DOMAIN 10: PRICING & FARES DOMAIN

### TABLE: `fare_products`
* **PURPOSE**: Commercial fare products (e.g. Standard, Flexi, Senior Citizen, Student).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `fare_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'DISTANCE_BASED'`
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_fare_products_code` (`code`)
* **CHECK CONSTRAINTS**: `chk_fare_products_type` (`fare_type IN ('FLAT', 'DISTANCE_BASED', 'ZONE_BASED', 'DYNAMIC')`)
* **INDEXES**: `idx_fare_products_code` ON `code`
* **TRIGGERS**: `trg_fare_products_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `fare_rules`

---

### TABLE: `fare_rules`
* **PURPOSE**: Fare calculation parameters based on distance bands, vehicle class, and seat type.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `fare_product_id` | `UUID` | NOT NULL | DEFAULT None
  * `route_id` | `UUID` | NULL | DEFAULT None
  * `origin_stop_id` | `UUID` | NULL | DEFAULT None
  * `destination_stop_id` | `UUID` | NULL | DEFAULT None
  * `vehicle_type_id` | `UUID` | NULL | DEFAULT None
  * `seat_type` | `VARCHAR(32)` | NULL | DEFAULT None
  * `passenger_category` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ADULT'`
  * `min_distance_km` | `NUMERIC(8,2)` | NOT NULL | DEFAULT `0.00`
  * `max_distance_km` | `NUMERIC(8,2)` | NULL | DEFAULT None
  * `base_fare` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `per_km_rate` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_fare_rules_product` (`fare_product_id`) REFERENCES `fare_products(id)` ON DELETE RESTRICT; `fk_fare_rules_route` (`route_id`) REFERENCES `routes(id)` ON DELETE CASCADE; `fk_fare_rules_vtype` (`vehicle_type_id`) REFERENCES `vehicle_types(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_fare_rules_base` (`base_fare >= 0.00`); `chk_fare_rules_rate` (`per_km_rate >= 0.00`)
* **INDEXES**: `idx_fare_rules_lookup` ON `(fare_product_id, route_id, vehicle_type_id)`
* **TRIGGERS**: `trg_fare_rules_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `fare_products`, 1:N with `fare_prices`

---

### TABLE: `fare_prices`
* **PURPOSE**: Currency amounts, tax rates, and validity windows for fare rules.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `fare_rule_id` | `UUID` | NOT NULL | DEFAULT None
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `base_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `tax_percentage` | `NUMERIC(5,2)` | NOT NULL | DEFAULT `5.00`
  * `effective_from` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `effective_to` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_fare_prices_rule` (`fare_rule_id`) REFERENCES `fare_rules(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_fare_prices_amount` (`base_amount >= 0.00`); `chk_fare_prices_tax` (`tax_percentage BETWEEN 0.00 AND 100.00`)
* **INDEXES**: `idx_fare_prices_rule_dates` ON `(fare_rule_id, effective_from, effective_to)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `fare_rules`

---

### TABLE: `trip_fares`
* **PURPOSE**: Stop-to-stop cached/materialized pricing table per trip for fast client quote retrieval.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `origin_stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `destination_stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `seat_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'REGULAR'`
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `base_fare` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `total_fare` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_trip_fares_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE CASCADE; `fk_trip_fares_orig` (`origin_stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT; `fk_trip_fares_dest` (`destination_stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_trip_fares_trip_stops_seat` (`trip_id`, `origin_stop_id`, `destination_stop_id`, `seat_type`)
* **CHECK CONSTRAINTS**: `chk_trip_fares_total` (`total_fare >= base_fare AND base_fare >= 0.00`)
* **INDEXES**: `idx_trip_fares_lookup` ON `(trip_id, origin_stop_id, destination_stop_id)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 2 Years after trip completion
* **RELATIONSHIPS**: N:1 with `trips`, N:1 with `stops`

---

### TABLE: `discounts`
* **PURPOSE**: Promotional campaigns, referral discounts, and seasonal fare concessions.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `discount_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PERCENTAGE'`
  * `discount_value` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `min_order_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `max_discount_amount` | `NUMERIC(10,2)` | NULL | DEFAULT None
  * `starts_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `expires_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_discounts_code` (`code`)
* **CHECK CONSTRAINTS**: `chk_discounts_type` (`discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT')`); `chk_discounts_val` (`discount_value > 0`); `chk_discounts_window` (`expires_at > starts_at`)
* **INDEXES**: `idx_discounts_code` ON `code`
* **TRIGGERS**: `trg_discounts_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `coupons`

---

### TABLE: `coupons`
* **PURPOSE**: Individual coupon vouchers linked to discount schemes with usage constraints.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `discount_id` | `UUID` | NOT NULL | DEFAULT None
  * `coupon_code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `usage_limit` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `times_used` | `INTEGER` | NOT NULL | DEFAULT `0`
  * `starts_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `expires_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_coupons_discount` (`discount_id`) REFERENCES `discounts(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_coupons_code` (`coupon_code`)
* **CHECK CONSTRAINTS**: `chk_coupons_usage` (`times_used <= usage_limit`)
* **INDEXES**: `idx_coupons_code` ON `coupon_code`
* **TRIGGERS**: `trg_coupons_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `discounts`, 1:N with `coupon_redemptions`

---

### TABLE: `coupon_redemptions`
* **PURPOSE**: Record of coupon redemption against confirmed bookings.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `coupon_id` | `UUID` | NOT NULL | DEFAULT None
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `discount_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `redeemed_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_coupon_redemptions_coupon` (`coupon_id`) REFERENCES `coupons(id)` ON DELETE RESTRICT; `fk_coupon_redemptions_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT; `fk_coupon_redemptions_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_coupon_redemptions_booking` (`booking_id`)
* **CHECK CONSTRAINTS**: `chk_coupon_redemptions_amt` (`discount_amount > 0.00`)
* **INDEXES**: `idx_coupon_redemptions_user` ON `user_id`; `idx_coupon_redemptions_coupon` ON `coupon_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `coupons`, N:1 with `users`, 1:1 with `bookings`

---

## DOMAIN 11: BOOKING DOMAIN

### TABLE: `bookings`
* **PURPOSE**: Master passenger reservation order containing immutable financial snapshot.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_reference` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `origin_stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `destination_stop_id` | `UUID` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PENDING'`
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `subtotal` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `discount_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `tax_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `service_fee` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `total_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `payment_status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'UNPAID'`
  * `booked_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `confirmed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `cancelled_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `completed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_bookings_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT; `fk_bookings_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE RESTRICT; `fk_bookings_orig` (`origin_stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT; `fk_bookings_dest` (`destination_stop_id`) REFERENCES `stops(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_bookings_ref` (`booking_reference`)
* **CHECK CONSTRAINTS**: `chk_bookings_status` (`status IN ('PENDING', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'REFUNDED')`); `chk_bookings_pay_status` (`payment_status IN ('UNPAID', 'PENDING', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED')`); `chk_bookings_totals` (`total_amount = subtotal - discount_amount + tax_amount + service_fee`); `chk_bookings_amounts` (`subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0`)
* **INDEXES**: `idx_bookings_ref` ON `booking_reference`; `idx_bookings_user_time` ON `(user_id, booked_at DESC)`; `idx_bookings_trip` ON `trip_id`; `idx_bookings_status` ON `status`
* **TRIGGERS**: `trg_bookings_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_bookings_status_hist` (AFTER UPDATE OF status EXECUTE `fn_log_booking_status_transition()`); `trg_bookings_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `users`, N:1 with `trips`, 1:N with `booking_passengers`, 1:N with `booking_seats`, 1:N with `booking_items`, 1:N with `payments`, 1:N with `invoices`

---

### TABLE: `booking_passengers`
* **PURPOSE**: Named passenger traveler information with privacy-conscious ID truncation.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `passenger_name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `passenger_phone` | `VARCHAR(32)` | NULL | DEFAULT None
  * `passenger_email` | `VARCHAR(255)` | NULL | DEFAULT None
  * `date_of_birth` | `DATE` | NULL | DEFAULT None
  * `gender` | `VARCHAR(20)` | NULL | DEFAULT None
  * `special_requirements` | `TEXT` | NULL | DEFAULT None
  * `id_type` | `VARCHAR(50)` | NULL | DEFAULT None
  * `id_last4` | `VARCHAR(4)` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_booking_passengers_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_booking_passengers_booking` ON `booking_id`
* **TRIGGERS**: `trg_booking_passengers_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `bookings`, 1:N with `booking_seats`

---

### TABLE: `booking_items`
* **PURPOSE**: Line items for tickets, baggage fees, travel insurance, or meal addons.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `item_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SEAT_FARE'`
  * `description` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `quantity` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `unit_price` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `total_price` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_booking_items_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_booking_items_totals` (`total_price = quantity * unit_price`); `chk_booking_items_qty` (`quantity > 0`)
* **INDEXES**: `idx_booking_items_booking` ON `booking_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `bookings`

---

### TABLE: `booking_seats`
* **PURPOSE**: Concurrency-protected seat assignment linking passenger to physical bus seat on a trip.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `seat_id` | `UUID` | NOT NULL | DEFAULT None
  * `passenger_id` | `UUID` | NOT NULL | DEFAULT None
  * `fare_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PENDING'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_booking_seats_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE CASCADE; `fk_booking_seats_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE RESTRICT; `fk_booking_seats_seat` (`seat_id`) REFERENCES `seats(id)` ON DELETE RESTRICT; `fk_booking_seats_passenger` (`passenger_id`) REFERENCES `booking_passengers(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_booking_seats_booking_seat` (`booking_id`, `seat_id`)
* **CHECK CONSTRAINTS**: `chk_booking_seats_status` (`status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED')`)
* **INDEXES**: Partial Unique Index: `uq_booking_seats_active_trip_seat` ON `(trip_id, seat_id) WHERE status IN ('PENDING', 'CONFIRMED')`; `idx_booking_seats_trip` ON `trip_id`
* **TRIGGERS**: `trg_booking_seats_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `bookings`, N:1 with `trips`, N:1 with `seats`, N:1 with `booking_passengers`

---

### TABLE: `booking_status_history`
* **PURPOSE**: State transition audit history for bookings.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `new_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `reason` | `TEXT` | NULL | DEFAULT None
  * `changed_by` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_booking_status_hist_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE CASCADE; `fk_booking_status_hist_user` (`changed_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_booking_status_hist_booking` ON `(booking_id, created_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `bookings`

---

### TABLE: `booking_cancellations`
* **PURPOSE**: Immutable cancellation records with policy deductions and approved refund calculations.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `cancellation_reference` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `reason` | `TEXT` | NOT NULL | DEFAULT None
  * `cancellation_fee` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `refund_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `cancelled_by` | `UUID` | NOT NULL | DEFAULT None
  * `requested_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `processed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_booking_canc_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT; `fk_booking_canc_user` (`cancelled_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_booking_canc_ref` (`cancellation_reference`); `uq_booking_canc_booking` (`booking_id`)
* **CHECK CONSTRAINTS**: `chk_booking_canc_amts` (`cancellation_fee >= 0 AND refund_amount >= 0`)
* **INDEXES**: `idx_booking_canc_ref` ON `cancellation_reference`; `idx_booking_canc_booking` ON `booking_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `bookings`

---

### TABLE: `booking_reschedules`
* **PURPOSE**: Traceability linking original booking to newly scheduled booking.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `original_booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `new_booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `reason` | `TEXT` | NULL | DEFAULT None
  * `reschedule_fee` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `fare_difference` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `rescheduled_by` | `UUID` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_booking_resched_orig` (`original_booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT; `fk_booking_resched_new` (`new_booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT; `fk_booking_resched_user` (`rescheduled_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_booking_resched_orig` (`original_booking_id`)
* **CHECK CONSTRAINTS**: `chk_booking_resched_diff` (`original_booking_id <> new_booking_id`)
* **INDEXES**: `idx_booking_resched_orig` ON `original_booking_id`; `idx_booking_resched_new` ON `new_booking_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `bookings` (original), 1:1 with `bookings` (new)

---

## DOMAIN 12: PAYMENT & INVOICING DOMAIN

### TABLE: `payment_methods`
* **PURPOSE**: Stored user tokenized payment credentials (PCI-DSS compliant; zero raw card data).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `provider` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `payment_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'CARD'`
  * `provider_token` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `masked_account_number` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `expiry_month` | `SMALLINT` | NULL | DEFAULT None
  * `expiry_year` | `SMALLINT` | NULL | DEFAULT None
  * `is_default` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_payment_methods_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_payment_methods_expiry` (`expiry_month IS NULL OR expiry_month BETWEEN 1 AND 12`)
* **INDEXES**: `idx_payment_methods_user` ON `user_id`
* **TRIGGERS**: `trg_payment_methods_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `payments`
* **PURPOSE**: Authoritative transaction ledger of payment intent and settlement.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `payment_reference` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `provider` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `provider_transaction_id` | `VARCHAR(255)` | NULL | DEFAULT None
  * `idempotency_key` | `VARCHAR(128)` | NOT NULL | DEFAULT None
  * `amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'INITIATED'`
  * `payment_method` | `VARCHAR(32)` | NOT NULL | DEFAULT `'CARD'`
  * `initiated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `authorized_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `captured_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `failed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_payments_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_payments_ref` (`payment_reference`); `uq_payments_idempotency` (`idempotency_key`)
* **CHECK CONSTRAINTS**: `chk_payments_amount` (`amount > 0.00`); `chk_payments_status` (`status IN ('INITIATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')`)
* **INDEXES**: `idx_payments_ref` ON `payment_reference`; `idx_payments_booking` ON `booking_id`; `idx_payments_status` ON `status`; `idx_payments_provider_tx` ON `provider_transaction_id`
* **TRIGGERS**: `trg_payments_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_payments_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Legal/Tax requirement)
* **RELATIONSHIPS**: N:1 with `bookings`, 1:N with `payment_attempts`, 1:N with `payment_transactions`, 1:N with `refunds`

---

### TABLE: `payment_attempts`
* **PURPOSE**: Detailed attempt history per payment gateway roundtrip.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `payment_id` | `UUID` | NOT NULL | DEFAULT None
  * `attempt_number` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `provider` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `request_payload` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `response_payload` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `error_message` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_payment_attempts_payment` (`payment_id`) REFERENCES `payments(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_payment_attempts_num` (`payment_id`, `attempt_number`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_payment_attempts_payment` ON `payment_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `payments`

---

### TABLE: `payment_transactions`
* **PURPOSE**: Double-entry ledger of authorization, capture, and reversal ledger events.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `payment_id` | `UUID` | NOT NULL | DEFAULT None
  * `transaction_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'CAPTURE'`
  * `provider_transaction_id` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SUCCESS'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_payment_tx_payment` (`payment_id`) REFERENCES `payments(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_payment_tx_amount` (`amount > 0.00`)
* **INDEXES**: `idx_payment_tx_payment` ON `payment_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `payments`

---

### TABLE: `payment_events`
* **PURPOSE**: Webhook idempotency and ingestion ledger for external payment gateways.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `provider` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `event_id` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `event_type` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `payload` | `JSONB` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PROCESSED'`
  * `processed_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_payment_events_provider_event` (`provider`, `event_id`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_payment_events_provider_event` ON `(provider, event_id)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: None (Self-contained idempotency log)

---

### TABLE: `refunds`
* **PURPOSE**: Master refund transactions linked to original payments and cancellations.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `payment_id` | `UUID` | NOT NULL | DEFAULT None
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `refund_reference` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `reason` | `TEXT` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'REQUESTED'`
  * `provider_refund_id` | `VARCHAR(255)` | NULL | DEFAULT None
  * `idempotency_key` | `VARCHAR(128)` | NOT NULL | DEFAULT None
  * `requested_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `processed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `failed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_refunds_payment` (`payment_id`) REFERENCES `payments(id)` ON DELETE RESTRICT; `fk_refunds_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_refunds_ref` (`refund_reference`); `uq_refunds_idempotency` (`idempotency_key`)
* **CHECK CONSTRAINTS**: `chk_refunds_amount` (`amount > 0.00`); `chk_refunds_status` (`status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED')`)
* **INDEXES**: `idx_refunds_payment` ON `payment_id`; `idx_refunds_booking` ON `booking_id`; `idx_refunds_ref` ON `refund_reference`
* **TRIGGERS**: `trg_refunds_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_refunds_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Accounting requirement)
* **RELATIONSHIPS**: N:1 with `payments`, N:1 with `bookings`, 1:N with `refund_transactions`

---

### TABLE: `refund_transactions`
* **PURPOSE**: Provider-level clearing transactions for refunds.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `refund_id` | `UUID` | NOT NULL | DEFAULT None
  * `provider_transaction_id` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SUCCESS'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_refund_tx_refund` (`refund_id`) REFERENCES `refunds(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_refund_tx_amount` (`amount > 0.00`)
* **INDEXES**: `idx_refund_tx_refund` ON `refund_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `refunds`

---

### TABLE: `invoices`
* **PURPOSE**: Legally binding tax invoices issued to passengers.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `invoice_number` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `subtotal` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `tax` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `discount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `total` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ISSUED'`
  * `issued_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `due_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `paid_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_invoices_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT; `fk_invoices_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_invoices_num` (`invoice_number`)
* **CHECK CONSTRAINTS**: `chk_invoices_status` (`status IN ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'REFUNDED')`); `chk_invoices_totals` (`total = subtotal - discount + tax`)
* **INDEXES**: `idx_invoices_num` ON `invoice_number`; `idx_invoices_booking` ON `booking_id`; `idx_invoices_user` ON `user_id`
* **TRIGGERS**: `trg_invoices_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 8 Years (Statutory retention)
* **RELATIONSHIPS**: 1:1 with `bookings`, N:1 with `users`, 1:N with `invoice_items`

---

### TABLE: `invoice_items`
* **PURPOSE**: Breakdown of fare components and statutory goods and services tax (GST/VAT) items.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `invoice_id` | `UUID` | NOT NULL | DEFAULT None
  * `description` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `quantity` | `INTEGER` | NOT NULL | DEFAULT `1`
  * `unit_price` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `tax_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `total_amount` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_invoice_items_invoice` (`invoice_id`) REFERENCES `invoices(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_invoice_items_totals` (`total_amount = (quantity * unit_price) + tax_amount`)
* **INDEXES**: `idx_invoice_items_invoice` ON `invoice_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 8 Years
* **RELATIONSHIPS**: N:1 with `invoices`

---

## DOMAIN 13: GPS TRACKING & GEOFENCING DOMAIN

### TABLE: `tracking_devices`
* **PURPOSE**: Hardware GPS/OBD telematics units fitted into buses.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `device_imei` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `device_model` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `firmware_version` | `VARCHAR(32)` | NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `installed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_tracking_dev_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_tracking_devices_imei` (`device_imei`); `uq_tracking_devices_vehicle` (`vehicle_id`) WHERE is_active IS TRUE AND vehicle_id IS NOT NULL
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_tracking_devices_imei` ON `device_imei`; `idx_tracking_devices_vehicle` ON `vehicle_id`
* **TRIGGERS**: `trg_tracking_devices_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `vehicles`

---

### TABLE: `vehicle_location_history`
* **PURPOSE**: High-volume immutable time-series GPS breadcrumbs partitioned by month.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `driver_id` | `UUID` | NULL | DEFAULT None
  * `latitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `accuracy_meters` | `NUMERIC(6,2)` | NULL | DEFAULT None
  * `speed_kmh` | `NUMERIC(6,2)` | NOT NULL | DEFAULT `0.00`
  * `heading_degrees` | `NUMERIC(5,2)` | NULL | DEFAULT None
  * `altitude_meters` | `NUMERIC(7,2)` | NULL | DEFAULT None
  * `odometer` | `NUMERIC(10,2)` | NULL | DEFAULT None
  * `recorded_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `received_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `source` | `VARCHAR(32)` | NOT NULL | DEFAULT `'GPS_DEVICE'`
* **PRIMARY KEY**: `id`, `recorded_at` (composite key supporting range partitioning)
* **FOREIGN KEYS**: `fk_loc_hist_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_loc_hist_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL; `fk_loc_hist_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_loc_hist_lat` (`latitude BETWEEN -90.0 AND 90.0`); `chk_loc_hist_lon` (`longitude BETWEEN -180.0 AND 180.0`); `chk_loc_hist_speed` (`speed_kmh >= 0.00`)
* **INDEXES**: `idx_loc_hist_vehicle_time` ON `(vehicle_id, recorded_at DESC)`; `idx_loc_hist_trip_time` ON `(trip_id, recorded_at DESC)` WHERE trip_id IS NOT NULL
* **TRIGGERS**: None (High-throughput insertion path)
* **PARTITIONING**: Declarative range partitioning on `recorded_at` by month; includes `vehicle_location_history_default` partition for fail-safe ingestion
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 90 Days active hot tier; archived to parquet cold storage
* **RELATIONSHIPS**: N:1 with `vehicles`, N:1 with `trips`, N:1 with `drivers`

---

### TABLE: `tracking_events`
* **PURPOSE**: Raw telematics signals (ignition on/off, low battery, tampering alert).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `device_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `event_type` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `payload` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `recorded_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_tracking_events_dev` (`device_id`) REFERENCES `tracking_devices(id)` ON DELETE CASCADE; `fk_tracking_events_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_tracking_events_vehicle_time` ON `(vehicle_id, recorded_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 180 Days
* **RELATIONSHIPS**: N:1 with `tracking_devices`, N:1 with `vehicles`

---

### TABLE: `geofences`
* **PURPOSE**: Virtual geographic perimeters (e.g. Depots, Fuel Stations, Toll Plazas, restricted zones).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `latitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `radius_meters` | `INTEGER` | NOT NULL | DEFAULT None
  * `type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'TERMINAL'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'ACTIVE'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_geofences_name` (`name`)
* **CHECK CONSTRAINTS**: `chk_geofences_lat` (`latitude BETWEEN -90.0 AND 90.0`); `chk_geofences_lon` (`longitude BETWEEN -180.0 AND 180.0`); `chk_geofences_radius` (`radius_meters > 0`)
* **INDEXES**: `idx_geofences_coords` ON `(latitude, longitude)`
* **TRIGGERS**: `trg_geofences_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `geofence_events`

---

### TABLE: `geofence_events`
* **PURPOSE**: Transitions across geofence boundaries (ENTER / EXIT).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `geofence_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `event_type` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `latitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `occurred_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_geofence_events_fence` (`geofence_id`) REFERENCES `geofences(id)` ON DELETE RESTRICT; `fk_geofence_events_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_geofence_events_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_geofence_events_type` (`event_type IN ('ENTER', 'EXIT')`)
* **INDEXES**: `idx_geofence_events_vehicle` ON `(vehicle_id, occurred_at DESC)`; `idx_geofence_events_fence` ON `geofence_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 1 Year
* **RELATIONSHIPS**: N:1 with `geofences`, N:1 with `vehicles`, N:1 with `trips`

---

## DOMAIN 14: SAFETY & INCIDENT MANAGEMENT DOMAIN

### TABLE: `incident_types`
* **PURPOSE**: Classification of safety and operational incidents (e.g. Collision, Breakdown, Medical, Passenger Dispute).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `category` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_incident_types_code` (`code`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_incident_types_code` ON `code`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `incidents`

---

### TABLE: `incident_severity_levels`
* **PURPOSE**: Standardized priority scale for emergency escalation.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `level_rank` | `INTEGER` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_incident_sev_code` (`code`); `uq_incident_sev_rank` (`level_rank`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: None
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:N with `incidents`

---

### TABLE: `incidents`
* **PURPOSE**: Official incident log with geocoding, severity status, and investigation tracking.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `incident_number` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `driver_id` | `UUID` | NULL | DEFAULT None
  * `reported_by` | `UUID` | NOT NULL | DEFAULT None
  * `incident_type_id` | `UUID` | NOT NULL | DEFAULT None
  * `severity` | `VARCHAR(32)` | NOT NULL | DEFAULT `'MEDIUM'`
  * `title` | `VARCHAR(200)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NOT NULL | DEFAULT None
  * `latitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `occurred_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `reported_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'OPEN'`
  * `resolved_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_incidents_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL; `fk_incidents_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL; `fk_incidents_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE SET NULL; `fk_incidents_reporter` (`reported_by`) REFERENCES `users(id)` ON DELETE RESTRICT; `fk_incidents_type` (`incident_type_id`) REFERENCES `incident_types(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_incidents_num` (`incident_number`)
* **CHECK CONSTRAINTS**: `chk_incidents_severity` (`severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`); `chk_incidents_status` (`status IN ('OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED')`)
* **INDEXES**: `idx_incidents_num` ON `incident_number`; `idx_incidents_status` ON `status`; `idx_incidents_trip` ON `trip_id`; `idx_incidents_vehicle` ON `vehicle_id`
* **TRIGGERS**: `trg_incidents_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_incidents_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Safety compliance mandate)
* **RELATIONSHIPS**: N:1 with `incident_types`, N:1 with `trips`, N:1 with `vehicles`, N:1 with `drivers`, 1:N with `incident_reports`, 1:N with `incident_actions`

---

### TABLE: `incident_reports`
* **PURPOSE**: Formal witness statements and field officer findings.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `incident_id` | `UUID` | NOT NULL | DEFAULT None
  * `submitted_by` | `UUID` | NOT NULL | DEFAULT None
  * `report_details` | `TEXT` | NOT NULL | DEFAULT None
  * `witnesses` | `JSONB` | NOT NULL | DEFAULT `'[]'::jsonb`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_incident_reports_incident` (`incident_id`) REFERENCES `incidents(id)` ON DELETE CASCADE; `fk_incident_reports_user` (`submitted_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_incident_reports_incident` ON `incident_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `incidents`

---

### TABLE: `incident_actions`
* **PURPOSE**: Corrective and preventive actions taken by safety directors.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `incident_id` | `UUID` | NOT NULL | DEFAULT None
  * `action_taken` | `TEXT` | NOT NULL | DEFAULT None
  * `taken_by` | `UUID` | NOT NULL | DEFAULT None
  * `action_date` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'COMPLETED'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_incident_actions_incident` (`incident_id`) REFERENCES `incidents(id)` ON DELETE CASCADE; `fk_incident_actions_user` (`taken_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_incident_actions_incident` ON `incident_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `incidents`

---

### TABLE: `emergency_events`
* **PURPOSE**: Panic button triggers, SOS alerts from passenger mobile app or driver dashboard.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `driver_id` | `UUID` | NULL | DEFAULT None
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `emergency_type` | `VARCHAR(50)` | NOT NULL | DEFAULT `'SOS_BUTTON'`
  * `latitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NOT NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'TRIGGERED'`
  * `triggered_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `resolved_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_emergency_events_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE RESTRICT; `fk_emergency_events_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_emergency_events_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_emergency_events_status` (`status IN ('TRIGGERED', 'DISPATCHED', 'FALSE_ALARM', 'RESOLVED')`)
* **INDEXES**: `idx_emergency_events_status` ON `status` WHERE status = 'TRIGGERED'; `idx_emergency_events_trip` ON `trip_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `trips`, N:1 with `vehicles`, N:1 with `users`

---

### TABLE: `driver_safety_events`
* **PURPOSE**: Telematics driving behavior infractions (harsh braking, overspeeding, rapid acceleration, fatigue).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `driver_id` | `UUID` | NOT NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `event_type` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `severity` | `VARCHAR(32)` | NOT NULL | DEFAULT `'MEDIUM'`
  * `speed_kmh` | `NUMERIC(6,2)` | NULL | DEFAULT None
  * `latitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `longitude` | `NUMERIC(10,7)` | NULL | DEFAULT None
  * `event_data` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `occurred_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_driver_safety_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE RESTRICT; `fk_driver_safety_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_driver_safety_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_driver_safety_type` (`event_type IN ('HARSH_BRAKING', 'OVERSPEED', 'RAPID_ACCEL', 'GEOFENCE_VIOLATION', 'DROWSINESS', 'HOURS_EXCEEDED')`)
* **INDEXES**: `idx_driver_safety_driver_time` ON `(driver_id, occurred_at DESC)`; `idx_driver_safety_veh` ON `vehicle_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `drivers`, N:1 with `vehicles`, N:1 with `trips`

---

## DOMAIN 15: VEHICLE MAINTENANCE & INSPECTIONS DOMAIN

### TABLE: `maintenance_schedules`
* **PURPOSE**: Preventative maintenance intervals configured by kilometers or calendar intervals.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_type_id` | `UUID` | NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `service_name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `interval_km` | `INTEGER` | NOT NULL | DEFAULT `10000`
  * `interval_days` | `INTEGER` | NOT NULL | DEFAULT `90`
  * `description` | `TEXT` | NULL | DEFAULT None
  * `is_active` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_maint_sched_vtype` (`vehicle_type_id`) REFERENCES `vehicle_types(id)` ON DELETE SET NULL; `fk_maint_sched_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_maint_sched_intervals` (`interval_km > 0 AND interval_days > 0`)
* **INDEXES**: `idx_maint_sched_veh` ON `vehicle_id`
* **TRIGGERS**: `trg_maint_sched_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `vehicle_types`, N:1 with `vehicles`, 1:N with `maintenance_records`

---

### TABLE: `maintenance_records`
* **PURPOSE**: Execution logs of preventative and corrective garage service work orders.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `maintenance_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SCHEDULED'`
  * `scheduled_date` | `DATE` | NOT NULL | DEFAULT None
  * `completed_date` | `DATE` | NULL | DEFAULT None
  * `odometer` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `cost` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `currency` | `VARCHAR(3)` | NOT NULL | DEFAULT `'INR'`
  * `vendor` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NOT NULL | DEFAULT None
  * `technician` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `next_due_date` | `DATE` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'SCHEDULED'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_maint_records_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_maint_records_status` (`status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`); `chk_maint_records_cost` (`cost >= 0.00`)
* **INDEXES**: `idx_maint_records_veh` ON `vehicle_id`; `idx_maint_records_status` ON `status`
* **TRIGGERS**: `trg_maint_records_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent (Vehicle life)
* **RELATIONSHIPS**: N:1 with `vehicles`, 1:N with `maintenance_items`

---

### TABLE: `maintenance_items`
* **PURPOSE**: Breakdown of work performed (e.g. Engine Oil Flush, Brake Pad Replacement).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `maintenance_record_id` | `UUID` | NOT NULL | DEFAULT None
  * `item_name` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `item_cost` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'COMPLETED'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_maint_items_record` (`maintenance_record_id`) REFERENCES `maintenance_records(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_maint_items_cost` (`item_cost >= 0.00`)
* **INDEXES**: `idx_maint_items_record` ON `maintenance_record_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `maintenance_records`, 1:N with `maintenance_parts`

---

### TABLE: `maintenance_parts`
* **PURPOSE**: Itemized parts and spare inventory consumed during maintenance.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `maintenance_item_id` | `UUID` | NOT NULL | DEFAULT None
  * `part_number` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `part_name` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `quantity` | `NUMERIC(6,2)` | NOT NULL | DEFAULT `1.00`
  * `unit_cost` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `total_cost` | `NUMERIC(10,2)` | NOT NULL | DEFAULT `0.00`
  * `supplier` | `VARCHAR(150)` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_maint_parts_item` (`maintenance_item_id`) REFERENCES `maintenance_items(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_maint_parts_total` (`total_cost = quantity * unit_cost`)
* **INDEXES**: `idx_maint_parts_item` ON `maintenance_item_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: N:1 with `maintenance_items`

---

### TABLE: `vehicle_inspections`
* **PURPOSE**: Daily pre-trip, post-trip, and periodic safety audits.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `vehicle_id` | `UUID` | NOT NULL | DEFAULT None
  * `inspection_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PRE_TRIP'`
  * `inspector_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `inspection_date` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PASSED'`
  * `odometer` | `NUMERIC(10,2)` | NOT NULL | DEFAULT None
  * `notes` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_vehicle_insp_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE RESTRICT; `fk_vehicle_insp_user` (`inspector_id`) REFERENCES `users(id)` ON DELETE RESTRICT; `fk_vehicle_insp_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_vehicle_insp_type` (`inspection_type IN ('PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY_AUDIT')`); `chk_vehicle_insp_status` (`status IN ('PASSED', 'FAILED', 'NEEDS_REPAIR')`)
* **INDEXES**: `idx_vehicle_insp_veh_time` ON `(vehicle_id, inspection_date DESC)`
* **TRIGGERS**: `trg_vehicle_insp_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `vehicles`, 1:N with `vehicle_inspection_items`

---

### TABLE: `vehicle_inspection_items`
* **PURPOSE**: Specific checklist items (Tire Pressure, Brake Responsiveness, Emergency Door, First Aid Kit).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `inspection_id` | `UUID` | NOT NULL | DEFAULT None
  * `checklist_item` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `category` | `VARCHAR(50)` | NOT NULL | DEFAULT `'SAFETY'`
  * `result_status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PASS'`
  * `notes` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_veh_insp_items_insp` (`inspection_id`) REFERENCES `vehicle_inspections(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_veh_insp_items_status` (`result_status IN ('PASS', 'FAIL', 'WARNING', 'NA')`)
* **INDEXES**: `idx_veh_insp_items_insp` ON `inspection_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `vehicle_inspections`, 1:N with `vehicle_inspection_issues`

---

### TABLE: `vehicle_inspection_issues`
* **PURPOSE**: Defect tracking for items that failed inspection.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `inspection_item_id` | `UUID` | NOT NULL | DEFAULT None
  * `issue_description` | `TEXT` | NOT NULL | DEFAULT None
  * `severity` | `VARCHAR(32)` | NOT NULL | DEFAULT `'MAJOR'`
  * `is_blocking` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `resolved_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_veh_insp_issues_item` (`inspection_item_id`) REFERENCES `vehicle_inspection_items(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_veh_insp_issues_item` ON `inspection_item_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `vehicle_inspection_items`

---

## DOMAIN 16: NOTIFICATIONS DOMAIN

### TABLE: `notification_templates`
* **PURPOSE**: Reusable message templates supporting multi-channel string interpolation.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `template_code` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `channel` | `VARCHAR(32)` | NOT NULL | DEFAULT `'EMAIL'`
  * `subject` | `VARCHAR(255)` | NULL | DEFAULT None
  * `body_template` | `TEXT` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_notif_templates_code_chan` (`template_code`, `channel`)
* **CHECK CONSTRAINTS**: `chk_notif_templates_chan` (`channel IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')`)
* **INDEXES**: `idx_notif_templates_code` ON `template_code`
* **TRIGGERS**: `trg_notif_templates_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: None

---

### TABLE: `notification_preferences`
* **PURPOSE**: User opt-in and suppression matrix by channel and notification category.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `channel` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `notification_category` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `is_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `TRUE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_notif_pref_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: `uq_notif_pref_user_chan_cat` (`user_id`, `channel`, `notification_category`)
* **CHECK CONSTRAINTS**: `chk_notif_pref_chan` (`channel IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')`)
* **INDEXES**: `idx_notif_pref_user` ON `user_id`
* **TRIGGERS**: `trg_notif_pref_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: No
* **RETENTION**: Permanent with user
* **RELATIONSHIPS**: N:1 with `users`

---

### TABLE: `notifications`
* **PURPOSE**: Master notification dispatch queue and in-app message inbox.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `title` | `VARCHAR(200)` | NOT NULL | DEFAULT None
  * `message` | `TEXT` | NOT NULL | DEFAULT None
  * `channel` | `VARCHAR(32)` | NOT NULL | DEFAULT `'IN_APP'`
  * `category` | `VARCHAR(50)` | NOT NULL | DEFAULT `'SYSTEM'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'QUEUED'`
  * `metadata` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `scheduled_for` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `sent_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `read_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_notifications_user` (`user_id`) REFERENCES `users(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_notifications_chan` (`channel IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')`); `chk_notifications_status` (`status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ')`)
* **INDEXES**: `idx_notifications_user_unread` ON `user_id` WHERE read_at IS NULL; `idx_notifications_queue` ON `(status, scheduled_for)` WHERE status = 'QUEUED'
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 1 Year
* **RELATIONSHIPS**: N:1 with `users`, 1:N with `notification_deliveries`

---

### TABLE: `notification_deliveries`
* **PURPOSE**: Gateway delivery attempts (e.g. Twilio, SendGrid, Firebase FCM response payloads).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `notification_id` | `UUID` | NOT NULL | DEFAULT None
  * `recipient` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `provider` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `provider_message_id` | `VARCHAR(255)` | NULL | DEFAULT None
  * `delivery_status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'INITIATED'`
  * `error_message` | `TEXT` | NULL | DEFAULT None
  * `attempted_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `delivered_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_notif_deliveries_notif` (`notification_id`) REFERENCES `notifications(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_notif_deliveries_notif` ON `notification_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 180 Days
* **RELATIONSHIPS**: N:1 with `notifications`

---

## DOMAIN 17: REVIEWS & FEEDBACK DOMAIN

### TABLE: `review_categories`
* **PURPOSE**: Evaluation criteria (Punctuality, Cleanliness, Driving Smoothness, Staff Courtesy).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `code` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_review_categories_code` (`code`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: None
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: None

---

### TABLE: `reviews`
* **PURPOSE**: Verified passenger ratings on completed trips with driver/vehicle associations.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `booking_id` | `UUID` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NOT NULL | DEFAULT None
  * `driver_id` | `UUID` | NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `rating` | `SMALLINT` | NOT NULL | DEFAULT None
  * `comment` | `TEXT` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'PUBLISHED'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_reviews_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT; `fk_reviews_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE RESTRICT; `fk_reviews_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE RESTRICT; `fk_reviews_driver` (`driver_id`) REFERENCES `drivers(id)` ON DELETE SET NULL; `fk_reviews_vehicle` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_reviews_booking` (`booking_id`)
* **CHECK CONSTRAINTS**: `chk_reviews_rating` (`rating BETWEEN 1 AND 5`); `chk_reviews_status` (`status IN ('PENDING', 'PUBLISHED', 'MODERATED', 'HIDDEN')`)
* **INDEXES**: `idx_reviews_driver` ON `driver_id`; `idx_reviews_trip` ON `trip_id`; `idx_reviews_user` ON `user_id`
* **TRIGGERS**: `trg_reviews_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `bookings`, N:1 with `users`, N:1 with `trips`, N:1 with `drivers`, N:1 with `vehicles`, 1:N with `review_responses`

---

### TABLE: `review_responses`
* **PURPOSE**: Official management or driver responses to passenger reviews.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `review_id` | `UUID` | NOT NULL | DEFAULT None
  * `responder_id` | `UUID` | NOT NULL | DEFAULT None
  * `response_text` | `TEXT` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_review_resp_review` (`review_id`) REFERENCES `reviews(id)` ON DELETE CASCADE; `fk_review_resp_user` (`responder_id`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_review_resp_review` (`review_id`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_review_resp_review` ON `review_id`
* **TRIGGERS**: `trg_review_resp_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: 1:1 with `reviews`, N:1 with `users`

---

## DOMAIN 18: SUPPORT & LOST-AND-FOUND DOMAIN

### TABLE: `support_tickets`
* **PURPOSE**: Customer assistance and dispute ticketing system.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `ticket_number` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `user_id` | `UUID` | NOT NULL | DEFAULT None
  * `booking_id` | `UUID` | NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `category` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `subject` | `VARCHAR(200)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NOT NULL | DEFAULT None
  * `priority` | `VARCHAR(32)` | NOT NULL | DEFAULT `'MEDIUM'`
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'OPEN'`
  * `assigned_to` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_support_tickets_user` (`user_id`) REFERENCES `users(id)` ON DELETE RESTRICT; `fk_support_tickets_booking` (`booking_id`) REFERENCES `bookings(id)` ON DELETE SET NULL; `fk_support_tickets_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL; `fk_support_tickets_agent` (`assigned_to`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_support_tickets_num` (`ticket_number`)
* **CHECK CONSTRAINTS**: `chk_support_tickets_priority` (`priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')`); `chk_support_tickets_status` (`status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED')`)
* **INDEXES**: `idx_support_tickets_num` ON `ticket_number`; `idx_support_tickets_user` ON `user_id`; `idx_support_tickets_status` ON `status`
* **TRIGGERS**: `trg_support_tickets_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `users`, N:1 with `bookings`, 1:N with `support_ticket_messages`, 1:N with `support_ticket_status_history`

---

### TABLE: `support_ticket_messages`
* **PURPOSE**: Conversation thread between passenger and support desk.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `ticket_id` | `UUID` | NOT NULL | DEFAULT None
  * `sender_id` | `UUID` | NOT NULL | DEFAULT None
  * `message` | `TEXT` | NOT NULL | DEFAULT None
  * `is_internal` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_support_messages_ticket` (`ticket_id`) REFERENCES `support_tickets(id)` ON DELETE CASCADE; `fk_support_messages_sender` (`sender_id`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_support_messages_ticket` ON `ticket_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `support_tickets`, N:1 with `users`, 1:N with `support_ticket_attachments`

---

### TABLE: `support_ticket_status_history`
* **PURPOSE**: Audit of resolution milestones and reassignment.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `ticket_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `new_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `changed_by` | `UUID` | NULL | DEFAULT None
  * `notes` | `TEXT` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_support_status_hist_ticket` (`ticket_id`) REFERENCES `support_tickets(id)` ON DELETE CASCADE; `fk_support_status_hist_user` (`changed_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_support_status_hist_ticket` ON `(ticket_id, created_at DESC)`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `support_tickets`

---

### TABLE: `support_ticket_attachments`
* **PURPOSE**: Linking user file attachments to specific support ticket messages.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `ticket_message_id` | `UUID` | NOT NULL | DEFAULT None
  * `file_attachment_id` | `UUID` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_support_attach_msg` (`ticket_message_id`) REFERENCES `support_ticket_messages(id)` ON DELETE CASCADE; `fk_support_attach_file` (`file_attachment_id`) REFERENCES `file_attachments(id)` ON DELETE RESTRICT
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_support_attach_msg` ON `ticket_message_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: No
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 5 Years
* **RELATIONSHIPS**: N:1 with `support_ticket_messages`, N:1 with `file_attachments`

---

### TABLE: `lost_found_reports`
* **PURPOSE**: Passenger lost baggage reports and bus conductor found item claims.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `report_number` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `trip_id` | `UUID` | NULL | DEFAULT None
  * `vehicle_id` | `UUID` | NULL | DEFAULT None
  * `passenger_id` | `UUID` | NULL | DEFAULT None
  * `item_category` | `VARCHAR(50)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NOT NULL | DEFAULT None
  * `lost_at_stop_id` | `UUID` | NULL | DEFAULT None
  * `reported_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `found_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `claimed_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
  * `status` | `VARCHAR(32)` | NOT NULL | DEFAULT `'REPORTED'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_lost_found_trip` (`trip_id`) REFERENCES `trips(id)` ON DELETE SET NULL; `fk_lost_found_veh` (`vehicle_id`) REFERENCES `vehicles(id)` ON DELETE SET NULL; `fk_lost_found_user` (`passenger_id`) REFERENCES `users(id)` ON DELETE SET NULL; `fk_lost_found_stop` (`lost_at_stop_id`) REFERENCES `stops(id)` ON DELETE SET NULL
* **UNIQUE**: `uq_lost_found_num` (`report_number`)
* **CHECK CONSTRAINTS**: `chk_lost_found_status` (`status IN ('REPORTED', 'FOUND_IN_STORAGE', 'CLAIMED', 'AUCTIONED_DISPOSED', 'UNRESOLVED')`)
* **INDEXES**: `idx_lost_found_num` ON `report_number`; `idx_lost_found_trip` ON `trip_id`
* **TRIGGERS**: `trg_lost_found_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `trips`, N:1 with `vehicles`, 1:N with `lost_found_items`, 1:N with `lost_found_status_history`

---

### TABLE: `lost_found_items`
* **PURPOSE**: Physical warehouse inventory description of found property.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `report_id` | `UUID` | NOT NULL | DEFAULT None
  * `item_name` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NOT NULL | DEFAULT None
  * `storage_location` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `condition` | `VARCHAR(50)` | NOT NULL | DEFAULT `'GOOD'`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_lost_found_items_report` (`report_id`) REFERENCES `lost_found_reports(id)` ON DELETE CASCADE
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_lost_found_items_report` ON `report_id`
* **TRIGGERS**: `trg_lost_found_items_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `lost_found_reports`

---

### TABLE: `lost_found_status_history`
* **PURPOSE**: Custody transition tracking for found passenger items.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `report_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `new_status` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `notes` | `TEXT` | NULL | DEFAULT None
  * `changed_by` | `UUID` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_lost_found_hist_report` (`report_id`) REFERENCES `lost_found_reports(id)` ON DELETE CASCADE; `fk_lost_found_hist_user` (`changed_by`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_lost_found_hist_report` ON `report_id`
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 3 Years
* **RELATIONSHIPS**: N:1 with `lost_found_reports`

---

## DOMAIN 19: AUDIT, SECURITY & SYSTEM CONFIGURATION DOMAIN

### TABLE: `audit_logs`
* **PURPOSE**: Master, immutable system change-data-capture log recording actor, IP, entity, and JSONB before/after values.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `actor_user_id` | `UUID` | NULL | DEFAULT None
  * `action` | `VARCHAR(32)` | NOT NULL | DEFAULT None
  * `entity_type` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `entity_id` | `UUID` | NOT NULL | DEFAULT None
  * `old_values` | `JSONB` | NULL | DEFAULT None
  * `new_values` | `JSONB` | NULL | DEFAULT None
  * `ip_address` | `INET` | NULL | DEFAULT None
  * `user_agent` | `TEXT` | NULL | DEFAULT None
  * `request_id` | `VARCHAR(64)` | NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_audit_logs_actor` (`actor_user_id`) REFERENCES `users(id)` ON DELETE SET NULL
* **UNIQUE**: None
* **CHECK CONSTRAINTS**: `chk_audit_logs_action` (`action IN ('INSERT', 'UPDATE', 'DELETE', 'STATE_TRANSITION')`)
* **INDEXES**: `idx_audit_logs_entity` ON `(entity_type, entity_id)`; `idx_audit_logs_actor` ON `actor_user_id`; `idx_audit_logs_time` ON `created_at DESC`
* **TRIGGERS**: None (Immutable ledger; strictly append-only)
* **AUDIT REQUIRED**: No (This is the audit repository)
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 7 Years (Statutory compliance requirement)
* **RELATIONSHIPS**: N:1 with `users` (as actor)

---

### TABLE: `system_settings`
* **PURPOSE**: Key-value operational configurations (e.g., maximum pre-booking window, cancellation grace period).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `setting_key` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `setting_value` | `JSONB` | NOT NULL | DEFAULT None
  * `value_type` | `VARCHAR(32)` | NOT NULL | DEFAULT `'STRING'`
  * `description` | `TEXT` | NULL | DEFAULT None
  * `is_public` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_system_settings_key` (`setting_key`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_system_settings_key` ON `setting_key`
* **TRIGGERS**: `trg_system_settings_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`); `trg_system_settings_audit` (AFTER UPDATE EXECUTE `fn_record_audit_log()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: None

---

### TABLE: `feature_flags`
* **PURPOSE**: Dynamic feature toggles and gradual rollout rules.
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `flag_key` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `name` | `VARCHAR(150)` | NOT NULL | DEFAULT None
  * `description` | `TEXT` | NULL | DEFAULT None
  * `is_enabled` | `BOOLEAN` | NOT NULL | DEFAULT `FALSE`
  * `target_rules` | `JSONB` | NOT NULL | DEFAULT `'{}'::jsonb`
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `updated_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: None
* **UNIQUE**: `uq_feature_flags_key` (`flag_key`)
* **CHECK CONSTRAINTS**: None
* **INDEXES**: `idx_feature_flags_key` ON `flag_key`
* **TRIGGERS**: `trg_feature_flags_updated_at` (BEFORE UPDATE EXECUTE `fn_set_updated_at()`)
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: Permanent
* **RELATIONSHIPS**: None

---

### TABLE: `file_attachments`
* **PURPOSE**: Cloud object storage metadata catalog (S3 / GCS keys, SHA-256 hashes, MIME types).
* **COLUMNS**:
  * `id` | `UUID` | NOT NULL | DEFAULT `gen_random_uuid()`
  * `entity_type` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `entity_id` | `UUID` | NOT NULL | DEFAULT None
  * `file_name` | `VARCHAR(255)` | NOT NULL | DEFAULT None
  * `storage_key` | `VARCHAR(512)` | NOT NULL | DEFAULT None
  * `content_type` | `VARCHAR(100)` | NOT NULL | DEFAULT None
  * `file_size` | `BIGINT` | NOT NULL | DEFAULT None
  * `checksum` | `VARCHAR(64)` | NOT NULL | DEFAULT None
  * `uploaded_by` | `UUID` | NOT NULL | DEFAULT None
  * `created_at` | `TIMESTAMPTZ` | NOT NULL | DEFAULT `CURRENT_TIMESTAMP`
  * `deleted_at` | `TIMESTAMPTZ` | NULL | DEFAULT None
* **PRIMARY KEY**: `id`
* **FOREIGN KEYS**: `fk_file_attachments_uploader` (`uploaded_by`) REFERENCES `users(id)` ON DELETE RESTRICT
* **UNIQUE**: `uq_file_attachments_key` (`storage_key`)
* **CHECK CONSTRAINTS**: `chk_file_attachments_size` (`file_size > 0`)
* **INDEXES**: `idx_file_attachments_entity` ON `(entity_type, entity_id)` WHERE deleted_at IS NULL
* **TRIGGERS**: None
* **AUDIT REQUIRED**: Yes
* **HISTORICAL DATA REQUIRED**: Yes
* **RETENTION**: 7 Years
* **RELATIONSHIPS**: N:1 with `users` (uploader)
