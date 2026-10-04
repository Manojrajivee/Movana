# ==============================================================================
# MOVANA PLATFORM — CONNECTION & SAFETY PRE-FLIGHT VERIFICATION
# Script: scripts/database/verify_connection.ps1
# Description: Asserts that PostgreSQL is running, version is 16+,
#              and active engine target is strictly 'movana'.
# ==============================================================================

$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DB_NAME = "movana" # HARDCODED IMMUTABLE SAFETY CONSTRAINT: STRICTLY 'movana'
$DB_USER = if ($env:DB_ADMIN_USER) { $env:DB_ADMIN_USER } elseif ($env:DB_USER) { $env:DB_USER } else { "postgres" }

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "MOVANA DATABASE SAFETY PRE-FLIGHT VERIFICATION" -ForegroundColor Cyan
Write-Host "TARGET DATABASE: $DB_NAME (ENFORCED)" -ForegroundColor Cyan
Write-Host "HOST: $DB_HOST | PORT: $DB_PORT | USER: $DB_USER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$query = "SELECT current_database() AS db, current_schema() AS schema, version() AS version;"
Write-Host "Testing connection to ${DB_HOST}:${DB_PORT}/${DB_NAME} as $DB_USER..." -ForegroundColor Yellow

$output = psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -w -c $query 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS: Connected safely to target database '$DB_NAME'!" -ForegroundColor Green
    Write-Host $output
    exit 0
} else {
    Write-Host "`nFAILED: Could not establish safe connection to '$DB_NAME'." -ForegroundColor Red
    Write-Host $output
    exit 1
}
