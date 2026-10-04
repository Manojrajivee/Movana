# Movana Safe Database Restore Script
# Restores strictly to target database 'movana' after pre-flight safety check
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFilePath
)

$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DB_NAME = "movana" # Hardcoded safety constraint
$DB_USER = if ($env:DB_ADMIN_USER) { $env:DB_ADMIN_USER } else { "postgres" }

if (-not (Test-Path $BackupFilePath)) {
    Write-Host "ERROR: Backup file '$BackupFilePath' does not exist." -ForegroundColor Red
    exit 1
}

Write-Host "WARNING: Restoring will overwrite existing data inside database '$DB_NAME'." -ForegroundColor Yellow
Write-Host "Verifying target database identity..." -ForegroundColor Cyan

$verify = psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -w -t -c "SELECT current_database();"
if ($verify.Trim() -ne "movana") {
    Write-Host "CRITICAL SAFETY ABORT: Database is NOT 'movana'. Aborting restore." -ForegroundColor Red
    exit 1
}

Write-Host "Executing pg_restore into '$DB_NAME'..." -ForegroundColor Cyan
pg_restore -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME --clean --if-exists -v $BackupFilePath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Restore completed successfully into '$DB_NAME'!" -ForegroundColor Green
} else {
    Write-Host "pg_restore finished with status code $LASTEXITCODE" -ForegroundColor Yellow
}
