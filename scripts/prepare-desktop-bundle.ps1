$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Bundle = Join-Path $Root "dist-bundle\sitecommand"
$Runtime = Join-Path $Root "desktop\runtime"

Write-Host "Building API and dashboard..."
Push-Location $Root
npm run build -w api
npm run build -w web -- --mode desktop
Pop-Location

if (Test-Path $Bundle) {
  Remove-Item "$Bundle\api\dist" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$Bundle\web\dist" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$Bundle\sites" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$Bundle\beacon" -Recurse -Force -ErrorAction SilentlyContinue
} else {
  New-Item -ItemType Directory -Force -Path $Bundle | Out-Null
}
New-Item -ItemType Directory -Force -Path "$Bundle\api\dist" | Out-Null
New-Item -ItemType Directory -Force -Path "$Bundle\web\dist" | Out-Null
Copy-Item -Recurse "$Root\api\dist\*" "$Bundle\api\dist\"
Copy-Item "$Root\api\package.json" "$Bundle\api\"
Copy-Item -Recurse "$Root\sites" "$Bundle\sites"
Copy-Item -Recurse "$Root\beacon" "$Bundle\beacon"
Copy-Item -Recurse "$Root\web\dist\*" "$Bundle\web\dist\"

Write-Host "Installing API production dependencies into bundle..."
Push-Location "$Bundle\api"
$prevError = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
npm install --omit=dev --no-package-lock
if (-not (Test-Path "node_modules\better-sqlite3\build\Release\better_sqlite3.node")) {
  npm rebuild better-sqlite3
}
$ErrorActionPreference = $prevError
if (-not (Test-Path "node_modules\better-sqlite3")) {
  Write-Error "API dependencies failed to install."
}
Pop-Location

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
  Write-Error "Node.js not found. Install Node 20+ to bundle the runtime."
}
Copy-Item $NodeExe "$Runtime\node.exe" -Force
Write-Host "Bundled Node runtime from $NodeExe"

Write-Host "Desktop bundle ready at dist-bundle/sitecommand"
