$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker was not found. Install and start Docker Desktop, then run this script again.'
}
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created local .env from .env.example. Change demo passwords before any public deployment.' -ForegroundColor Yellow
}

docker compose up --build -d
Write-Host 'Waiting for CivicFlow to become ready...' -ForegroundColor Cyan
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { docker compose logs --tail=60 app; throw 'CivicFlow did not become ready. Review the app logs above.' }

Write-Host ''
Write-Host 'CivicFlow is ready: http://localhost:3000' -ForegroundColor Green
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -match 'Wi-Fi|Wireless|Ethernet' }
foreach ($address in $addresses) { Write-Host "Same-Wi-Fi devices: http://$($address.IPAddress):3000" -ForegroundColor Green }
Write-Host 'Use Start-CivicFlow.ps1 again after the first run; data stays in Docker volumes.'
Start-Process 'http://localhost:3000'
