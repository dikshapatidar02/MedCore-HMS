# ==============================================================================
# MedCore HMS — Production Database Backup Script (PowerShell)
# Performs pg_dump with timestamping, SHA-256 verification, and retention policy
# ==============================================================================

param(
    [string]$BackupDir = ".\backups",
    [string]$DbHost = "127.0.0.1",
    [string]$DbPort = "5432",
    [string]$DbName = "medcore",
    [string]$DbUser = "medcore_user",
    [int]$RetentionDays = 7
)

$ErrorActionPreference = "Stop"

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmssZ")
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$BackupFile = Join-Path $BackupDir "medcore_backup_$Timestamp.dump"
$ChecksumFile = "$BackupFile.sha256"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "💾 Starting MedCore HMS Database Backup (PowerShell)" -ForegroundColor Cyan
Write-Host "   Timestamp: $Timestamp"
Write-Host "   Target: $DbName at ${DbHost}:${DbPort}"
Write-Host "==========================================================================" -ForegroundColor Cyan

# Execute pg_dump (Custom format)
& pg_dump -h $DbHost -p $DbPort -U $DbUser -F c -b -f $BackupFile $DbName
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump command failed with exit code $LASTEXITCODE"
}

# Compute SHA-256 Checksum
$Hash = (Get-FileHash -Path $BackupFile -Algorithm SHA256).Hash
"$Hash  $BackupFile" | Out-File -FilePath $ChecksumFile -Encoding utf8

$FileSize = (Get-Item $BackupFile).Length / 1MB
Write-Host "✅ Backup created successfully:" -ForegroundColor Green
Write-Host "   File: $BackupFile ($([math]::Round($FileSize, 2)) MB)"
Write-Host "   SHA-256: $Hash"

# Purge backups older than RetentionDays
$Cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "medcore_backup_*.dump*" | Where-Object { $_.LastWriteTime -lt $Cutoff } | Remove-Item -Force
Write-Host "🧹 Retention policy enforced (purged files older than $RetentionDays days)." -ForegroundColor Yellow
Write-Host "==========================================================================" -ForegroundColor Cyan
