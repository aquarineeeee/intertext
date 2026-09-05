param(
    [Parameter(Mandatory=$true)][string]$BackupDir,
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$StorageDir = $(if ($env:STORAGE_LOCAL_DIR) { $env:STORAGE_LOCAL_DIR } else { "storage" })
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw "DATABASE_URL is required" }
$dump = Join-Path $BackupDir "database.dump"
if (-not (Test-Path $dump)) { throw "database.dump not found in $BackupDir" }
pg_restore --clean --if-exists --no-owner --dbname $DatabaseUrl $dump
$archive = Join-Path $BackupDir "storage.tar.gz"
if (Test-Path $archive) {
    if (-not (Test-Path $StorageDir)) { New-Item -ItemType Directory -Path $StorageDir | Out-Null }
    tar -xzf $archive -C (Resolve-Path $StorageDir)
}
Write-Output "Restore completed. Run 'alembic upgrade head' and the test suite before serving traffic."
