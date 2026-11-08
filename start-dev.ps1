# MedCore HMS — Local Dev Startup
# Run this script from: MedCore-HMS-Phase-1\

Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MedCore HMS — Local Development Startup" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Start Docker Compose (Postgres + Redis)
Write-Host "▶ Starting Docker services (Postgres + Redis)..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ docker-compose failed. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# 2. Wait for Postgres to be healthy
Write-Host "▶ Waiting for Postgres to be ready..." -ForegroundColor Yellow
$retries = 20
for ($i = 0; $i -lt $retries; $i++) {
    $result = docker exec medcore-postgres pg_isready -U medcore_user -d medcore 2>&1
    if ($result -match "accepting connections") {
        Write-Host "  ✓ Postgres is ready!" -ForegroundColor Green
        break
    }
    Write-Host "  ... waiting ($([int]($i*2))s)" -ForegroundColor Gray
    Start-Sleep -Seconds 2
    if ($i -eq ($retries - 1)) {
        Write-Host "✗ Postgres did not become ready in time." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Services ready! Open two more terminals:" -ForegroundColor Green
Write-Host ""
Write-Host "  Terminal 1 (Backend):" -ForegroundColor White
Write-Host "    cd backend && pnpm run start:dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Terminal 2 (Frontend):" -ForegroundColor White
Write-Host "    cd frontend && pnpm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Then open: http://localhost:3000" -ForegroundColor Yellow
Write-Host "══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

