# ==============================================================================
# MOVANA PLATFORM -- PHASE 3C PRIVILEGES & DEFAULT ACLs ROLLBACK SCRIPT
# Script: scripts/database/rollback-phase3c-privileges.ps1
# Description: Atomically reverts Phase 3C privilege changes, restoring the
#              pre-Phase-3C ACL catalog baseline on database 'movana'.
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

$modeStr = if ($CheckOnly) { "CHECK-ONLY (Dry Run)" } else { "LIVE TRANSACTIONAL ROLLBACK" }

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "MOVANA PLATFORM -- PHASE 3C PRIVILEGES ROLLBACK" -ForegroundColor Yellow
Write-Host "TARGET DATABASE: $TargetDatabase (ENFORCED)" -ForegroundColor Yellow
Write-Host "HOST:            $HostName" -ForegroundColor Yellow
Write-Host "PORT:            $Port" -ForegroundColor Yellow
Write-Host "USER:            $User" -ForegroundColor Yellow
Write-Host "MODE:            $modeStr" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

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
    Write-Host "ROLLBACK HALTED. Never rollback privileges on unintended databases." -ForegroundColor Red
    exit 1
}
Write-Host "[CONFIRMED] Active PostgreSQL connection verified strictly to database '$trimmedDb'." -ForegroundColor Green

if ($CheckOnly) {
    Write-Host ""
    Write-Host "[CheckOnly Mode] Rollback dry-run check complete. Target is '$trimmedDb'." -ForegroundColor Cyan
    Write-Host "No changes were reverted." -ForegroundColor Cyan
    exit 0
}

# EXECUTION PHASE: Single Atomic Transaction
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "EXECUTING PHASE 3C ROLLBACK SEQUENCE" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

$rollbackSqlLines = @(
    "\set ON_ERROR_STOP on",
    "BEGIN;",
    "",
    "-- 1. Restore Database Privileges",
    "GRANT CONNECT, TEMPORARY ON DATABASE movana TO PUBLIC;",
    "REVOKE ALL PRIVILEGES ON DATABASE movana FROM movana_owner, movana_app, movana_readonly, movana_migration;",
    "",
    "-- 2. Restore Schema public Privileges",
    "GRANT USAGE ON SCHEMA public TO PUBLIC;",
    "REVOKE ALL PRIVILEGES ON SCHEMA public FROM movana_owner, movana_app, movana_readonly, movana_migration;",
    "",
    "-- 3. Restore Table & View Privileges to Pre-Phase-3C State",
    "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM movana_owner, movana_app, movana_readonly, movana_migration;",
    "UPDATE pg_class SET relacl = NULL WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND relkind IN ('r', 'p', 'v');",
    "",
    "-- 4. Restore Function Execution Privileges",
    "GRANT EXECUTE ON FUNCTION public.fn_calculate_trip_available_seats(uuid), public.fn_generate_booking_reference(), public.fn_generate_invoice_number(), public.fn_log_booking_status_transition(), public.fn_log_trip_status_transition(), public.fn_record_audit_log(), public.fn_set_updated_at() TO PUBLIC;",
    "REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM movana_owner, movana_app, movana_readonly, movana_migration;",
    "UPDATE pg_proc SET proacl = NULL WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND proname IN ('fn_calculate_trip_available_seats','fn_generate_booking_reference','fn_generate_invoice_number','fn_log_booking_status_transition','fn_log_trip_status_transition','fn_record_audit_log','fn_set_updated_at');",
    "",
    "-- 5. Remove Default Privileges (Restore pg_default_acl to 0 rows)",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON TABLES FROM movana_app, movana_readonly, movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM movana_app, movana_readonly, movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON ROUTINES FROM movana_app, movana_readonly, movana_owner, movana_migration, PUBLIC;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_owner IN SCHEMA public REVOKE ALL ON TYPES FROM movana_app, movana_readonly, movana_owner, movana_migration;",
    "",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON TABLES FROM movana_app, movana_readonly, movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON SEQUENCES FROM movana_app, movana_readonly, movana_owner, movana_migration;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON ROUTINES FROM movana_app, movana_readonly, movana_owner, movana_migration, PUBLIC;",
    "ALTER DEFAULT PRIVILEGES FOR ROLE movana_migration IN SCHEMA public REVOKE ALL ON TYPES FROM movana_app, movana_readonly, movana_owner, movana_migration;",
    "",
    "COMMIT;"
)

$rollbackSql = $rollbackSqlLines -join "`r`n"
$tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"

try {
    [System.IO.File]::WriteAllText($tempSqlFile, $rollbackSql, [System.Text.Encoding]::ASCII)
    
    Write-Host "[Executing Rollback] Running rollback script with ON_ERROR_STOP=1..." -ForegroundColor Yellow
    $execOutput = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -f $tempSqlFile 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL ROLLBACK FAILURE] Rollback aborted!" -ForegroundColor Red
        Write-Host $execOutput -ForegroundColor Red
        exit 1
    }
    Write-Host "[SUCCESS] Phase 3C rollback committed cleanly." -ForegroundColor Green
} finally {
    if (Test-Path $tempSqlFile) {
        Remove-Item -Path $tempSqlFile -Force -ErrorAction SilentlyContinue
    }
}

# POST-ROLLBACK VERIFICATION
Write-Host ""
Write-Host "[Verifying Post-Rollback Catalog State]..." -ForegroundColor Yellow
$verifyQuery = "SELECT (SELECT has_database_privilege('public', 'movana', 'CONNECT')) || '|' || (SELECT count(*) FROM pg_default_acl) || '|' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relacl IS NOT NULL);"
$vRes = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $verifyQuery 2>&1)
$vRes = "$vRes".Trim().Split('|')
Write-Host "  PUBLIC CONNECT restored: $($vRes[0]) (Expected: t)" -ForegroundColor $(if ($vRes[0] -eq 't') { "Green" } else { "Red" })
Write-Host "  pg_default_acl count:     $($vRes[1]) (Expected: 0)" -ForegroundColor $(if ($vRes[1] -eq '0') { "Green" } else { "Red" })
Write-Host "  non-null relacl count:    $($vRes[2]) (Expected: 0)" -ForegroundColor $(if ($vRes[2] -eq '0') { "Green" } else { "Red" })

if ($vRes[0] -ne 't' -or $vRes[1] -ne '0' -or $vRes[2] -ne '0') {
    Write-Host "[CRITICAL ERROR] Post-rollback state does not match pre-Phase-3C baseline!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[CONFIRMED] Pre-Phase-3C baseline successfully restored." -ForegroundColor Green
exit 0
