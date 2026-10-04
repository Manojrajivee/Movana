# ==============================================================================
# MOVANA PLATFORM -- PHASE 3D OBJECT OWNERSHIP TRANSFER IMPLEMENTATION SCRIPT
# Script: scripts/database/apply-phase3d-ownership.ps1
# Description: Atomically transfers ownership of exactly 128 Movana application
#              objects (113 tables, 8 views, 7 functions) from 'postgres' to
#              'movana_owner' strictly against the 'movana' database.
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
Write-Host "MOVANA PLATFORM -- PHASE 3D OBJECT OWNERSHIP TRANSFER" -ForegroundColor Cyan
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
    Write-Host "EXECUTION HALTED. Never transfer ownership in unintended databases." -ForegroundColor Red
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

# SAFETY CHECK 4: Schema 'public' Ownership Verification
Write-Host ""
Write-Host "[Safety Check 4] Verifying schema public owner..." -ForegroundColor Yellow
$schemaOwnerQuery = "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public';"
$schemaOwner = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $schemaOwnerQuery 2>&1)
$schemaOwner = "$schemaOwner".Trim()
if ($schemaOwner -ne "pg_database_owner") {
    Write-Host "[CRITICAL ERROR] Schema public owner is '$schemaOwner', expected 'pg_database_owner'!" -ForegroundColor Red
    exit 1
}
Write-Host "  Schema public owner verified: pg_database_owner" -ForegroundColor Green

# SAFETY CHECK 5: Extensions and Extension Function Isolation Verification
Write-Host ""
Write-Host "[Safety Check 5] Verifying extensions and extension functions..." -ForegroundColor Yellow
$extQuery = "SELECT count(*) FROM pg_extension WHERE extname IN ('btree_gist', 'citext', 'pgcrypto', 'plpgsql');"
$extCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $extQuery 2>&1).Trim()
if ($extCount -ne "4") {
    Write-Host "[CRITICAL ERROR] Expected 4 extensions, found: $extCount" -ForegroundColor Red
    exit 1
}
$extFuncQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' WHERE n.nspname = 'public';"
$extFuncCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $extFuncQuery 2>&1).Trim()
if ($extFuncCount -ne "271") {
    Write-Host "[CRITICAL ERROR] Expected 271 extension functions in public, found: $extFuncCount" -ForegroundColor Red
    exit 1
}
Write-Host "  Extensions verified: 4 extensions present." -ForegroundColor Green
Write-Host "  Extension functions verified: 271 extension routines in public." -ForegroundColor Green

# SAFETY CHECK 6: Pre-Execution Object Inventory Baseline
Write-Host ""
Write-Host "[Safety Check 6] Verifying pre-execution object counts and current owners..." -ForegroundColor Yellow
$tableCountQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_get_userbyid(c.relowner) = 'postgres';"
$viewCountQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind = 'v' AND pg_get_userbyid(c.relowner) = 'postgres';"
$appFuncCountQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('fn_calculate_trip_available_seats','fn_generate_booking_reference','fn_generate_invoice_number','fn_log_booking_status_transition','fn_log_trip_status_transition','fn_record_audit_log','fn_set_updated_at') AND pg_get_userbyid(p.proowner) = 'postgres';"

$tableCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $tableCountQuery 2>&1).Trim()
$viewCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $viewCountQuery 2>&1).Trim()
$appFuncCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $appFuncCountQuery 2>&1).Trim()

Write-Host "  Base tables owned by postgres:   $tableCount (Expected: 113)" -ForegroundColor White
Write-Host "  Views owned by postgres:         $viewCount (Expected: 8)" -ForegroundColor White
Write-Host "  App functions owned by postgres: $appFuncCount (Expected: 7)" -ForegroundColor White

if ($tableCount -ne "113" -or $viewCount -ne "8" -or $appFuncCount -ne "7") {
    Write-Host "[CRITICAL ERROR] Pre-execution object baseline mismatch! Objects may have already been altered or are missing." -ForegroundColor Red
    exit 1
}

# SAFETY CHECK 7: Data Row Counts Baseline
Write-Host ""
Write-Host "[Safety Check 7] Verifying data row count baseline..." -ForegroundColor Yellow
$rowCountQuery = "SELECT concat(c.relname, '=', count(*)) FROM (SELECT 'users' as relname, count(*) as cnt FROM public.users UNION ALL SELECT 'bookings', count(*) FROM public.bookings UNION ALL SELECT 'trips', count(*) FROM public.trips UNION ALL SELECT 'vehicle_location_history', count(*) FROM public.vehicle_location_history) t JOIN (SELECT 1) x ON true GROUP BY relname;"
$usersCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.users;" 2>&1).Trim()
$bookingsCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.bookings;" 2>&1).Trim()
$tripsCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.trips;" 2>&1).Trim()
$vlhCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.vehicle_location_history;" 2>&1).Trim()

if ($usersCount -ne "68" -or $bookingsCount -ne "181" -or $tripsCount -ne "61" -or $vlhCount -ne "1600") {
    Write-Host "[CRITICAL ERROR] Baseline row counts mismatch! users=$usersCount, bookings=$bookingsCount, trips=$tripsCount, vehicle_location_history=$vlhCount" -ForegroundColor Red
    exit 1
}
Write-Host "  Row counts verified: users=68, bookings=181, trips=61, vehicle_location_history=1600" -ForegroundColor Green

if ($CheckOnly) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "[CHECK-ONLY MODE] Preflight verification complete. All safety checks PASSED." -ForegroundColor Green
    Write-Host "Target database '$trimmedDb' is 100% ready for Phase 3D ownership transfer." -ForegroundColor Cyan
    Write-Host "Zero ownership changes were made." -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    exit 0
}

# ==============================================================================
# EXECUTION PHASE: Single Atomic Transaction (128 DDL Statements)
# ==============================================================================
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "EXECUTING PHASE 3D OBJECT OWNERSHIP TRANSFER (128 STATEMENTS)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$phase3dSqlLines = @(
    "\set ON_ERROR_STOP on",
    "BEGIN;",
    "",
    "-- STEP 1: Partitioned Table Parent (MANDATORY ORDER: PARENT FIRST)",
    "ALTER TABLE public.vehicle_location_history OWNER TO movana_owner;",
    "",
    "-- STEP 2: Partition Child Tables (8 child partitions)",
    "ALTER TABLE public.vehicle_location_history_default OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2026m09 OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2026m10 OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2026m11 OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2026m12 OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2027m01 OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2027m02 OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_location_history_y2027m03 OWNER TO movana_owner;",
    "",
    "-- STEP 3: Migration Ledger Table",
    "ALTER TABLE public.schema_migrations OWNER TO movana_owner;",
    "",
    "-- STEP 4: 103 Standard Base Tables (alphabetical)",
    "ALTER TABLE public.audit_logs OWNER TO movana_owner;",
    "ALTER TABLE public.booking_cancellations OWNER TO movana_owner;",
    "ALTER TABLE public.booking_items OWNER TO movana_owner;",
    "ALTER TABLE public.booking_passengers OWNER TO movana_owner;",
    "ALTER TABLE public.booking_reschedules OWNER TO movana_owner;",
    "ALTER TABLE public.booking_seats OWNER TO movana_owner;",
    "ALTER TABLE public.booking_status_history OWNER TO movana_owner;",
    "ALTER TABLE public.bookings OWNER TO movana_owner;",
    "ALTER TABLE public.coupon_redemptions OWNER TO movana_owner;",
    "ALTER TABLE public.coupons OWNER TO movana_owner;",
    "ALTER TABLE public.discounts OWNER TO movana_owner;",
    "ALTER TABLE public.driver_assignments OWNER TO movana_owner;",
    "ALTER TABLE public.driver_availability OWNER TO movana_owner;",
    "ALTER TABLE public.driver_document_types OWNER TO movana_owner;",
    "ALTER TABLE public.driver_documents OWNER TO movana_owner;",
    "ALTER TABLE public.driver_emergency_contacts OWNER TO movana_owner;",
    "ALTER TABLE public.driver_safety_events OWNER TO movana_owner;",
    "ALTER TABLE public.driver_status_history OWNER TO movana_owner;",
    "ALTER TABLE public.driver_verifications OWNER TO movana_owner;",
    "ALTER TABLE public.drivers OWNER TO movana_owner;",
    "ALTER TABLE public.email_verification_tokens OWNER TO movana_owner;",
    "ALTER TABLE public.emergency_contacts OWNER TO movana_owner;",
    "ALTER TABLE public.emergency_events OWNER TO movana_owner;",
    "ALTER TABLE public.fare_prices OWNER TO movana_owner;",
    "ALTER TABLE public.fare_products OWNER TO movana_owner;",
    "ALTER TABLE public.fare_rules OWNER TO movana_owner;",
    "ALTER TABLE public.feature_flags OWNER TO movana_owner;",
    "ALTER TABLE public.file_attachments OWNER TO movana_owner;",
    "ALTER TABLE public.geofence_events OWNER TO movana_owner;",
    "ALTER TABLE public.geofences OWNER TO movana_owner;",
    "ALTER TABLE public.incident_actions OWNER TO movana_owner;",
    "ALTER TABLE public.incident_reports OWNER TO movana_owner;",
    "ALTER TABLE public.incident_severity_levels OWNER TO movana_owner;",
    "ALTER TABLE public.incident_types OWNER TO movana_owner;",
    "ALTER TABLE public.incidents OWNER TO movana_owner;",
    "ALTER TABLE public.invoice_items OWNER TO movana_owner;",
    "ALTER TABLE public.invoices OWNER TO movana_owner;",
    "ALTER TABLE public.login_attempts OWNER TO movana_owner;",
    "ALTER TABLE public.lost_found_items OWNER TO movana_owner;",
    "ALTER TABLE public.lost_found_reports OWNER TO movana_owner;",
    "ALTER TABLE public.lost_found_status_history OWNER TO movana_owner;",
    "ALTER TABLE public.maintenance_items OWNER TO movana_owner;",
    "ALTER TABLE public.maintenance_parts OWNER TO movana_owner;",
    "ALTER TABLE public.maintenance_records OWNER TO movana_owner;",
    "ALTER TABLE public.maintenance_schedules OWNER TO movana_owner;",
    "ALTER TABLE public.notification_deliveries OWNER TO movana_owner;",
    "ALTER TABLE public.notification_preferences OWNER TO movana_owner;",
    "ALTER TABLE public.notification_templates OWNER TO movana_owner;",
    "ALTER TABLE public.notifications OWNER TO movana_owner;",
    "ALTER TABLE public.passenger_profiles OWNER TO movana_owner;",
    "ALTER TABLE public.password_reset_tokens OWNER TO movana_owner;",
    "ALTER TABLE public.payment_attempts OWNER TO movana_owner;",
    "ALTER TABLE public.payment_events OWNER TO movana_owner;",
    "ALTER TABLE public.payment_methods OWNER TO movana_owner;",
    "ALTER TABLE public.payment_transactions OWNER TO movana_owner;",
    "ALTER TABLE public.payments OWNER TO movana_owner;",
    "ALTER TABLE public.permissions OWNER TO movana_owner;",
    "ALTER TABLE public.refund_transactions OWNER TO movana_owner;",
    "ALTER TABLE public.refunds OWNER TO movana_owner;",
    "ALTER TABLE public.review_categories OWNER TO movana_owner;",
    "ALTER TABLE public.review_responses OWNER TO movana_owner;",
    "ALTER TABLE public.reviews OWNER TO movana_owner;",
    "ALTER TABLE public.role_permissions OWNER TO movana_owner;",
    "ALTER TABLE public.roles OWNER TO movana_owner;",
    "ALTER TABLE public.route_stops OWNER TO movana_owner;",
    "ALTER TABLE public.route_versions OWNER TO movana_owner;",
    "ALTER TABLE public.routes OWNER TO movana_owner;",
    "ALTER TABLE public.schedule_stops OWNER TO movana_owner;",
    "ALTER TABLE public.seat_layouts OWNER TO movana_owner;",
    "ALTER TABLE public.seats OWNER TO movana_owner;",
    "ALTER TABLE public.security_events OWNER TO movana_owner;",
    "ALTER TABLE public.service_calendar_exceptions OWNER TO movana_owner;",
    "ALTER TABLE public.service_calendars OWNER TO movana_owner;",
    "ALTER TABLE public.stops OWNER TO movana_owner;",
    "ALTER TABLE public.support_ticket_attachments OWNER TO movana_owner;",
    "ALTER TABLE public.support_ticket_messages OWNER TO movana_owner;",
    "ALTER TABLE public.support_ticket_status_history OWNER TO movana_owner;",
    "ALTER TABLE public.support_tickets OWNER TO movana_owner;",
    "ALTER TABLE public.system_settings OWNER TO movana_owner;",
    "ALTER TABLE public.tracking_devices OWNER TO movana_owner;",
    "ALTER TABLE public.tracking_events OWNER TO movana_owner;",
    "ALTER TABLE public.trip_assignments OWNER TO movana_owner;",
    "ALTER TABLE public.trip_events OWNER TO movana_owner;",
    "ALTER TABLE public.trip_fares OWNER TO movana_owner;",
    "ALTER TABLE public.trip_schedules OWNER TO movana_owner;",
    "ALTER TABLE public.trip_status_history OWNER TO movana_owner;",
    "ALTER TABLE public.trip_stops OWNER TO movana_owner;",
    "ALTER TABLE public.trips OWNER TO movana_owner;",
    "ALTER TABLE public.user_addresses OWNER TO movana_owner;",
    "ALTER TABLE public.user_preferences OWNER TO movana_owner;",
    "ALTER TABLE public.user_roles OWNER TO movana_owner;",
    "ALTER TABLE public.user_sessions OWNER TO movana_owner;",
    "ALTER TABLE public.users OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_assignments OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_documents OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_inspection_issues OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_inspection_items OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_inspections OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_manufacturers OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_models OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_status_history OWNER TO movana_owner;",
    "ALTER TABLE public.vehicle_types OWNER TO movana_owner;",
    "ALTER TABLE public.vehicles OWNER TO movana_owner;",
    "",
    "-- STEP 5: 8 Operational Views",
    "ALTER VIEW public.vw_active_vehicle_locations OWNER TO movana_owner;",
    "ALTER VIEW public.vw_available_trip_seats OWNER TO movana_owner;",
    "ALTER VIEW public.vw_booking_summary OWNER TO movana_owner;",
    "ALTER VIEW public.vw_driver_trip_summary OWNER TO movana_owner;",
    "ALTER VIEW public.vw_payment_summary OWNER TO movana_owner;",
    "ALTER VIEW public.vw_route_schedule_summary OWNER TO movana_owner;",
    "ALTER VIEW public.vw_trip_current_status OWNER TO movana_owner;",
    "ALTER VIEW public.vw_vehicle_health_summary OWNER TO movana_owner;",
    "",
    "-- STEP 6: 7 Custom Application Functions",
    "ALTER FUNCTION public.fn_calculate_trip_available_seats(uuid) OWNER TO movana_owner;",
    "ALTER FUNCTION public.fn_generate_booking_reference() OWNER TO movana_owner;",
    "ALTER FUNCTION public.fn_generate_invoice_number() OWNER TO movana_owner;",
    "ALTER FUNCTION public.fn_log_booking_status_transition() OWNER TO movana_owner;",
    "ALTER FUNCTION public.fn_log_trip_status_transition() OWNER TO movana_owner;",
    "ALTER FUNCTION public.fn_record_audit_log() OWNER TO movana_owner;",
    "ALTER FUNCTION public.fn_set_updated_at() OWNER TO movana_owner;",
    "",
    '-- STEP 7: IN-TRANSACTION INTEGRITY ASSERTIONS',
    'DO $assert$',
    'DECLARE',
    '    v_rel_count integer;',
    '    v_func_count integer;',
    'BEGIN',
    '    SELECT count(*) INTO v_rel_count',
    '    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid',
    '    WHERE n.nspname = ''public'' AND c.relkind IN (''r'', ''p'', ''v'')',
    '      AND pg_get_userbyid(c.relowner) = ''movana_owner'';',
    '    IF v_rel_count <> 121 THEN',
    '        RAISE EXCEPTION ''In-transaction assertion failed: expected 121 relations owned by movana_owner, found %'', v_rel_count;',
    '    END IF;',
    '    ',
    '    SELECT count(*) INTO v_func_count',
    '    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid',
    '    WHERE n.nspname = ''public'' AND p.proname IN (''fn_calculate_trip_available_seats'',''fn_generate_booking_reference'',''fn_generate_invoice_number'',''fn_log_booking_status_transition'',''fn_log_trip_status_transition'',''fn_record_audit_log'',''fn_set_updated_at'')',
    '      AND pg_get_userbyid(p.proowner) = ''movana_owner'';',
    '    IF v_func_count <> 7 THEN',
    '        RAISE EXCEPTION ''In-transaction assertion failed: expected 7 functions owned by movana_owner, found %'', v_func_count;',
    '    END IF;',
    'END $assert$;',
    '',
    'COMMIT;'
)

$phase3dSql = $phase3dSqlLines -join "`r`n"
$tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
try {
    [System.IO.File]::WriteAllText($tempSqlFile, $phase3dSql, [System.Text.Encoding]::ASCII)
    
    Write-Host "[Executing SQL Transaction] Running apply script with ON_ERROR_STOP=1..." -ForegroundColor Yellow
    $execOutput = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -f $tempSqlFile 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL TRANSACTION FAILURE] SQL execution aborted and rolled back!" -ForegroundColor Red
        Write-Host $execOutput -ForegroundColor Red
        exit 1
    }
    $stopwatch.Stop()
    Write-Host "[SUCCESS] Phase 3D transaction committed cleanly in $($stopwatch.ElapsedMilliseconds) ms." -ForegroundColor Green
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
Write-Host "POST-IMPLEMENTATION OWNERSHIP VERIFICATION" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Relations Ownership
$postRelQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_get_userbyid(c.relowner) = 'movana_owner';"
$postViewQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind = 'v' AND pg_get_userbyid(c.relowner) = 'movana_owner';"
$postFuncQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('fn_calculate_trip_available_seats','fn_generate_booking_reference','fn_generate_invoice_number','fn_log_booking_status_transition','fn_log_trip_status_transition','fn_record_audit_log','fn_set_updated_at') AND pg_get_userbyid(p.proowner) = 'movana_owner';"

$postRelCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $postRelQuery 2>&1).Trim()
$postViewCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $postViewQuery 2>&1).Trim()
$postFuncCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $postFuncQuery 2>&1).Trim()

Write-Host "Application Object Ownership:" -ForegroundColor White
Write-Host "  Tables owned by movana_owner:    $postRelCount (Expected: 113)" -ForegroundColor $(if ($postRelCount -eq "113") { "Green" } else { "Red" })
Write-Host "  Views owned by movana_owner:     $postViewCount (Expected: 8)" -ForegroundColor $(if ($postViewCount -eq "8") { "Green" } else { "Red" })
Write-Host "  Functions owned by movana_owner: $postFuncCount (Expected: 7)" -ForegroundColor $(if ($postFuncCount -eq "7") { "Green" } else { "Red" })

# 2. Partition Hierarchy Verification
$partitionOwnerQuery = "SELECT c.relname, pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND (c.relname = 'vehicle_location_history' OR c.relname LIKE 'vehicle_location_history_%') ORDER BY c.relname;"
$partitions = @(psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $partitionOwnerQuery 2>&1)
$partitionPass = $true
foreach ($p in $partitions) {
    $parts = $p.Split('|')
    if ($parts.Length -eq 2) {
        if ($parts[1] -ne "movana_owner") { $partitionPass = $false }
    }
}
Write-Host "  Partition hierarchy ownership:   $(if ($partitionPass) { 'ALL 9 OWNED BY movana_owner' } else { 'MISMATCH' })" -ForegroundColor $(if ($partitionPass) { "Green" } else { "Red" })

# 3. Extension Functions Verification
$extFuncOwnerQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = 'postgres';"
$extFuncOwnerCount = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $extFuncOwnerQuery 2>&1).Trim()
Write-Host "  Extension functions (postgres):  $extFuncOwnerCount (Expected: 271)" -ForegroundColor $(if ($extFuncOwnerCount -eq "271") { "Green" } else { "Red" })

# 4. Public Schema Owner Verification
$postSchemaOwner = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public';" 2>&1).Trim()
Write-Host "  Schema public owner:             $postSchemaOwner (Expected: pg_database_owner)" -ForegroundColor $(if ($postSchemaOwner -eq "pg_database_owner") { "Green" } else { "Red" })

# 5. Row Counts Verification
$postUsers = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.users;" 2>&1).Trim()
$postBookings = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.bookings;" 2>&1).Trim()
$postTrips = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.trips;" 2>&1).Trim()
$postVlh = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c "SELECT count(*) FROM public.vehicle_location_history;" 2>&1).Trim()
$rowsMatch = ($postUsers -eq "68" -and $postBookings -eq "181" -and $postTrips -eq "61" -and $postVlh -eq "1600")
Write-Host "  Data integrity row counts:       $(if ($rowsMatch) { 'ALL 4 MATCH BASELINE' } else { 'MISMATCH' })" -ForegroundColor $(if ($rowsMatch) { "Green" } else { "Red" })

# 6. Overall Verification Evaluation
if ($postRelCount -ne "113" -or $postViewCount -ne "8" -or $postFuncCount -ne "7" -or (-not $partitionPass) -or $extFuncOwnerCount -ne "271" -or $postSchemaOwner -ne "pg_database_owner" -or (-not $rowsMatch)) {
    Write-Host ""
    Write-Host "[CRITICAL POST-VERIFICATION FAILURE] One or more verification criteria failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "PHASE 3D OWNERSHIP TRANSFER COMPLETED AND FULLY VERIFIED" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
exit 0
