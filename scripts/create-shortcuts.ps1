# Creates Windows shortcuts (.lnk) for the dashboard.\r\nparam(
  [string]$OutputDir = "accesos-directos"
)

$root = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$target = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$icon = Join-Path $env:WINDIR "System32\shell32.dll"
$iconIndexDev = 137
$iconIndexProd = 167

$outPath = Join-Path $root $OutputDir
if (-not (Test-Path $outPath)) {
  New-Item -ItemType Directory -Path $outPath | Out-Null
}

$wsh = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$name, [string]$mode, [int]$iconIndex) {
  $lnkPath = Join-Path $outPath ($name + ".lnk")
  $shortcut = $wsh.CreateShortcut($lnkPath)
  $shortcut.TargetPath = $target
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$root\scripts\launcher-dashboard.ps1`" -Mode $mode"
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = "Dashboard $name"
  $shortcut.IconLocation = "$icon,$iconIndex"
  $shortcut.Save()
}

New-Shortcut "Sistema Evaluacion - Dev" "dev" $iconIndexDev
New-Shortcut "Sistema Evaluacion - Prod" "prod" $iconIndexProd

Write-Host "Accesos directos creados en: $outPath"



