# Downloads a private copy of Node.js 22 into runtime\node, so LAN OS runs without installing anything.
# Called by "Start LAN OS.bat" when this PC has no (or too old) Node.js. Safe to run again: it replaces runtime\node.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the progress bar makes downloads in Windows PowerShell very slow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'runtime'
$target = Join-Path $runtime 'node'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$base = 'https://nodejs.org/dist/latest-v22.x'

# The checksum list names the newest Node 22 zip and its SHA-256, so we can check the download.
$sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content -split "`n"
$line = $sums | Where-Object { $_ -match "node-v22\.[0-9.]+-win-$arch\.zip$" } | Select-Object -First 1
if (-not $line) { throw "Could not find Node.js 22 for win-$arch on nodejs.org." }
$hash, $file = $line.Trim() -split '\s+'

New-Item -ItemType Directory -Force $runtime | Out-Null
$zip = Join-Path $runtime $file
Write-Host "Downloading $file (about 30 MB)..."
Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $zip
if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $hash.ToUpper()) {
  Remove-Item $zip
  throw 'The download was damaged (checksum mismatch). Try again.'
}

Write-Host 'Unpacking...'
$unpack = Join-Path $runtime 'unpack'
if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
Expand-Archive $zip -DestinationPath $unpack
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
Move-Item (Join-Path $unpack ($file -replace '\.zip$', '')) $target
Remove-Item -Recurse -Force $unpack
Remove-Item $zip
Write-Host "Node.js is ready in runtime\node."
