# Start NSE 200 Dashboard
# Run from: C:\Users\HP\financialstock\
# Usage: .\start-dashboard.ps1

$sidecarDir = "$PSScriptRoot\mcp-server"
$dashDir = "$PSScriptRoot\dashboard"
$uv = "$env:USERPROFILE\.local\bin\uv.exe"

if (-not (Test-Path $uv)) {
    Write-Error "uv not found. Run: irm https://astral.sh/uv/install.ps1 | iex"
    exit 1
}

Write-Host ""
Write-Host "  NSE 200 Stock Dashboard" -ForegroundColor Cyan
Write-Host "  ────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# Start yfinance sidecar in a new window
Write-Host " Starting yfinance sidecar on port 8001..." -ForegroundColor Yellow
$sidecar = Start-Process powershell -ArgumentList `
    "-NoExit -Command `"Set-Location '$sidecarDir'; $uv run python yfinance_sidecar.py`"" `
    -PassThru

Start-Sleep -Seconds 3

# Start Next.js dev server in a new window
Write-Host " Starting Next.js dashboard on port 3000..." -ForegroundColor Yellow
$dashboard = Start-Process powershell -ArgumentList `
    "-NoExit -Command `"Set-Location '$dashDir'; npm run dev`"" `
    -PassThru

Start-Sleep -Seconds 4

Write-Host ""
Write-Host " Dashboard:  http://localhost:3000" -ForegroundColor Green
Write-Host " Sidecar:    http://127.0.0.1:8001/docs" -ForegroundColor Green
Write-Host ""
Write-Host " Press Enter to stop both servers..." -ForegroundColor DarkGray
$null = Read-Host

Stop-Process -Id $sidecar.Id  -ErrorAction SilentlyContinue
Stop-Process -Id $dashboard.Id -ErrorAction SilentlyContinue
Write-Host " Stopped." -ForegroundColor Red
