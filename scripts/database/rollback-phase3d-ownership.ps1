# ==============================================================================
# MOVANA PLATFORM -- PHASE 3D OBJECT OWNERSHIP ROLLBACK SCRIPT
# Script: scripts/database/rollback-phase3d-ownership.ps1
# Description: Atomically reverts ownership of exactly 128 Movana application
#              objects (113 tables, 8 views, 7 functions) from 'movana_owner'
#              back to 'postgres' strictly against the 'movana' database.
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
Write-Host "MOVANA PLATFORM -- PHASE 3D OBJECT OWNERSHIP ROLLBACK" -ForegroundColor Cyan
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
        exit 1
    }
} catch {
    Write-Host "[CRITICAL ERROR] Exception during database connection: $_" -ForegroundColor Red
    exit 1
}

$trimmedDb = "$currentDb".Trim()
if ($trimmedDb -ne $TargetDatabase) {
    Write-Host "[CRITICAL SAFETY ABORT] Expected database '$TargetDatabase', but connected to '$trimmedDb'!" -ForegroundColor Red
    exit 1
}
Write-Host "[CONFIRMED] Active PostgreSQL connection verified strictly to database '$trimmedDb'." -ForegroundColor Green

# SAFETY CHECK 2: Role Verification
Write-Host ""
Write-Host "[Safety Check 2] Verifying roles..." -ForegroundColor Yellow
$rolesQuery = "SELECT rolname FROM pg_roles WHERE rolname IN ('postgres', 'movana_owner');"
$foundRoles = @(psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $rolesQuery 2>&1 | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne "" })
if ($foundRoles -notcontains "postgres" -or $foundRoles -notcontains "movana_owner") {
    Write-Host "[CRITICAL ERROR] Required role 'postgres' or 'movana_owner' missing." -ForegroundColor Red
    exit 1
}
Write-Host "  Roles verified: postgres, movana_owner present." -ForegroundColor Green

# SAFETY CHECK 3: Check objects currently owned by movana_owner
Write-Host ""
Write-Host "[Safety Check 3] Checking objects currently owned by movana_owner..." -ForegroundColor Yellow
$ownedTablesQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_get_userbyid(c.relowner) = 'movana_owner';"
$ownedViewsQuery = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind = 'v' AND pg_get_userbyid(c.relowner) = 'movana_owner';"
$ownedFuncsQuery = "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('fn_calculate_trip_available_seats','fn_generate_booking_reference','fn_generate_invoice_number','fn_log_booking_status_transition','fn_log_trip_status_transition','fn_record_audit_log','fn_set_updated_at') AND pg_get_userbyid(p.proowner) = 'movana_owner';"

$ownedTables = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $ownedTablesQuery 2>&1).Trim()
$ownedViews = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $ownedViewsQuery 2>&1).Trim()
$ownedFuncs = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $ownedFuncsQuery 2>&1).Trim()

Write-Host "  Tables owned by movana_owner:    $ownedTables (Expected: 113 for rollback)" -ForegroundColor White
Write-Host "  Views owned by movana_owner:     $ownedViews (Expected: 8 for rollback)" -ForegroundColor White
Write-Host "  Functions owned by movana_owner: $ownedFuncs (Expected: 7 for rollback)" -ForegroundColor White

if ($CheckOnly) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "[CHECK-ONLY MODE] Preflight verification complete." -ForegroundColor Green
    Write-Host "Zero rollback changes were made." -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    exit 0
}

# ==============================================================================
# ROLLBACK EXECUTION PHASE: Single Atomic Transaction (128 Statements)
# ==============================================================================
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "EXECUTING PHASE 3D OBJECT OWNERSHIP ROLLBACK (TO postgres)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$rollbackSqlLines = @(
    "\set ON_ERROR_STOP on",
    "BEGIN;",
    "",
    "-- STEP 1: Partitioned Table Parent (MANDATORY ORDER: PARENT FIRST)",
    "ALTER TABLE public.vehicle_location_history OWNER TO postgres;",
    "",
    "-- STEP 2: Partition Child Tables (8 child partitions)",
    "ALTER TABLE public.vehicle_location_history_default OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2026m09 OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2026m10 OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2026m11 OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2026m12 OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2027m01 OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2027m02 OWNER TO postgres;",
    "ALTER TABLE public.vehicle_location_history_y2027m03 OWNER TO postgres;",
    "",
    "-- STEP 3: Migration Ledger Table",
    "ALTER TABLE public.schema_migrations OWNER TO postgres;",
    "",
    "-- STEP 4: 103 Standard Base Tables (alphabetical)",
    "ALTER TABLE public.audit_logs OWNER TO postgres;",
    "ALTER TABLE public.booking_cancellations OWNER TO postgres;",
    "ALTER TABLE public.booking_items OWNER TO postgres;",
    "ALTER TABLE public.booking_passengers OWNER TO postgres;",
    "ALTER TABLE public.booking_reschedules OWNER TO postgres;",
    "ALTER TABLE public.booking_seats OWNER TO postgres;",
    "ALTER TABLE public.booking_status_history OWNER TO postgres;",
    "ALTER TABLE public.bookings OWNER TO postgres;",
    "ALTER TABLE public.coupon_redemptions OWNER TO postgres;",
    "ALTER TABLE public.coupons OWNER TO postgres;",
    "ALTER TABLE public.discounts OWNER TO postgres;",
    "ALTER TABLE public.driver_assignments OWNER TO postgres;",
    "ALTER TABLE public.driver_availability OWNER TO postgres;",
    "ALTER TABLE public.driver_document_types OWNER TO postgres;",
    "ALTER TABLE public.driver_documents OWNER TO postgres;",
    "ALTER TABLE public.driver_emergency_contacts OWNER TO postgres;",
    "ALTER TABLE public.driver_safety_events OWNER TO postgres;",
    "ALTER TABLE public.driver_status_history OWNER TO postgres;",
    "ALTER TABLE public.driver_verifications OWNER TO postgres;",
    "ALTER TABLE public.drivers OWNER TO postgres;",
    "ALTER TABLE public.email_verification_tokens OWNER TO postgres;",
    "ALTER TABLE public.emergency_contacts OWNER TO postgres;",
    "ALTER TABLE public.emergency_events OWNER TO postgres;",
    "ALTER TABLE public.fare_prices OWNER TO postgres;",
    "ALTER TABLE public.fare_products OWNER TO postgres;",
    "ALTER TABLE public.fare_rules OWNER TO postgres;",
    "ALTER TABLE public.feature_flags OWNER TO postgres;",
    "ALTER TABLE public.file_attachments OWNER TO postgres;",
    "ALTER TABLE public.geofence_events OWNER TO postgres;",
    "ALTER TABLE public.geofences OWNER TO postgres;",
    "ALTER TABLE public.incident_actions OWNER TO postgres;",
    "ALTER TABLE public.incident_reports OWNER TO postgres;",
    "ALTER TABLE public.incident_severity_levels OWNER TO postgres;",
    "ALTER TABLE public.incident_types OWNER TO postgres;",
    "ALTER TABLE public.incidents OWNER TO postgres;",
    "ALTER TABLE public.invoice_items OWNER TO postgres;",
    "ALTER TABLE public.invoices OWNER TO postgres;",
    "ALTER TABLE public.login_attempts OWNER TO postgres;",
    "ALTER TABLE public.lost_found_items OWNER TO postgres;",
    "ALTER TABLE public.lost_found_reports OWNER TO postgres;",
    "ALTER TABLE public.lost_found_status_history OWNER TO postgres;",
    "ALTER TABLE public.maintenance_items OWNER TO postgres;",
    "ALTER TABLE public.maintenance_parts OWNER TO postgres;",
    "ALTER TABLE public.maintenance_records OWNER TO postgres;",
    "ALTER TABLE public.maintenance_schedules OWNER TO postgres;",
    "ALTER TABLE public.notification_deliveries OWNER TO postgres;",
    "ALTER TABLE public.notification_preferences OWNER TO postgres;",
    "ALTER TABLE public.notification_templates OWNER TO postgres;",
    "ALTER TABLE public.notifications OWNER TO postgres;",
    "ALTER TABLE public.passenger_profiles OWNER TO postgres;",
    "ALTER TABLE public.password_reset_tokens OWNER TO postgres;",
    "ALTER TABLE public.payment_attempts OWNER TO postgres;",
    "ALTER TABLE public.payment_events OWNER TO postgres;",
    "ALTER TABLE public.payment_methods OWNER TO postgres;",
    "ALTER TABLE public.payment_transactions OWNER TO postgres;",
    "ALTER TABLE public.payments OWNER TO postgres;",
    "ALTER TABLE public.permissions OWNER TO postgres;",
    "ALTER TABLE public.refund_transactions OWNER TO postgres;",
    "ALTER TABLE public.refunds OWNER TO postgres;",
    "ALTER TABLE public.review_categories OWNER TO postgres;",
    "ALTER TABLE public.review_responses OWNER TO postgres;",
    "ALTER TABLE public.reviews OWNER TO postgres;",
    "ALTER TABLE public.role_permissions OWNER TO postgres;",
    "ALTER TABLE public.roles OWNER TO postgres;",
    "ALTER TABLE public.route_stops OWNER TO postgres;",
    "ALTER TABLE public.route_versions OWNER TO postgres;",
    "ALTER TABLE public.routes OWNER TO postgres;",
    "ALTER TABLE public.schedule_stops OWNER TO postgres;",
    "ALTER TABLE public.seat_layouts OWNER TO postgres;",
    "ALTER TABLE public.seats OWNER TO postgres;",
    "ALTER TABLE public.security_events OWNER TO postgres;",
    "ALTER TABLE public.service_calendar_exceptions OWNER TO postgres;",
    "ALTER TABLE public.service_calendars OWNER TO postgres;",
    "ALTER TABLE public.stops OWNER TO postgres;",
    "ALTER TABLE public.support_ticket_attachments OWNER TO postgres;",
    "ALTER TABLE public.support_ticket_messages OWNER TO postgres;",
    "ALTER TABLE public.support_ticket_status_history OWNER TO postgres;",
    "ALTER TABLE public.support_tickets OWNER TO postgres;",
    "ALTER TABLE public.system_settings OWNER TO postgres;",
    "ALTER TABLE public.tracking_devices OWNER TO postgres;",
    "ALTER TABLE public.tracking_events OWNER TO postgres;",
    "ALTER TABLE public.trip_assignments OWNER TO postgres;",
    "ALTER TABLE public.trip_events OWNER TO postgres;",
    "ALTER TABLE public.trip_fares OWNER TO postgres;",
    "ALTER TABLE public.trip_schedules OWNER TO postgres;",
    "ALTER TABLE public.trip_status_history OWNER TO postgres;",
    "ALTER TABLE public.trip_stops OWNER TO postgres;",
    "ALTER TABLE public.trips OWNER TO postgres;",
    "ALTER TABLE public.user_addresses OWNER TO postgres;",
    "ALTER TABLE public.user_preferences OWNER TO postgres;",
    "ALTER TABLE public.user_roles OWNER TO postgres;",
    "ALTER TABLE public.user_sessions OWNER TO postgres;",
    "ALTER TABLE public.users OWNER TO postgres;",
    "ALTER TABLE public.vehicle_assignments OWNER TO postgres;",
    "ALTER TABLE public.vehicle_documents OWNER TO postgres;",
    "ALTER TABLE public.vehicle_inspection_issues OWNER TO postgres;",
    "ALTER TABLE public.vehicle_inspection_items OWNER TO postgres;",
    "ALTER TABLE public.vehicle_inspections OWNER TO postgres;",
    "ALTER TABLE public.vehicle_manufacturers OWNER TO postgres;",
    "ALTER TABLE public.vehicle_models OWNER TO postgres;",
    "ALTER TABLE public.vehicle_status_history OWNER TO postgres;",
    "ALTER TABLE public.vehicle_types OWNER TO postgres;",
    "ALTER TABLE public.vehicles OWNER TO postgres;",
    "",
    "-- STEP 5: 8 Operational Views",
    "ALTER VIEW public.vw_active_vehicle_locations OWNER TO postgres;",
    "ALTER VIEW public.vw_available_trip_seats OWNER TO postgres;",
    "ALTER VIEW public.vw_booking_summary OWNER TO postgres;",
    "ALTER VIEW public.vw_driver_trip_summary OWNER TO postgres;",
    "ALTER VIEW public.vw_payment_summary OWNER TO postgres;",
    "ALTER VIEW public.vw_route_schedule_summary OWNER TO postgres;",
    "ALTER VIEW public.vw_trip_current_status OWNER TO postgres;",
    "ALTER VIEW public.vw_vehicle_health_summary OWNER TO postgres;",
    "",
    "-- STEP 6: 7 Custom Application Functions",
    "ALTER FUNCTION public.fn_calculate_trip_available_seats(uuid) OWNER TO postgres;",
    "ALTER FUNCTION public.fn_generate_booking_reference() OWNER TO postgres;",
    "ALTER FUNCTION public.fn_generate_invoice_number() OWNER TO postgres;",
    "ALTER FUNCTION public.fn_log_booking_status_transition() OWNER TO postgres;",
    "ALTER FUNCTION public.fn_log_trip_status_transition() OWNER TO postgres;",
    "ALTER FUNCTION public.fn_record_audit_log() OWNER TO postgres;",
    "ALTER FUNCTION public.fn_set_updated_at() OWNER TO postgres;",
    "",
    "COMMIT;"
)

$rollbackSql = $rollbackSqlLines -join "`r`n"
$tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
try {
    [System.IO.File]::WriteAllText($tempSqlFile, $rollbackSql, [System.Text.Encoding]::ASCII)
    
    Write-Host "[Executing Rollback SQL Transaction] Running rollback script with ON_ERROR_STOP=1..." -ForegroundColor Yellow
    $execOutput = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -f $tempSqlFile 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL ROLLBACK FAILURE] SQL rollback aborted!" -ForegroundColor Red
        Write-Host $execOutput -ForegroundColor Red
        exit 1
    }
    $stopwatch.Stop()
    Write-Host "[SUCCESS] Phase 3D rollback transaction committed cleanly in $($stopwatch.ElapsedMilliseconds) ms." -ForegroundColor Green
} finally {
    if (Test-Path $tempSqlFile) {
        Remove-Item -Path $tempSqlFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "PHASE 3D OWNERSHIP ROLLBACK COMPLETED SUCCESSFULLY" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
exit 0
