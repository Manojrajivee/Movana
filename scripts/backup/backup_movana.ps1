# ==============================================================================
# MOVANA PLATFORM — BACKUP SCRIPT WRAPPER (BACKWARD COMPATIBILITY)
# Delegates execution to the hardened enterprise backup script:
# scripts/database/backup-movana.ps1
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HostName,
    [int]$Port,
    [string]$User,
    [string]$BackupDir,
    [string]$Label,
    [switch]$NoTOCVerify
)

$targetScript = Join-Path $PSScriptRoot "..\database\backup-movana.ps1"

if (-not (Test-Path $targetScript)) {
    Write-Host "[CRITICAL ERROR] Target backup script not found at: $targetScript" -ForegroundColor Red
    exit 1
}

& $targetScript @PSBoundParameters
exit $LASTEXITCODE
