param([switch]$Quick)
$ErrorActionPreference = 'Stop'
$candidates = @()
if ($env:FOREST_PYTHON) { $candidates += $env:FOREST_PYTHON }
$candidates += (Join-Path $PSScriptRoot '.venv/Scripts/python.exe')
foreach ($name in @('python', 'py')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $dependencies = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $nodeCommand.Source))
    $candidates += (Join-Path $dependencies 'python/python.exe')
}
foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    try { $versionOutput = & $candidate --version 2>&1 } catch { continue }
    if ($LASTEXITCODE -ne 0) { continue }
    $verifyArgs = @((Join-Path $PSScriptRoot 'scripts/verify.py'))
    if ($Quick) { $verifyArgs += '--quick' }
    & $candidate @verifyArgs
    exit $LASTEXITCODE
}
throw 'Python not found. Install Python 3.11+ or set FOREST_PYTHON to python.exe.'
