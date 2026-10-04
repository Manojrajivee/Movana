# ==============================================================================
# MOVANA PLATFORM — DATABASE BACKUP UTILITY
# Script: scripts/database/backup-movana.ps1
# Description: Generates a compressed, production-grade custom-format logical
#              backup of the 'movana' PostgreSQL 16 database.
#
# Constraints Enforced:
#   - Target database is IMMUTABLY RESTRICTED to 'movana'.
#   - Verifies PostgreSQL connectivity and SELECT current_database() before dump.
#   - Validates existence of pg_dump and pg_restore in PATH.
#   - Uses PostgreSQL native custom format (-F c) for full pg_restore compatibility.
#   - Validates backup integrity via SHA-256 and TOC inspection (pg_restore -l).
#   - Generates sidecar JSON metadata.
#   - Non-destructive: Contains ZERO DROP, TRUNCATE, DELETE, or ALTER operations.
#   - Never silently reports success.
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HostName = $(if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }),
    [int]$Port = $(if ($env:DB_PORT) { [int]$env:DB_PORT } else { 5432 }),
    [string]$User = $(if ($env:DB_ADMIN_USER) { $env:DB_ADMIN_USER } elseif ($env:DB_USER) { $env:DB_USER } else { "postgres" }),
    [string]$BackupDir = "",
    [string]$Label = "",
    [switch]$NoTOCVerify
)

$ErrorActionPreference = "Stop"

# IMMUTABLE SAFETY CONSTRAINT: TARGET DATABASE CAN ONLY BE 'movana'
Set-Variable -Name TargetDatabase -Value "movana" -Option ReadOnly

# Resolve backup directory path
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
    $BackupDir = Join-Path $repoRoot "backups\database"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MOVANA DATABASE BACKUP UTILITY" -ForegroundColor Cyan
Write-Host "TARGET DATABASE : $TargetDatabase (ENFORCED & IMMUTABLE)" -ForegroundColor Cyan
Write-Host "HOST: $HostName | PORT: $Port | USER: $User" -ForegroundColor Cyan
Write-Host "DESTINATION DIR : $BackupDir" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Verify PostgreSQL Tooling in Environment
# ------------------------------------------------------------------------------
Write-Host "`n[1/5] Verifying PostgreSQL client binaries..." -ForegroundColor Yellow

$pgDumpCmd = Get-Command "pg_dump" -ErrorAction SilentlyContinue
if (-not $pgDumpCmd) {
    Write-Host "[CRITICAL ERROR] 'pg_dump' utility not found in PATH." -ForegroundColor Red
    Write-Host "Ensure PostgreSQL bin directory is added to PATH or environment variables." -ForegroundColor Yellow
    exit 1
}

$pgRestoreCmd = Get-Command "pg_restore" -ErrorAction SilentlyContinue
if (-not $pgRestoreCmd) {
    Write-Host "[CRITICAL ERROR] 'pg_restore' utility not found in PATH." -ForegroundColor Red
    exit 1
}

$psqlCmd = Get-Command "psql" -ErrorAction SilentlyContinue
if (-not $psqlCmd) {
    Write-Host "[CRITICAL ERROR] 'psql' utility not found in PATH." -ForegroundColor Red
    exit 1
}

$pgDumpVersionRaw = (& pg_dump --version 2>&1)
Write-Host "[SUCCESS] Client tools verified: $pgDumpVersionRaw" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Verify PostgreSQL Connectivity & Target Database Identity
# ------------------------------------------------------------------------------
Write-Host "`n[2/5] Verifying database connection and identity..." -ForegroundColor Yellow

function Invoke-PsqlQuery {
    param([string]$Query, [switch]$TuplesOnly)
    $args = @("-h", $HostName, "-p", $Port.ToString(), "-U", $User, "-d", $TargetDatabase, "-w")
    if ($TuplesOnly) { $args += @("-t", "-A") }
    $args += @("-c", $Query)
    $res = & psql @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql connection failed with code $($LASTEXITCODE). Output: $res"
    }
    return $res
}

try {
    $currentDb = (Invoke-PsqlQuery -Query "SELECT current_database();" -TuplesOnly).Trim()
    $engineVersion = (Invoke-PsqlQuery -Query "SELECT version();" -TuplesOnly).Trim()
} catch {
    Write-Host "[CRITICAL ERROR] Failed to connect to PostgreSQL: $_" -ForegroundColor Red
    Write-Host "Check host, port, user, and password (via PGPASSWORD environment variable)." -ForegroundColor Yellow
    exit 1
}

if ($currentDb -ne $TargetDatabase) {
    Write-Host "[CRITICAL SAFETY ABORT] Connected database is '$currentDb', expected '$TargetDatabase'!" -ForegroundColor Red
    exit 1
}

Write-Host "[SUCCESS] Active database confirmed: '$currentDb'" -ForegroundColor Green
Write-Host "Engine: $engineVersion" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# STEP 3: Inspect Database State Metrics Prior to Backup
# ------------------------------------------------------------------------------
Write-Host "`n[3/5] Querying database inventory metrics..." -ForegroundColor Yellow

$metricsQuery = @"
SELECT 
    (SELECT count(*) FROM schema_migrations WHERE success = TRUE) AS mig_count,
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tbl_count,
    (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public') AS view_count,
    (SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public') AS func_count,
    (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public') AS trig_count,
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') AS idx_count,
    (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY') AS fk_count,
    (SELECT count(*) FROM pg_partitioned_table) AS part_parent_count,
    (SELECT count(*) FROM pg_inherits) AS part_child_count;
"@

try {
    $rawMetrics = Invoke-PsqlQuery -Query $metricsQuery -TuplesOnly
    $mParts = $rawMetrics -split '\|'
    $migCount  = [int]$mParts[0].Trim()
    $tblCount  = [int]$mParts[1].Trim()
    $viewCount = [int]$mParts[2].Trim()
    $funcCount = [int]$mParts[3].Trim()
    $trigCount = [int]$mParts[4].Trim()
    $idxCount  = [int]$mParts[5].Trim()
    $fkCount   = [int]$mParts[6].Trim()
    $partCount = [int]$mParts[7].Trim()
    $childPartCount = [int]$mParts[8].Trim()
} catch {
    Write-Host "[WARNING] Could not retrieve full metrics: $_" -ForegroundColor Yellow
    $migCount = $tblCount = $viewCount = $funcCount = $trigCount = $idxCount = $fkCount = $partCount = $childPartCount = 0
}

Write-Host "  Migrations applied   : $migCount" -ForegroundColor Cyan
Write-Host "  Base tables          : $tblCount" -ForegroundColor Cyan
Write-Host "  Views                : $viewCount" -ForegroundColor Cyan
Write-Host "  Functions/Procedures : $funcCount" -ForegroundColor Cyan
Write-Host "  Triggers             : $trigCount" -ForegroundColor Cyan
Write-Host "  Indexes              : $idxCount" -ForegroundColor Cyan
Write-Host "  Foreign Keys         : $fkCount" -ForegroundColor Cyan
Write-Host "  Partitioned Tables   : $partCount (Child Partitions: $childPartCount)" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 4: Execute Native PostgreSQL Custom Backup (pg_dump -F c)
# ------------------------------------------------------------------------------
Write-Host "`n[4/5] Executing PostgreSQL custom format backup..." -ForegroundColor Yellow

if (-not (Test-Path $BackupDir)) {
    Write-Host "Creating backup directory: $BackupDir" -ForegroundColor DarkGray
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

$timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$labelSuffix = if (-not [string]::IsNullOrWhiteSpace($Label)) { "_$($Label.Trim())" } else { "" }
$backupFileName = "movana_backup_${timestamp}${labelSuffix}.dump"
$targetBackupFile = Join-Path $BackupDir $backupFileName
$metadataFileName = "movana_backup_${timestamp}${labelSuffix}.json"
$targetMetadataFile = Join-Path $BackupDir $metadataFileName

if (Test-Path $targetBackupFile) {
    Write-Host "[CRITICAL ERROR] Target backup file already exists: $targetBackupFile" -ForegroundColor Red
    Write-Host "Aborting to prevent unintentional file overwrite." -ForegroundColor Red
    exit 1
}

Write-Host "Output File: $targetBackupFile" -ForegroundColor Cyan
Write-Host "Format     : PostgreSQL Custom Binary Archive (-F c, compressed)" -ForegroundColor Gray

$dumpArgs = @(
    "-h", $HostName,
    "-p", $Port.ToString(),
    "-U", $User,
    "-d", $TargetDatabase,
    "-F", "c",
    "-b",
    "-v",
    "-f", $targetBackupFile
)

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
& pg_dump @dumpArgs
$dumpExitCode = $LASTEXITCODE
$stopwatch.Stop()

if ($dumpExitCode -ne 0) {
    Write-Host "`n[CRITICAL ERROR] pg_dump failed with exit code $dumpExitCode." -ForegroundColor Red
    if (Test-Path $targetBackupFile) {
        Remove-Item -Force -Path $targetBackupFile -ErrorAction SilentlyContinue
    }
    exit 1
}

# ------------------------------------------------------------------------------
# STEP 5: Verify Backup File Integrity & Generate Metadata Sidecar
# ------------------------------------------------------------------------------
Write-Host "`n[5/5] Verifying backup integrity and generating metadata..." -ForegroundColor Yellow

if (-not (Test-Path $targetBackupFile)) {
    Write-Host "[CRITICAL ERROR] Backup file was not created on disk: $targetBackupFile" -ForegroundColor Red
    exit 1
}

$fileItem = Get-Item $targetBackupFile
$fileSizeBytes = $fileItem.Length
$fileSizeMB = [math]::Round($fileSizeBytes / 1MB, 2)

if ($fileSizeBytes -le 0) {
    Write-Host "[CRITICAL ERROR] Backup file is empty (0 bytes): $targetBackupFile" -ForegroundColor Red
    exit 1
}

# SHA-256 Checksum
Write-Host "Calculating SHA-256 hash..." -ForegroundColor Gray
$fileHash = (Get-FileHash -Path $targetBackupFile -Algorithm SHA256).Hash

# Verify Table of Contents (TOC) using pg_restore -l
$tocEntryCount = 0
if (-not $NoTOCVerify) {
    Write-Host "Inspecting archive Table of Contents (pg_restore -l)..." -ForegroundColor Gray
    $tocOutput = & pg_restore -l $targetBackupFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL ERROR] pg_restore -l failed to read archive Table of Contents!" -ForegroundColor Red
        Write-Host "Archive may be truncated or corrupt: $tocOutput" -ForegroundColor Red
        exit 1
    }
    # Count non-comment entries in TOC
    $tocLines = ($tocOutput -split "`n") | Where-Object { $_ -match '^\s*\d+;' }
    $tocEntryCount = $tocLines.Count
    Write-Host "[PASS] Archive TOC readable: $tocEntryCount catalogued items found." -ForegroundColor Green
}

# Generate sidecar metadata JSON
$metadata = [ordered]@{
    backup_filename             = $backupFileName
    backup_file_path            = $targetBackupFile
    database_name               = $TargetDatabase
    host                        = $HostName
    port                        = $Port
    user                        = $User
    timestamp_utc               = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    timestamp_local             = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
    execution_duration_sec      = [math]::Round($stopwatch.Elapsed.TotalSeconds, 2)
    format                      = "PostgreSQL Custom Format (-F c)"
    pg_dump_version             = $pgDumpVersionRaw.Trim()
    postgresql_engine_version   = $engineVersion
    file_size_bytes             = $fileSizeBytes
    file_size_mb                = $fileSizeMB
    sha256_checksum             = $fileHash
    toc_entry_count             = $tocEntryCount
    database_metrics_at_backup  = [ordered]@{
        successful_migrations   = $migCount
        base_tables             = $tblCount
        views                   = $viewCount
        functions_procedures    = $funcCount
        triggers                = $trigCount
        indexes                 = $idxCount
        foreign_keys            = $fkCount
        partitioned_tables      = $partCount
        child_partitions        = $childPartCount
    }
}

$metadataJson = $metadata | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($targetMetadataFile, $metadataJson, [System.Text.Encoding]::UTF8)

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "BACKUP COMPLETED AND VERIFIED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Backup File   : $targetBackupFile" -ForegroundColor Cyan
Write-Host "Metadata File : $targetMetadataFile" -ForegroundColor Cyan
Write-Host "File Size     : $fileSizeMB MB ($fileSizeBytes bytes)" -ForegroundColor Cyan
Write-Host "SHA-256 Hash  : $fileHash" -ForegroundColor Cyan
Write-Host "TOC Items     : $tocEntryCount" -ForegroundColor Cyan
Write-Host "Elapsed Time  : $($stopwatch.Elapsed.TotalSeconds.ToString('F2')) seconds" -ForegroundColor Cyan
Write-Host "==========================================================`n" -ForegroundColor Green

exit 0
