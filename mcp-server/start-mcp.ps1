# Start the Financial Datasets MCP Server
# Usage: .\start-mcp.ps1
# Prerequisites: uv installed, FINANCIAL_DATASETS_API_KEY set in .env

$uvPath = "$env:USERPROFILE\.local\bin\uv.exe"
$serverDir = $PSScriptRoot

if (-not (Test-Path "$uvPath")) {
    Write-Error "uv not found at $uvPath. Run: irm https://astral.sh/uv/install.ps1 | iex"
    exit 1
}

if (-not (Test-Path "$serverDir\.env")) {
    Write-Error ".env file missing. Copy .env.example to .env and set your FINANCIAL_DATASETS_API_KEY."
    exit 1
}

$envContent = Get-Content "$serverDir\.env" | Where-Object { $_ -match "FINANCIAL_DATASETS_API_KEY=" }
if ($envContent -match "your-financial-datasets-api-key") {
    Write-Warning "⚠  FINANCIAL_DATASETS_API_KEY is still the placeholder value."
    Write-Warning "   Get a free key at: https://financialdatasets.ai/"
    Write-Warning "   Edit mcp-server\.env and replace 'your-financial-datasets-api-key'"
    exit 1
}

Write-Host "✓ Starting Financial Datasets MCP Server..." -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Set-Location $serverDir
& $uvPath run server.py
