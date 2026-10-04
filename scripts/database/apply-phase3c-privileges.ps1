# ==============================================================================
# MOVANA PLATFORM -- PHASE 3C PRIVILEGES & DEFAULT ACLs IMPLEMENTATION SCRIPT
# Script: scripts/database/apply-phase3c-privileges.ps1
# Description: Atomically applies least-privilege database, schema, table, view,
#              function privileges, and default ACLs strictly against the 'movana' database.
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$User = "postgres",
    [switch]$CheckOnly
)

if ($env:DB_HOST) { $HostName = $env:DB_HOST }
if ($env:DB_PORT) { $Port = [int]$env:DB_PORT }
if ($env:DB_ADMIN_USER) { $User = $env:DB_ADMIN_USER } elseif ($env:DB_USER) { $User = $env:DB_USER }

$ErrorActionPreference = "Stop"

# HARDCODED IMMUTABLE SAFETY CONSTRAINT: TARGET DATABASE CAN ONLY BE 'movana'
Set-Variable -Name TargetDatabase -Value "movana" -Option ReadOnly

$modeStr = if ($CheckOnly) { "CHECK-ONLY (Dry Run / Preflight)" } else { "LIVE TRANSACTIONAL EXECUTION" }

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MOVANA PLATFORM -- PHASE 3C PRIVILEGE HARDENING" -ForegroundColor Cyan
Write-Host "TARGET DATABASE: $TargetDatabase (ENFORCED)" -ForegroundColor Cyan
Write-Host "HOST:            $HostName" -ForegroundColor Cyan
Write-Host "PORT:            $Port" -ForegroundColor Cyan
Write-Host "USER:            $User" -ForegroundColor Cyan
Write-Host "MODE:            $modeStr" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# SAFETY CHECK 1: Live Engine Pre-Flight Database Identity Verification
Write-Host ""
Write-Host "[Safety Check 1] Verifying active PostgreSQL connection and database identity..." -ForegroundColor Yellow

$dbCheckQuery = "SELECT current_database();"
try {
    $currentDb = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $dbCheckQuery 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL ERROR] Failed to connect to PostgreSQL server: $currentDb" -ForegroundColor Red
        Write-Host "Ensure PostgreSQL is running and PGPASSWORD environment variable or .pgpass is configured." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[CRITICAL ERROR] Exception during database connection: $_" -ForegroundColor Red
    exit 1
}

$trimmedDb = "$currentDb".Trim()
if ($trimmedDb -ne $TargetDatabase) {
    Write-Host "[CRITICAL SAFETY ABORT] Expected database '$TargetDatabase', but connected to '$trimmedDb'!" -ForegroundColor Red
    Write-Host "EXECUTION HALTED. Never apply privileges against unintended databases." -ForegroundColor Red
    exit 1
}
Write-Host "[CONFIRMED] Active PostgreSQL connection verified strictly to database '$trimmedDb'." -ForegroundColor Green

# SAFETY CHECK 2: Role Inventory Verification (Phase 3B Baseline)
Write-Host ""
Write-Host "[Safety Check 2] Verifying Phase 3B baseline roles in pg_roles..." -ForegroundColor Yellow
$rolesQuery = "SELECT rolname FROM pg_roles WHERE rolname IN ('movana_owner', 'movana_app', 'movana_readonly', 'movana_migration');"
$foundRoles = @(psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $rolesQuery 2>&1 | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne "" })

$expectedRoles = @("movana_owner", "movana_app", "movana_readonly", "movana_migration")
foreach ($r in $expectedRoles) {
    if ($foundRoles -notcontains $r) {
        Write-Host "[CRITICAL ERROR] Missing required role '$r'. Phase 3B must be completed first." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Role verified: $r" -ForegroundColor Green
}

# SAFETY CHECK 3: Role Membership Verification
Write-Host ""
Write-Host "[Safety Check 3] Verifying role memberships..." -ForegroundColor Yellow
$membershipQuery = "SELECT concat(r_role.rolname, ' -> ', r_member.rolname) FROM pg_auth_members m JOIN pg_roles r_role ON m.roleid = r_role.oid JOIN pg_roles r_member ON m.member = r_member.oid WHERE r_role.rolname LIKE 'movana%' OR r_member.rolname LIKE 'movana%';"
$memberships = @(psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $membershipQuery 2>&1 | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne "" })

if ($memberships.Count -ne 1 -or $memberships[0] -ne "movana_owner -> movana_migration") {
    Write-Host "[CRITICAL ERROR] Unexpected role membership detected: $($memberships -join ', ')" -ForegroundColor Red
    Write-Host "Expected exactly: 'movana_owner -> movana_migration'." -ForegroundColor Red
    exit 1
}
Write-Host "  Membership verified: $($memberships[0])" -ForegroundColor Green

# SAFETY CHECK 4: Migration Ledger Integrity
Write-Host ""
Write-Host "[Safety Check 4] Verifying migration ledger state in public.schema_migrations..." -ForegroundColor Yellow
$migCountQuery = "SELECT count(*) FROM public.schema_migrations;"
$migCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $migCountQuery 2>&1)
$migCount = "$migCount".Trim()
if ($migCount -ne "25") {
    Write-Host "[CRITICAL ERROR] Expected exactly 25 migrations, found: $migCount" -ForegroundColor Red
    exit 1
}
Write-Host "  Ledger verified: Exactly 25 applied migrations (V001-V025)." -ForegroundColor Green

# SAFETY CHECK 5: Object Inventory Baseline
Write-Host ""
Write-Host "[Safety Check 5] Verifying catalog object baseline..." -ForegroundColor Yellow
$tableCountQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');"
$viewCountQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind = 'v';"
$appFuncCountQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('fn_calculate_trip_available_seats','fn_generate_booking_reference','fn_generate_invoice_number','fn_log_booking_status_transition','fn_log_trip_status_transition','fn_record_audit_log','fn_set_updated_at');"

$tableCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $tableCountQuery 2>&1)
$tableCount = "$tableCount".Trim()
$viewCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $viewCountQuery 2>&1)
$viewCount = "$viewCount".Trim()
$appFuncCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $appFuncCountQuery 2>&1)
$appFuncCount = "$appFuncCount".Trim()

Write-Host "  Base tables count:    $tableCount (Expected: 113)" -ForegroundColor White
Write-Host "  Views count:          $viewCount (Expected: 8)" -ForegroundColor White
Write-Host "  App functions count:  $appFuncCount (Expected: 7)" -ForegroundColor White

if ($tableCount -ne "113" -or $viewCount -ne "8" -or $appFuncCount -ne "7") {
    Write-Host "[CRITICAL ERROR] Object baseline counts mismatch!" -ForegroundColor Red
    exit 1
}

if ($CheckOnly) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "[CHECK-ONLY MODE] Preflight verification complete. All safety checks PASSED." -ForegroundColor Green
    Write-Host "Target database '$trimmedDb' is ready for Phase 3C privilege execution." -ForegroundColor Cyan
    Write-Host "Zero privilege changes were made." -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    exit 0
}

# EXECUTION PHASE: Single Atomic Transaction
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "EXECUTING PHASE 3C PRIVILEGE HARDENING SEQUENCE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$phase3cSqlLines = @(
    "\set ON_ERROR_STOP on",
    "BEGIN;",
    "",
    "-- 1. DATABASE-LEVEL PRIVILEGES",
    "GRANT CONNECT, TEMPORARY ON DATABASE movana TO movana_owner, movana_app, movana_migration;",
    "GRANT CONNECT ON DATABASE movana TO movana_readonly;",
    "REVOKE TEMPORARY, CONNECT ON DATABASE movana FROM PUBLIC;",
    "",
    "-- 2. SCHEMA-LEVEL PRIVILEGES (schema 'public')",
    "GRANT USAGE, CREATE ON SCHEMA public TO movana_owner, movana_migration;",
    "GRANT USAGE ON SCHEMA public TO movana_app, movana_readonly;",
    "REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
    "",
    "-- 3. TABLE & VIEW PRIVILEGES - BASELINE GRANTS",
    "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO movana_owner, movana_migration;",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO movana_app;",
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO movana_readonly;",
    "",
    "-- 4. CATEGORY C - AUDIT & SECURITY TABLES (APPEND-ONLY FOR movana_app)",
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs, public.security_events, public.login_attempts FROM movana_app, movana_readonly;",
    "",
    "-- 5. CATEGORY B - SENSITIVE AUTH & TOKEN TABLES (ISOLATE FROM movana_readonly)",
    "REVOKE ALL PRIVILEGES ON TABLE public.password_reset_tokens, public.email_verification_tokens, public.user_sessions, public.payment_methods, public.driver_verifications FROM movana_readonly;",
    "",
    "-- 6. CATEGORY D - REFERENCE & CONFIGURATION CATALOGS (READ-ONLY FOR movana_app)",
    "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.routes, public.stops, public.route_stops, public.route_versions, public.service_calendars, public.service_calendar_exceptions, public.trip_schedules, public.schedule_stops, public.seat_layouts, public.seats, public.fare_products, public.fare_rules, public.fare_prices, public.trip_fares, public.coupons, public.discounts, public.vehicle_types, public.vehicle_manufacturers, public.vehicle_models, public.driver_document_types, public.incident_types, public.incident_severity_levels, public.review_categories, public.roles, public.permissions, public.role_permissions FROM movana_app, movana_readonly;",
    "",
    "-- 6b. CATEGORY E - OPERATIONAL VIEWS (READ-ONLY FOR ALL ROLES)",
    "REVOKE INSERT, UPDATE, DELETE ON TABLE public.vw_active_vehicle_locations, public.vw_available_trip_seats, public.vw_booking_summary, public.vw_driver_trip_summary, public.vw_payment_summary, public.vw_route_schedule_summary, public.vw_trip_current_status, public.vw_vehicle_health_summary FROM movana_app, movana_readonly;",
    "",
    "-- 7. CATEGORY F - MIGRATION LEDGER (STRICT ISOLATION FROM APP & READONLY)",
    "REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM movana_app, movana_readonly;",
    "",
    "-- 8. APPLICATION FUNCTIONS & EXTENSION PRESERVATION",
    "REVOKE EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid) FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.fn_generate_booking_reference() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.fn_generate_invoice_number() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.fn_log_booking_status_transition() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.fn_log_trip_status_transition() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.fn_record_audit_log() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.fn_set_updated_at() FROM PUBLIC;",
    "",
    "GRANT EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid) TO movana_app;",
    "GRANT EXECUTE ON FUNCTION public.fn_generate_booking_reference() TO movana_app;",
    "GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_number() TO movana_app;",
    "GRANT EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid) TO movana_readonly;",
    "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO movana_owner, movana_migration;",
    "",
    "-- 9. DEFAULT PRIVILEGES (ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner)",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO movana_app;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT SELECT ON TABLES TO movana_readonly;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO movana_app;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT EXECUTE ON ROUTINES TO movana_app, movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public GRANT USAGE ON TYPES TO movana_app, movana_readonly, movana_owner, movana_migration;",
    "",
    "-- 10. DEFAULT PRIVILEGES MIRRORING FOR ROLE movana_migration",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO movana_app;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT SELECT ON TABLES TO movana_readonly;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO movana_app;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT EXECUTE ON ROUTINES TO movana_app, movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public GRANT USAGE ON TYPES TO movana_app, movana_readonly, movana_owner, movana_migration;",
    "",
    "COMMIT;"
)

$phase3cSql = $phase3cSqlLines -join "`r`n"
$tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"

try {
    [System.IO.File]::WriteAllText($tempSqlFile, $phase3cSql, [System.Text.Encoding]::ASCII)
    
    Write-Host "[Executing SQL Transaction] Running apply script with ON_ERROR_STOP=1..." -ForegroundColor Yellow
    $execOutput = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -f $tempSqlFile 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL TRANSACTION FAILURE] SQL execution aborted and rolled back!" -ForegroundColor Red
        Write-Host $execOutput -ForegroundColor Red
        exit 1
    }
    Write-Host "[SUCCESS] Phase 3C transaction committed cleanly." -ForegroundColor Green
} finally {
    if (Test-Path $tempSqlFile) {
        Remove-Item -Path $tempSqlFile -Force -ErrorAction SilentlyContinue
    }
}

# ==============================================================================
# POST-IMPLEMENTATION VERIFICATION
# ==============================================================================
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "POST-IMPLEMENTATION SECURITY & PRIVILEGE VERIFICATION" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Database ACL
$dbAclQuery = "SELECT has_database_privilege('public', 'movana', 'CONNECT'), has_database_privilege('public', 'movana', 'TEMPORARY'), has_database_privilege('movana_app', 'movana', 'CONNECT'), has_database_privilege('movana_readonly', 'movana', 'CONNECT');"
$dbAclRes = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $dbAclQuery 2>&1)
$dbAclRes = "$dbAclRes".Trim().Split('|')
Write-Host "Database Permissions:" -ForegroundColor White
Write-Host "  PUBLIC CONNECT:           $($dbAclRes[0]) (Expected: f)" -ForegroundColor $(if ($dbAclRes[0] -eq 'f') { "Green" } else { "Red" })
Write-Host "  PUBLIC TEMPORARY:         $($dbAclRes[1]) (Expected: f)" -ForegroundColor $(if ($dbAclRes[1] -eq 'f') { "Green" } else { "Red" })
Write-Host "  movana_app CONNECT:       $($dbAclRes[2]) (Expected: t)" -ForegroundColor $(if ($dbAclRes[2] -eq 't') { "Green" } else { "Red" })
Write-Host "  movana_readonly CONNECT:  $($dbAclRes[3]) (Expected: t)" -ForegroundColor $(if ($dbAclRes[3] -eq 't') { "Green" } else { "Red" })

# 2. Category B Isolation Check (5 sensitive tables)
$catBQuery = "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'movana_readonly' AND table_name IN ('password_reset_tokens', 'email_verification_tokens', 'user_sessions', 'payment_methods', 'driver_verifications');"
$catBGrants = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $catBQuery 2>&1)
$catBGrants = "$catBGrants".Trim()
Write-Host "Category B Isolation:" -ForegroundColor White
Write-Host "  movana_readonly sensitive table grants: $catBGrants (Expected: 0)" -ForegroundColor $(if ($catBGrants -eq '0') { "Green" } else { "Red" })

# 3. Category C Immutability Check (Audit logs)
$catCQuery = "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'movana_app' AND table_name IN ('audit_logs', 'security_events', 'login_attempts') AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');"
$catCGrants = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $catCQuery 2>&1)
$catCGrants = "$catCGrants".Trim()
Write-Host "Category C Append-Only Enforcement:" -ForegroundColor White
Write-Host "  movana_app audit modification grants:  $catCGrants (Expected: 0)" -ForegroundColor $(if ($catCGrants -eq '0') { "Green" } else { "Red" })

# 4. Category F Isolation Check (Migration ledger)
$catFQuery = "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee IN ('movana_app', 'movana_readonly') AND table_name = 'schema_migrations';"
$catFGrants = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $catFQuery 2>&1)
$catFGrants = "$catFGrants".Trim()
Write-Host "Category F Migration Ledger Isolation:" -ForegroundColor White
Write-Host "  movana_app/readonly schema_migrations grants: $catFGrants (Expected: 0)" -ForegroundColor $(if ($catFGrants -eq '0') { "Green" } else { "Red" })

# 5. Application Functions Hardening
$funcAclQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('fn_calculate_trip_available_seats','fn_generate_booking_reference','fn_generate_invoice_number','fn_log_booking_status_transition','fn_log_trip_status_transition','fn_record_audit_log','fn_set_updated_at') AND has_function_privilege('public', p.oid, 'EXECUTE');"
$pubFuncs = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $funcAclQuery 2>&1)
$pubFuncs = "$pubFuncs".Trim()
Write-Host "Application Function Hardening:" -ForegroundColor White
Write-Host "  PUBLIC EXECUTE on custom routines: $pubFuncs (Expected: 0)" -ForegroundColor $(if ($pubFuncs -eq '0') { "Green" } else { "Red" })

# 6. Default ACL verification
$defAclQuery = "SELECT count(*) FROM pg_default_acl WHERE defaclrole IN (SELECT oid FROM pg_roles WHERE rolname IN ('movana_owner', 'movana_migration'));"
$defAclCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $defAclQuery 2>&1)
$defAclCount = "$defAclCount".Trim()
Write-Host "Default ACL Configuration:" -ForegroundColor White
Write-Host "  pg_default_acl entries configured: $defAclCount (Expected: > 0)" -ForegroundColor $(if ([int]$defAclCount -gt 0) { "Green" } else { "Red" })

# 7. Data count verification (No data modification)
$countsQuery = "SELECT (SELECT count(*) FROM public.users) || '|' || (SELECT count(*) FROM public.bookings) || '|' || (SELECT count(*) FROM public.trips) || '|' || (SELECT count(*) FROM public.vehicle_location_history);"
$countsRes = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $countsQuery 2>&1)
$countsRes = "$countsRes".Trim().Split('|')
Write-Host "Data Integrity:" -ForegroundColor White
Write-Host "  Users:    $($countsRes[0]) (Expected: 68)" -ForegroundColor $(if ($countsRes[0] -eq '68') { "Green" } else { "Red" })
Write-Host "  Bookings: $($countsRes[1]) (Expected: 181)" -ForegroundColor $(if ($countsRes[1] -eq '181') { "Green" } else { "Red" })
Write-Host "  Trips:    $($countsRes[2]) (Expected: 61)" -ForegroundColor $(if ($countsRes[2] -eq '61') { "Green" } else { "Red" })
Write-Host "  GPS Rows: $($countsRes[3]) (Expected: 1600)" -ForegroundColor $(if ($countsRes[3] -eq '1600') { "Green" } else { "Red" })

if ($dbAclRes[0] -ne 'f' -or $catBGrants -ne '0' -or $catCGrants -ne '0' -or $catFGrants -ne '0' -or $pubFuncs -ne '0' -or [int]$defAclCount -le 0 -or $countsRes[0] -ne '68' -or $countsRes[1] -ne '181' -or $countsRes[2] -ne '61' -or $countsRes[3] -ne '1600') {
    Write-Host ""
    Write-Host "[CRITICAL ERROR] Post-implementation verification checks FAILED!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "PHASE 3C PRIVILEGE HARDENING COMPLETED SUCCESSFULLY" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
exit 0
