# ==============================================================================
# MOVANA PLATFORM — SAFE ROLE PROVISIONING SCRIPT
# Script: scripts/database/provision-roles.ps1
# Description: Idempotently provisions the four dedicated Movana database roles:
#              movana_owner, movana_app, movana_readonly, movana_migration
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
Write-Host "MOVANA PLATFORM SAFE ROLE PROVISIONING" -ForegroundColor Cyan
Write-Host "TARGET DATABASE: $TargetDatabase (ENFORCED)" -ForegroundColor Cyan
Write-Host "HOST:            $HostName" -ForegroundColor Cyan
Write-Host "PORT:            $Port" -ForegroundColor Cyan
Write-Host "USER:            $User" -ForegroundColor Cyan
Write-Host "MODE:            $(if ($CheckOnly) { 'CHECK-ONLY (Dry Run)' } else { 'EXECUTION' })" -ForegroundColor Cyan
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
    Write-Host "ROLE PROVISIONING HALTED. Never provision roles against unintended databases." -ForegroundColor Red
    exit 1
}

Write-Host "[CONFIRMED] Active PostgreSQL connection verified strictly to database '$trimmedDb'." -ForegroundColor Green

# SAFETY CHECK 2: Inspect Existing Target Roles in pg_roles
Write-Host "`n[Safety Check 2] Inspecting current pg_roles catalog for target Movana roles..." -ForegroundColor Yellow

$targetRoles = @("movana_owner", "movana_app", "movana_readonly", "movana_migration")
$checkRolesQuery = "SELECT rolname FROM pg_roles WHERE rolname IN ('movana_owner', 'movana_app', 'movana_readonly', 'movana_migration');"
$existingRoles = @(psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $checkRolesQuery 2>&1) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

Write-Host "Role Inventory Status:" -ForegroundColor White
foreach ($role in $targetRoles) {
    $exists = $existingRoles -contains $role
    $statusText = if ($exists) { "PRESENT" } else { "ABSENT" }
    $statusColor = if ($exists) { "Yellow" } else { "Green" }
    Write-Host "  ${role}: $statusText" -ForegroundColor $statusColor
}

# If CheckOnly mode is requested, report status and exit cleanly without executing DCL
if ($CheckOnly) {
    Write-Host "`n[CheckOnly Mode] Verification complete. Target database is '$trimmedDb'." -ForegroundColor Cyan
    Write-Host "No roles were created or altered." -ForegroundColor Cyan
    exit 0
}

# EXECUTION: Idempotent Role Creation
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "EXECUTING ROLE PROVISIONING SEQUENCE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. movana_owner (NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS)
if ($existingRoles -contains "movana_owner") {
    Write-Host "[IDEMPOTENT] Role 'movana_owner' already exists. Verifying/enforcing attributes..." -ForegroundColor Yellow
    $ownerDdl = "ALTER ROLE movana_owner WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;"
} else {
    Write-Host "[CREATING] Role 'movana_owner' (NOLOGIN Schema Owner)..." -ForegroundColor Green
    $ownerDdl = "CREATE ROLE movana_owner WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;"
}
$output = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -c $ownerDdl 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CRITICAL ERROR] Failed to provision role 'movana_owner': $output" -ForegroundColor Red
    exit 1
}

# 2. movana_app (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, INHERIT, NOREPLICATION, NOBYPASSRLS)
if ($existingRoles -contains "movana_app") {
    Write-Host "[IDEMPOTENT] Role 'movana_app' already exists. Verifying/enforcing attributes..." -ForegroundColor Yellow
    $appDdl = "ALTER ROLE movana_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;"
} else {
    Write-Host "[CREATING] Role 'movana_app' (LOGIN Application Runtime)..." -ForegroundColor Green
    $appDdl = "CREATE ROLE movana_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;"
}
$output = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -c $appDdl 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CRITICAL ERROR] Failed to provision role 'movana_app': $output" -ForegroundColor Red
    exit 1
}

# 3. movana_readonly (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, INHERIT, NOREPLICATION, NOBYPASSRLS)
if ($existingRoles -contains "movana_readonly") {
    Write-Host "[IDEMPOTENT] Role 'movana_readonly' already exists. Verifying/enforcing attributes..." -ForegroundColor Yellow
    $roDdl = "ALTER ROLE movana_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;"
} else {
    Write-Host "[CREATING] Role 'movana_readonly' (LOGIN Analytics / Reporting)..." -ForegroundColor Green
    $roDdl = "CREATE ROLE movana_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;"
}
$output = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -c $roDdl 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CRITICAL ERROR] Failed to provision role 'movana_readonly': $output" -ForegroundColor Red
    exit 1
}

# 4. movana_migration (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, INHERIT, NOREPLICATION, NOBYPASSRLS)
if ($existingRoles -contains "movana_migration") {
    Write-Host "[IDEMPOTENT] Role 'movana_migration' already exists. Verifying/enforcing attributes..." -ForegroundColor Yellow
    $migDdl = "ALTER ROLE movana_migration WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;"
} else {
    Write-Host "[CREATING] Role 'movana_migration' (LOGIN Deployer / CI/CD)..." -ForegroundColor Green
    $migDdl = "CREATE ROLE movana_migration WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;"
}
$output = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -c $migDdl 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CRITICAL ERROR] Failed to provision role 'movana_migration': $output" -ForegroundColor Red
    exit 1
}

# 5. Role Membership: GRANT movana_owner TO movana_migration
Write-Host "`n[Configuring Role Membership] Checking movana_migration -> movana_owner..." -ForegroundColor Yellow
$checkMembershipQuery = @"
SELECT 1 FROM pg_auth_members m
JOIN pg_roles r_role ON r_role.oid = m.roleid
JOIN pg_roles r_member ON r_member.oid = m.member
WHERE r_role.rolname = 'movana_owner' AND r_member.rolname = 'movana_migration';
"@
$memCheckRaw = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $checkMembershipQuery 2>&1
$hasMembership = if ($null -ne $memCheckRaw) { $memCheckRaw.ToString().Trim() } else { "" }
if ($hasMembership -eq "1") {
    Write-Host "[IDEMPOTENT] Membership 'movana_migration -> movana_owner' already granted." -ForegroundColor DarkGray
} else {
    Write-Host "[GRANTING] GRANT movana_owner TO movana_migration..." -ForegroundColor Green
    $grantDdl = "GRANT movana_owner TO movana_migration;"
    $output = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -v ON_ERROR_STOP=1 -c $grantDdl 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[CRITICAL ERROR] Failed to grant role membership: $output" -ForegroundColor Red
        exit 1
    }
}

# POST-PROVISIONING VERIFICATION
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "POST-PROVISIONING VERIFICATION" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$verifyRolesQuery = @"
SELECT 
    rolname,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
FROM pg_roles
WHERE rolname IN ('movana_owner', 'movana_app', 'movana_readonly', 'movana_migration')
ORDER BY rolname;
"@

$verifiedRows = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -F "|" -c $verifyRolesQuery 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CRITICAL ERROR] Post-provisioning role query failed: $verifiedRows" -ForegroundColor Red
    exit 1
}

$roleMap = @{}
foreach ($row in $verifiedRows) {
    if (-not [string]::IsNullOrWhiteSpace($row)) {
        $parts = $row.Split('|')
        $rName = $parts[0].Trim()
        $roleMap[$rName] = @{
            Login = $parts[1].Trim()
            Superuser = $parts[2].Trim()
            Createdb = $parts[3].Trim()
            Createrole = $parts[4].Trim()
            Inherit = $parts[5].Trim()
            Replication = $parts[6].Trim()
            Bypassrls = $parts[7].Trim()
        }
    }
}

# Assert all 4 roles exist
if ($roleMap.Count -ne 4) {
    Write-Host "[CRITICAL ERROR] Expected 4 Movana roles, but found $($roleMap.Count)!" -ForegroundColor Red
    exit 1
}

# Assert attributes
$expectedAttributes = @{
    "movana_owner"     = @{ Login = "f"; Super = "f"; Createdb = "f"; Createrole = "f"; Inherit = "f"; Replication = "f"; Bypass = "f" }
    "movana_app"       = @{ Login = "t"; Super = "f"; Createdb = "f"; Createrole = "f"; Inherit = "t"; Replication = "f"; Bypass = "f" }
    "movana_readonly"  = @{ Login = "t"; Super = "f"; Createdb = "f"; Createrole = "f"; Inherit = "t"; Replication = "f"; Bypass = "f" }
    "movana_migration" = @{ Login = "t"; Super = "f"; Createdb = "f"; Createrole = "f"; Inherit = "t"; Replication = "f"; Bypass = "f" }
}

foreach ($rName in $expectedAttributes.Keys) {
    $exp = $expectedAttributes[$rName]
    $act = $roleMap[$rName]
    if ($act.Login -ne $exp.Login -or 
        $act.Superuser -ne $exp.Super -or 
        $act.Createdb -ne $exp.Createdb -or 
        $act.Createrole -ne $exp.Createrole -or 
        $act.Inherit -ne $exp.Inherit -or 
        $act.Replication -ne $exp.Replication -or 
        $act.Bypassrls -ne $exp.Bypass) {
        Write-Host "[CRITICAL ERROR] Role attribute mismatch for $rName!" -ForegroundColor Red
        Write-Host "Expected: $($exp | Out-String)" -ForegroundColor Red
        Write-Host "Actual:   $($act | Out-String)" -ForegroundColor Red
        exit 1
    }
    Write-Host "[VERIFIED] Role '$rName' attributes match specifications exactly." -ForegroundColor Green
}

# Verify single membership
$verifyMembershipQuery = @"
SELECT count(*) FROM pg_auth_members m
JOIN pg_roles r_role ON r_role.oid = m.roleid
JOIN pg_roles r_member ON r_member.oid = m.member
WHERE r_role.rolname = 'movana_owner' AND r_member.rolname = 'movana_migration';
"@
$memCountRaw = psql -h $HostName -p $Port -U $User -d $TargetDatabase -w -t -A -c $verifyMembershipQuery 2>&1
$membershipCount = if ($null -ne $memCountRaw) { $memCountRaw.ToString().Trim() } else { "" }
if ($membershipCount -ne "1") {
    Write-Host "[CRITICAL ERROR] Expected exactly 1 membership (movana_migration -> movana_owner), but found: $membershipCount" -ForegroundColor Red
    exit 1
}
Write-Host "[VERIFIED] Role membership 'movana_migration -> movana_owner' confirmed in catalog." -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "PHASE 3B ROLE PROVISIONING COMPLETE & VERIFIED!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

exit 0
