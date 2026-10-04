# ==============================================================================
# MOVANA PLATFORM — SAFE MIGRATION RUNNER
# Script: scripts/database/migrate-movana.ps1
# Description: Executes sequential versioned migrations (V001 to V{N})
#              strictly and exclusively against the 'movana' database.
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HostName = $(if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }),
    [int]$Port = $(if ($env:DB_PORT) { [int]$env:DB_PORT } else { 5432 }),
    [string]$User = $(if ($env:DB_ADMIN_USER) { $env:DB_ADMIN_USER } elseif ($env:DB_USER) { $env:DB_USER } else { "postgres" }),
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

# HARDCODED IMMUTABLE SAFETY CONSTRAINT: TARGET DATABASE CAN ONLY BE 'movana'
Set-Variable -Name TargetDatabase -Value "movana" -Option ReadOnly

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MOVANA PLATFORM SAFE MIGRATION RUNNER" -ForegroundColor Cyan
Write-Host "TARGET DATABASE: $TargetDatabase (ENFORCED)" -ForegroundColor Cyan
Write-Host "HOST:            $HostName" -ForegroundColor Cyan
Write-Host "PORT:            $Port" -ForegroundColor Cyan
Write-Host "USER:            $User" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# SAFETY CHECK 1: Live Engine Pre-Flight Database Identity Verification
Write-Host "`n[Safety Check 1] Verifying active PostgreSQL connection and database identity..." -ForegroundColor Yellow

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

$trimmedDb = $currentDb.Trim()
if ($trimmedDb -ne $TargetDatabase) {
    Write-Host "[CRITICAL SAFETY ABORT] Expected database '$TargetDatabase', but connected to '$trimmedDb'!" -ForegroundColor Red
    Write-Host "MIGRATION HALTED. Never execute migrations against unintended databases." -ForegroundColor Red
    exit 1
}

Write-Host "[CONFIRMED] Active PostgreSQL connection verified strictly to database '$trimmedDb'." -ForegroundColor Green

# SAFETY CHECK 2: Locate Migrations Directory & Discover Migration Files
$migrationDir = Join-Path $PSScriptRoot "..\..\database\migrations"
if (-not (Test-Path $migrationDir)) {
    Write-Host "[CRITICAL ERROR] Migration directory not found: $migrationDir" -ForegroundColor Red
    exit 1
}

# Collect and sort migration files matching ^V\d{3}__.*\.sql$ strictly
$allFiles = @(Get-ChildItem -Path $migrationDir -Filter "*.sql" | Where-Object { $_.Name -match '^V\d{3}__.*\.sql$' } | Sort-Object Name)
$discoveredCount = $allFiles.Count

if ($discoveredCount -eq 0) {
    Write-Host "[CRITICAL ERROR] No migration files matching pattern 'V{000}__*.sql' found in: $migrationDir" -ForegroundColor Red
    exit 1
}

# SAFETY CHECK 3: Strictly Sequential Migration Version Validation (V001 to V{N})
Write-Host "`n[Safety Check 2] Validating migration file version sequencing..." -ForegroundColor Yellow

$seenVersions = @{}
for ($i = 1; $i -le $discoveredCount; $i++) {
    $expectedVersion = "V{0:D3}" -f $i
    $file = $allFiles[$i - 1]
    $version = ($file.Name -split '__')[0]

    if ($seenVersions.ContainsKey($version)) {
        Write-Host "[CRITICAL ERROR] Duplicate migration version detected: '$version' in file $($file.Name)." -ForegroundColor Red
        exit 1
    }
    $seenVersions[$version] = $true

    if ($version -ne $expectedVersion) {
        Write-Host "[CRITICAL ERROR] Non-sequential or missing migration version detected!" -ForegroundColor Red
        Write-Host "Expected version '$expectedVersion' at position $i, but found '$version' ($($file.Name))." -ForegroundColor Red
        exit 1
    }
}

$highestDiscoveredVersion = "V{0:D3}" -f $discoveredCount
Write-Host "[CONFIRMED] All $discoveredCount migration files are strictly sequential from V001 to $highestDiscoveredVersion with 0 gaps or duplicates." -ForegroundColor Green

# SAFETY CHECK 4: Check Existing Applied Migrations (schema_migrations)
$appliedMigrations = @{}
$checkTableQuery = "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations');"
$hasMigrationTable = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $checkTableQuery 2>&1).Trim()

if ($hasMigrationTable -eq "t") {
    Write-Host "`n[Safety Check 3] 'schema_migrations' tracking table detected. Reading applied history..." -ForegroundColor Yellow
    $historyQuery = "SELECT version, coalesce(checksum, '') FROM schema_migrations WHERE success = TRUE ORDER BY version;"
    $historyRows = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -F "|" -c $historyQuery 2>&1
    foreach ($row in $historyRows) {
        if (-not [string]::IsNullOrWhiteSpace($row)) {
            $parts = $row.Split('|')
            if ($parts.Length -ge 1) {
                $v = $parts[0].Trim()
                $cs = if ($parts.Length -ge 2) { $parts[1].Trim() } else { "" }
                $appliedMigrations[$v] = $cs
            }
        }
    }
    Write-Host "[State] Currently recorded applied migrations: $($appliedMigrations.Count)" -ForegroundColor Green
} else {
    Write-Host "`n[State] Clean database detected. 'schema_migrations' ledger will be initialized by V001." -ForegroundColor Yellow
}

# Identify Pending Migrations
$pendingFiles = @()
foreach ($file in $allFiles) {
    $version = ($file.Name -split '__')[0]
    if (-not $appliedMigrations.ContainsKey($version)) {
        $pendingFiles += $file
    }
}

# Display Status Summary
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "MIGRATION INVENTORY & STATUS SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Applied migrations   : $($appliedMigrations.Count)" -ForegroundColor White
Write-Host "Discovered migrations: $($discoveredCount)" -ForegroundColor White
Write-Host "Pending migrations   : $($pendingFiles.Count)" -ForegroundColor $(if ($pendingFiles.Count -gt 0) { "Yellow" } else { "Green" })
if ($pendingFiles.Count -gt 0) {
    foreach ($pendingFile in $pendingFiles) {
        Write-Host "Pending migration    : $($pendingFile.Name)" -ForegroundColor Yellow
    }
}
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if database is already up to date
if ($pendingFiles.Count -eq 0) {
    Write-Host "`n[State] No pending migrations. Database is up to date." -ForegroundColor Green
    Write-Host "Database '$TargetDatabase' is fully synchronized at version $highestDiscoveredVersion." -ForegroundColor Green
    exit 0
}

# If CheckOnly switch specified, exit before executing any migration DDL
if ($CheckOnly) {
    Write-Host "`n[CheckOnly] Verification complete. Database is unmodified. $($pendingFiles.Count) migration(s) pending." -ForegroundColor Cyan
    exit 0
}

$startTime = Get-Date
$appliedCount = 0
$skippedCount = 0

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "BEGINNING MIGRATION EXECUTION SEQUENCE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

foreach ($file in $allFiles) {
    $version = ($file.Name -split '__')[0]
    $fileHash = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLower()

    # Rerun safety: check if migration was already applied
    if ($appliedMigrations.ContainsKey($version)) {
        $recordedChecksum = $appliedMigrations[$version]

        # REQUIREMENT: Empty/Null Checksum Abort
        if ([string]::IsNullOrWhiteSpace($recordedChecksum)) {
            Write-Host "`n[CRITICAL ERROR] Applied migration $version has an empty or null checksum in 'schema_migrations'!" -ForegroundColor Red
            Write-Host "Migration ledger is incomplete and requires manual review. Halting execution." -ForegroundColor Red
            exit 1
        }

        # REQUIREMENT: Checksum Mismatch Abort
        if ($recordedChecksum.ToLower() -ne $fileHash) {
            Write-Host "`n[CRITICAL ERROR] Checksum mismatch detected for migration $version ($($file.Name))!" -ForegroundColor Red
            Write-Host "  Recorded Checksum in Ledger: $recordedChecksum" -ForegroundColor Red
            Write-Host "  Current File SHA256:         $fileHash" -ForegroundColor Red
            Write-Host "Migration file has been altered after execution. Halting execution immediately." -ForegroundColor Red
            exit 1
        }

        Write-Host "[SKIPPED] $($file.Name) (Already applied; SHA-256 verified)" -ForegroundColor DarkGray
        $skippedCount++
        continue
    }

    Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "Executing Migration: $($file.Name) [Version: $version]" -ForegroundColor Yellow
    Write-Host "File SHA256: $fileHash" -ForegroundColor DarkGray
    Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    
    # Execute transactionally with -v ON_ERROR_STOP=1
    $output = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -f $file.FullName 2>&1
    $exitCode = $LASTEXITCODE
    $sw.Stop()
    $execMs = [int]$sw.ElapsedMilliseconds

    if ($exitCode -ne 0) {
        Write-Host "`n[FATAL MIGRATION FAILURE] Error executing $($file.Name) (Exit Code: $exitCode)" -ForegroundColor Red
        Write-Host "PostgreSQL Error Output:" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        Write-Host "`nExecution halted immediately. No further migrations will be applied." -ForegroundColor Red
        exit 1
    }

    # Extract description from filename (e.g., 'V025__database_optimizations.sql' -> 'database_optimizations')
    $desc = if ($file.Name -match '^V\d{3}__(.*)\.sql$') { $Matches[1].Replace("'", "''") } else { $version }

    # REQUIREMENT: Record/update ledger, verify exit code, and assert exactly ONE row was affected
    # Uses ON CONFLICT to cleanly handle both pre-existing placeholder rows (V001-V024) and new migrations (V025+)
    $updateLedgerQuery = @"
WITH ledger_record AS (
    INSERT INTO schema_migrations (
        version, description, type, script, checksum, installed_by, installed_on, execution_time_ms, success
    )
    VALUES (
        '$version', '$desc', 'SQL', '$($file.Name)', '$fileHash', CURRENT_USER, CURRENT_TIMESTAMP, $execMs, TRUE
    )
    ON CONFLICT (version) DO UPDATE 
    SET description = EXCLUDED.description,
        type = EXCLUDED.type,
        script = EXCLUDED.script,
        checksum = EXCLUDED.checksum, 
        execution_time_ms = EXCLUDED.execution_time_ms, 
        success = TRUE
    RETURNING 1
)
SELECT count(*) FROM ledger_record;
"@
    try {
        $rowsUpdated = (psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $updateLedgerQuery 2>&1)
        $updateExitCode = $LASTEXITCODE
    } catch {
        Write-Host "`n[FATAL ERROR / CONSISTENCY-RISK CONDITION] Exception occurred while updating migration ledger for $($version): $_" -ForegroundColor Red
        Write-Host "CRITICAL CONSISTENCY RISK: The migration DDL for $($file.Name) may have succeeded, but 'schema_migrations' could not be updated!" -ForegroundColor Red
        Write-Host "Execution halted immediately. Do not report migration as successful." -ForegroundColor Red
        exit 1
    }

    if ($updateExitCode -ne 0) {
        Write-Host "`n[FATAL ERROR / CONSISTENCY-RISK CONDITION] Failed to update migration ledger for $($version) (Exit Code: $updateExitCode)!" -ForegroundColor Red
        Write-Host "CRITICAL CONSISTENCY RISK: The migration DDL for $($file.Name) succeeded, but 'schema_migrations' record update failed!" -ForegroundColor Red
        Write-Host "PostgreSQL Error Output:" -ForegroundColor Red
        Write-Host $rowsUpdated -ForegroundColor Red
        Write-Host "Execution halted immediately. Do not report migration as successful." -ForegroundColor Red
        exit 1
    }

    $trimmedRows = if ($null -ne $rowsUpdated) { $rowsUpdated.ToString().Trim() } else { "" }
    if ($trimmedRows -ne "1") {
        Write-Host "`n[FATAL ERROR / CONSISTENCY-RISK CONDITION] Schema migration ledger update anomaly for $($version)!" -ForegroundColor Red
        Write-Host "CRITICAL CONSISTENCY RISK: Expected exactly 1 row updated in 'schema_migrations', but affected row count was: '$trimmedRows'." -ForegroundColor Red
        Write-Host "Database ledger may be desynchronized with schema state. Manual ledger verification required." -ForegroundColor Red
        Write-Host "Execution halted immediately. Do not report migration as successful." -ForegroundColor Red
        exit 1
    }

    Write-Host "[SUCCESS] $($file.Name) applied and recorded cleanly in ${execMs}ms." -ForegroundColor Green
    $appliedCount++
}

$totalDuration = (Get-Date) - $startTime

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "MIGRATION RUN COMPLETE ON DATABASE '$TargetDatabase'!" -ForegroundColor Green
Write-Host "New Migrations Applied: $appliedCount" -ForegroundColor Green
Write-Host "Migrations Skipped:     $skippedCount" -ForegroundColor Green
Write-Host "Total Execution Time:   $([math]::Round($totalDuration.TotalSeconds, 2)) seconds" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

exit 0
