param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$StorageDir = $(if ($env:STORAGE_LOCAL_DIR) { $env:STORAGE_LOCAL_DIR } else { "storage" }),
    [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw "DATABASE_URL is required" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }
$target = Join-Path (Resolve-Path $OutputDir) "intertext-$stamp"
New-Item -ItemType Directory -Path $target | Out-Null

pg_dump --format=custom --file (Join-Path $target "database.dump") $DatabaseUrl
if (Test-Path $StorageDir) {
    tar -czf (Join-Path $target "storage.tar.gz") -C (Resolve-Path $StorageDir) .
}
Get-FileHash (Join-Path $target "database.dump") -Algorithm SHA256 | ConvertTo-Json | Set-Content (Join-Path $target "SHA256SUMS.json") -Encoding utf8
Write-Output "Backup created: $target"
