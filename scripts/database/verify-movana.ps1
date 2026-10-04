# ==============================================================================
# MOVANA PLATFORM — POST-MIGRATION DATABASE VERIFICATION
# Script: scripts/database/verify-movana.ps1
# Description: Connects strictly to the 'movana' database and reports
#              detailed schema inventory, integrity metrics, and migration status.
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HostName = $(if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }),
    [int]$Port = $(if ($env:DB_PORT) { [int]$env:DB_PORT } else { 5432 }),
    [string]$User = $(if ($env:DB_ADMIN_USER) { $env:DB_ADMIN_USER } elseif ($env:DB_USER) { $env:DB_USER } else { "postgres" })
)

$ErrorActionPreference = "Stop"

# HARDCODED IMMUTABLE SAFETY CONSTRAINT: TARGET DATABASE CAN ONLY BE 'movana'
Set-Variable -Name TargetDatabase -Value "movana" -Option ReadOnly

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MOVANA DATABASE POST-MIGRATION VERIFICATION" -ForegroundColor Cyan
Write-Host "TARGET DATABASE: $TargetDatabase (ENFORCED)" -ForegroundColor Cyan
Write-Host "HOST: $HostName | PORT: $Port | USER: $User" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Helper function to execute query safely
function Invoke-MovanaQuery {
    param([string]$Query, [switch]$TuplesOnly)
    $args = @("-h", $HostName, "-p", $Port, "-U", $User, "-d", $TargetDatabase, "-w")
    if ($TuplesOnly) { $args += @("-t", "-A") }
    $args += @("-c", $Query)
    $res = psql @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Query failed: $res"
    }
    return $res
}

# SAFETY CHECK 1: Live Engine Pre-Flight Verification Query
Write-Host "`n[1/4] Verifying database connection and identity..." -ForegroundColor Yellow
try {
    $currentDb = (Invoke-MovanaQuery -Query "SELECT current_database();" -TuplesOnly).Trim()
    $pgVersion = (Invoke-MovanaQuery -Query "SELECT version();" -TuplesOnly).Trim()
} catch {
    Write-Host "[CRITICAL ERROR] Failed to connect to PostgreSQL server: $_" -ForegroundColor Red
    exit 1
}

if ($currentDb -ne $TargetDatabase) {
    Write-Host "[CRITICAL SAFETY ABORT] Connected to '$currentDb', but target MUST be '$TargetDatabase'!" -ForegroundColor Red
    exit 1
}

Write-Host "[SUCCESS] Connected to '$currentDb' on $HostName`:$Port" -ForegroundColor Green
Write-Host "PostgreSQL Version: $pgVersion`n" -ForegroundColor Gray

# [2/4] Schema Object Metrics
Write-Host "[2/4] Inspecting schema objects in 'public'..." -ForegroundColor Yellow

$metricsQuery = @"
SELECT 
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS table_count,
    (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public') AS view_count,
    (SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public') AS routine_count,
    (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public') AS trigger_count,
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') AS index_count,
    (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY') AS fk_count,
    (SELECT count(*) FROM pg_partitioned_table) AS partitioned_table_count,
    (SELECT count(*) FROM pg_inherits) AS partition_child_count;
"@

$metricsRaw = Invoke-MovanaQuery -Query $metricsQuery -TuplesOnly
$metrics = $metricsRaw -split '\|'

$tblCount = $metrics[0].Trim()
$viewCount = $metrics[1].Trim()
$funcCount = $metrics[2].Trim()
$trigCount = $metrics[3].Trim()
$idxCount = $metrics[4].Trim()
$fkCount = $metrics[5].Trim()
$partTableCount = $metrics[6].Trim()
$partChildCount = $metrics[7].Trim()

Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Base Tables:             $tblCount" -ForegroundColor Cyan
Write-Host "Views:                   $viewCount" -ForegroundColor Cyan
Write-Host "Functions / Procedures:  $funcCount" -ForegroundColor Cyan
Write-Host "Triggers:                $trigCount" -ForegroundColor Cyan
Write-Host "Indexes:                 $idxCount" -ForegroundColor Cyan
Write-Host "Foreign Keys:            $fkCount" -ForegroundColor Cyan
Write-Host "Partitioned Tables:      $partTableCount" -ForegroundColor Cyan
Write-Host "Child Partitions:        $partChildCount" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

# [3/4] Schema Migration History
Write-Host "`n[3/4] Checking migration ledger (schema_migrations)..." -ForegroundColor Yellow
$migTableCheck = Invoke-MovanaQuery -Query "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations');" -TuplesOnly
if ($migTableCheck.Trim() -eq "t") {
    $migCount = (Invoke-MovanaQuery -Query "SELECT count(*) FROM schema_migrations WHERE success = TRUE;" -TuplesOnly).Trim()
    Write-Host "[SUCCESS] Found schema_migrations table with $migCount successful migrations." -ForegroundColor Green
    
    $latestMigs = Invoke-MovanaQuery -Query "SELECT version, description, execution_time_ms, substring(checksum from 1 for 8) AS chksum8, installed_on FROM schema_migrations ORDER BY version ASC;"
    Write-Host $latestMigs -ForegroundColor Gray
} else {
    Write-Host "[WARNING] Table 'schema_migrations' not found. Migrations have not been run yet." -ForegroundColor Yellow
}

# [4/4] List all base tables
Write-Host "`n[4/4] Listing all tables in 'public' schema..." -ForegroundColor Yellow
$tablesList = Invoke-MovanaQuery -Query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
Write-Host $tablesList -ForegroundColor White

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "VERIFICATION REPORT COMPLETE FOR DATABASE '$TargetDatabase'" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
exit 0
