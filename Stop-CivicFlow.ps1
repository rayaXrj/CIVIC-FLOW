$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir
docker compose down
Write-Host 'CivicFlow stopped. Database and uploads remain saved in Docker volumes.' -ForegroundColor Cyan
