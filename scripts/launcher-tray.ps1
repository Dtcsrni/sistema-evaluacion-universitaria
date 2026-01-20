# Windows tray launcher for the local dashboard/stack.
# - Shows a notification-area icon with live system status.
# - Controls the existing dashboard API (/api/*).
# Usage (recommended via VBS wrapper): powershell.exe -STA -WindowStyle Hidden -File scripts\launcher-tray.ps1 -Mode none -Port 4519

param(
  [ValidateSet('dev','prod','none')]
  [string]$Mode = 'none',
  [int]$Port = 4519,
  [switch]$NoOpen,
  [switch]$Attach
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir 'tray.log'
$lockPath = Join-Path $logDir 'dashboard.lock.json'
$script:Port = $Port

function Log([string]$msg) {
  try {
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $logFile -Value ("[$ts] " + $msg)
  } catch {
    # ignore logging failures
  }
}

function Read-LockPort {
  try {
    if (-not (Test-Path $lockPath)) { return $null }
    $raw = Get-Content -LiteralPath $lockPath -Raw -ErrorAction Stop
    if (-not $raw) { return $null }
    $json = $raw | ConvertFrom-Json -ErrorAction Stop
    if ($json -and $json.port) { return [int]$json.port }
  } catch {
    Log("Lock read failed: $($_.Exception.Message)")
  }
  return $null
}

function Test-StatusPort([int]$port) {
  if (-not $port -or $port -le 0) { return $false }
  try {
    Invoke-RestMethod -Uri ("http://127.0.0.1:$port/api/status") -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Sync-PortFromLock {
  param([switch]$RequireReachable)

  $lockPort = Read-LockPort
  if (-not $lockPort) { return $false }
  if ($lockPort -eq $script:Port) { return $false }
  if ($RequireReachable -and -not (Test-StatusPort $lockPort)) { return $false }

  $prev = $script:Port
  $script:Port = $lockPort
  Log("Dashboard port updated: $prev -> $lockPort")
  return $true
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Evita cuadros JIT por excepciones no controladas en eventos WinForms (Timer/Clicks).
# En vez de crashear el tray (y dejar íconos duplicados/fantasma), registramos y continuamos.
try {
  [System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
  [System.Windows.Forms.Application]::add_ThreadException({
    param($sender, $e)
    try {
      $ex = $e.Exception
      if ($ex) {
        Log("ThreadException: $($ex.GetType().FullName): $($ex.Message)")
      } else {
        Log('ThreadException: (sin Exception)')
      }
    } catch {
      # ignore
    }
  })
} catch {
  # ignore
}

try {
  [AppDomain]::CurrentDomain.add_UnhandledException({
    param($sender, $e)
    try {
      $ex = $e.ExceptionObject
      if ($ex) {
        Log("UnhandledException: $($ex.GetType().FullName): $($ex.Message)")
      } else {
        Log('UnhandledException: (sin ExceptionObject)')
      }
    } catch {
      # ignore
    }
  })
} catch {
  # ignore
}

$iconDir = Join-Path $root 'scripts\icons'
if (-not (Test-Path $iconDir)) {
  New-Item -ItemType Directory -Path $iconDir | Out-Null
}

function New-RoundedRectPath([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Max(1.0, $radius * 2.0)
  $x = $rect.X
  $y = $rect.Y
  $w = $rect.Width
  $h = $rect.Height

  $path.AddArc($x, $y, $d, $d, 180, 90) | Out-Null
  $path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90) | Out-Null
  $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90) | Out-Null
  $path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90) | Out-Null
  $path.CloseFigure() | Out-Null
  return $path
}

function Save-IcoFromPngImages([string]$path, [System.Collections.Generic.List[byte[]]]$pngImages, [int[]]$sizes) {
  if ($pngImages.Count -ne $sizes.Count) {
    throw "Save-IcoFromPngImages: conteos no coinciden"
  }

  $count = [uint16]$pngImages.Count
  $headerSize = 6
  $dirEntrySize = 16
  $offset = $headerSize + ($dirEntrySize * $pngImages.Count)

  $fs = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $bw = New-Object System.IO.BinaryWriter($fs)
  try {
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$count)

    for ($i = 0; $i -lt $pngImages.Count; $i++) {
      $size = [int]$sizes[$i]
      $png = $pngImages[$i]
      $w = if ($size -ge 256) { 0 } else { [byte]$size }
      $h = if ($size -ge 256) { 0 } else { [byte]$size }
      $bw.Write($w)
      $bw.Write($h)
      $bw.Write([byte]0)
      $bw.Write([byte]0)
      $bw.Write([uint16]1)
      $bw.Write([uint16]32)
      $bw.Write([uint32]$png.Length)
      $bw.Write([uint32]$offset)
      $offset += $png.Length
    }

    for ($i = 0; $i -lt $pngImages.Count; $i++) {
      $bw.Write($pngImages[$i])
    }
  } finally {
    $bw.Flush();
    $bw.Dispose();
    $fs.Dispose();
  }
}

function New-TrayBitmap([int]$size, [string]$mood) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # Paleta (oscura, moderna)
  $bg1 = '#0b1220'
  $bg2 = '#111827'
  $accent = switch ($mood) {
    'ok' { '#22c55e' }
    'warn' { '#f59e0b' }
    'error' { '#ef4444' }
    default { '#a78bfa' }
  }

  $cBg1 = [System.Drawing.ColorTranslator]::FromHtml($bg1)
  $cBg2 = [System.Drawing.ColorTranslator]::FromHtml($bg2)
  $cAccent = [System.Drawing.ColorTranslator]::FromHtml($accent)
  $cInkSoft = [System.Drawing.Color]::FromArgb(210, 226, 232, 240)

  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [Math]::Max(1, [int]($size * 0.08))
  $rect = New-Object System.Drawing.RectangleF $pad, $pad, ($size - 2*$pad), ($size - 2*$pad)
  $radius = [Math]::Max(4, [int]($size * 0.28))
  $pathBg = New-RoundedRectPath $rect $radius

  try {
    $brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $cBg1, $cBg2, 35)
    $g.FillPath($brushBg, $pathBg)
    $penBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(65, 0, 0, 0), [Math]::Max(1, [int]($size * 0.06)))
    $g.DrawPath($penBorder, $pathBg)

    # Glyph minimal (nodos)
    $stroke = [Math]::Max(2, [int]($size * 0.16))
    $node = [Math]::Max(2, [int]($size * 0.18))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(235, $cAccent.R, $cAccent.G, $cAccent.B), $stroke)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $cx = $size * 0.50
    $cy = $size * 0.52
    $dx = $size * 0.18
    $dy = $size * 0.12
    $p1 = New-Object System.Drawing.PointF ($cx - $dx), ($cy)
    $p2 = New-Object System.Drawing.PointF ($cx), ($cy)
    $p3 = New-Object System.Drawing.PointF ($cx), ($cy + $dy)
    $p4 = New-Object System.Drawing.PointF ($cx + $dx), ($cy + $dy)

    $g.DrawLine($pen, $p1, $p2)
    $g.DrawLine($pen, $p2, $p3)
    $g.DrawLine($pen, $p3, $p4)

    $nodeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, $cAccent.R, $cAccent.G, $cAccent.B))
    $g.FillEllipse($nodeBrush, ($p1.X - $node/2), ($p1.Y - $node/2), $node, $node)
    $g.FillEllipse($nodeBrush, ($p2.X - $node/2), ($p2.Y - $node/2), $node, $node)
    $g.FillEllipse($nodeBrush, ($p3.X - $node/2), ($p3.Y - $node/2), $node, $node)
    $g.FillEllipse($nodeBrush, ($p4.X - $node/2), ($p4.Y - $node/2), $node, $node)

    # Dot de estado esquina
    $dot = [Math]::Max(2, [int]($size * 0.26))
    $dotRect = New-Object System.Drawing.RectangleF ($size - $pad - $dot), ($pad), $dot, $dot
    $dotBorder = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 0, 0, 0))
    $g.FillEllipse($dotBorder, ($dotRect.X + 1), ($dotRect.Y + 1), $dotRect.Width, $dotRect.Height)
    $g.FillEllipse($nodeBrush, $dotRect)

    $dotBorder.Dispose()
    $nodeBrush.Dispose()
    $pen.Dispose()
    $penBorder.Dispose()
    $brushBg.Dispose()
  } finally {
    $pathBg.Dispose()
    $g.Dispose()
  }

  return $bitmap
}

function Ensure-TrayIcons {
  $sizes = @(16, 24, 32, 48)
  $moods = @('info', 'ok', 'warn', 'error')
  foreach ($m in $moods) {
    $path = Join-Path $iconDir ("tray-$m.ico")
    if (Test-Path $path) { continue }

    $pngs = New-Object "System.Collections.Generic.List[byte[]]"
    foreach ($s in $sizes) {
      $bmp = New-TrayBitmap $s $m
      try {
        $ms = New-Object System.IO.MemoryStream
        try {
          $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
          $pngs.Add($ms.ToArray()) | Out-Null
        } finally {
          $ms.Dispose()
        }
      } finally {
        $bmp.Dispose()
      }
    }
    Save-IcoFromPngImages $path $pngs $sizes
  }
}

function Get-TrayIconPath([string]$mood) {
  $m = ("$mood").ToLowerInvariant()
  switch ($m) {
    'ok' { return (Join-Path $iconDir 'tray-ok.ico') }
    'warn' { return (Join-Path $iconDir 'tray-warn.ico') }
    'error' { return (Join-Path $iconDir 'tray-error.ico') }
    default { return (Join-Path $iconDir 'tray-info.ico') }
  }
}

function Load-TrayIcon([string]$mood) {
  if (-not (Test-Path variable:script:TrayIconCache)) {
    $script:TrayIconCache = @{}
  }

  $key = ("$mood").ToLowerInvariant()
  if ($script:TrayIconCache.ContainsKey($key)) {
    return $script:TrayIconCache[$key]
  }

  try {
    Ensure-TrayIcons
    $p = Get-TrayIconPath $mood
    if (Test-Path $p) {
      $ico = New-Object System.Drawing.Icon($p)
      $script:TrayIconCache[$key] = $ico
      return $ico
    }
  } catch {
    # fallback abajo
  }

  $script:TrayIconCache[$key] = $null
  return $null
}

# Enforce single tray instance (avoid multiple notification icons).
# Mutex is per dashboard port, so DEV/PROD shortcuts that target the same port share one tray.
$createdNew = $false
$mutex = $null

# Nota: "Global\" puede fallar sin privilegios (y permitir múltiples instancias).
# Preferimos "Local\" para asegurar el singleton por sesión de usuario.
$mutexName = "Local\\EP_TRAY_$Port"
try {
  $mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
} catch {
  try {
    $mutexName = "EP_TRAY_$Port"
    $mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
  } catch {
    # Si no podemos crear mutex, seguimos (degradación), pero al menos lo registramos.
    Log('Tray singleton: no se pudo crear mutex; podría haber múltiples íconos.')
    $createdNew = $true
  }
}

if (-not $createdNew) {
  Log("Tray singleton: instancia ya existe (mutex=$mutexName). Abriendo dashboard y saliendo.")
  $openPort = $Port
  $lockPort = Read-LockPort
  if ($lockPort) { $openPort = $lockPort }
  try { Start-Process ("http://127.0.0.1:$openPort/") | Out-Null } catch {}
  return
}

function Get-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  return $null
}

function Get-ApiBase {
  return "http://127.0.0.1:$script:Port"
}

function Format-ApiException([object]$err) {
  try {
    $ex = $err.Exception
    if (-not $ex) { return 'error desconocido' }

    $type = $ex.GetType().FullName
    $msg = ("$($ex.Message)").Trim()
    if (-not $msg) { $msg = '<sin mensaje>' }

    $status = $null
    try {
      if ($null -ne $ex.StatusCode) { $status = [string]$ex.StatusCode }
    } catch {}

    if (-not $status) {
      try {
        if ($ex.Response -and $ex.Response.StatusCode) { $status = [string]$ex.Response.StatusCode }
      } catch {}
    }

    if ($status) {
      return "$type (HTTP $status): $msg"
    }
    return "${type}: $msg"
  } catch {
    return 'error (no se pudo formatear excepción)'
  }
}

function Log-ApiFailure([string]$key, [string]$msg, [int]$minIntervalMs = 8000) {
  try {
    if (-not (Test-Path variable:script:ApiFailLog)) {
      $script:ApiFailLog = @{}
    }

    $now = [Environment]::TickCount64
    $last = 0
    try {
      if ($script:ApiFailLog.ContainsKey($key)) { $last = [int64]$script:ApiFailLog[$key] }
    } catch { $last = 0 }

    if (($now - $last) -ge $minIntervalMs) {
      $script:ApiFailLog[$key] = $now
      Log($msg)
    }
  } catch {
    # ignore
  }
}

function Get-JsonOrNull([string]$path) {
  try {
    return Invoke-RestMethod -Uri ((Get-ApiBase) + $path) -TimeoutSec 1
  } catch {
    $details = Format-ApiException $_
    Log-ApiFailure "GET:$path" ("GET $path failed: $details")
    return $null
  }
}

function Invoke-PostJsonOrNull([string]$path, [hashtable]$body) {
  try {
    $json = ($body | ConvertTo-Json -Depth 5)
    return Invoke-RestMethod -Method Post -Uri ((Get-ApiBase) + $path) -ContentType 'application/json' -Body $json -TimeoutSec 2
  } catch {
    $details = Format-ApiException $_
    Log-ApiFailure "POST:$path" ("POST $path failed: $details")
    return $null
  }
}

function Wait-ForStatus([int]$timeoutMs = 5000) {
  $deadline = [Environment]::TickCount64 + [Math]::Max(500, $timeoutMs)
  do {
    $status = Get-JsonOrNull '/api/status'
    if ($status) { return $status }
    Sync-PortFromLock -RequireReachable | Out-Null
    Start-Sleep -Milliseconds 250
  } while ([Environment]::TickCount64 -lt $deadline)
  return $null
}

function Get-RunningTasksFromStatus($status) {
  try { return @($status.running) } catch { return @() }
}

function Test-AnyStackTasksRunning($running) {
  if (-not $running) { return $false }
  $names = @('dev', 'prod', 'dev-backend', 'dev-frontend')
  foreach ($name in $names) {
    if ($running -contains $name) { return $true }
  }
  return $false
}

function Test-ComposeServiceRunning([string]$mode, [string]$service) {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { return $false }
  $composeFile = Join-Path $root 'docker-compose.yml'
  if (-not (Test-Path $composeFile)) { return $false }

  $args = @('compose', '-f', $composeFile)
  if ($mode -eq 'prod') { $args += @('--profile', 'prod') }
  $args += @('ps', '-q', $service)
  try {
    $out = & $docker.Source @args 2>$null
    return ([string]$out).Trim().Length -gt 0
  } catch {
    return $false
  }
}

function Test-StackRunning([string]$mode) {
  if ($mode -eq 'prod') {
    return (
      (Test-ComposeServiceRunning 'prod' 'mongo_local') -and
      (Test-ComposeServiceRunning 'prod' 'api_docente_prod') -and
      (Test-ComposeServiceRunning 'prod' 'web_docente_prod')
    )
  }
  return (
    (Test-ComposeServiceRunning 'dev' 'mongo_local') -and
    (Test-ComposeServiceRunning 'dev' 'api_docente_local')
  )
}

function Test-AnyStackRunning {
  if (Test-StackRunning 'prod') { return $true }
  if (Test-StackRunning 'dev') { return $true }
  return $false
}

function Ensure-StackOnLaunch {
  if ($Attach) { return }
  $desired = ("$Mode").ToLowerInvariant()
  if ($desired -ne 'dev' -and $desired -ne 'prod') { return }

  $status = Wait-ForStatus 6000
  if (-not $status) { return }

  $running = Get-RunningTasksFromStatus $status
  if (Test-AnyStackTasksRunning $running) { return }
  if (Test-AnyStackRunning) { return }

  Log("Stack detenido. Solicitando inicio ($desired).")
  Invoke-PostJsonOrNull '/api/start' @{ task = $desired } | Out-Null
}

function Start-DashboardIfNeeded {
  Log("Tray start. Mode=$Mode Port=$script:Port Attach=$Attach")
  Sync-PortFromLock -RequireReachable | Out-Null
  $status = Get-JsonOrNull '/api/status'
  if ($status) { return @{ started = $false; pid = $null } }

  if ($Attach) {
    return @{ started = $false; pid = $null }
  }

  $node = Get-NodePath
  if (-not $node) {
    Log('Node no encontrado en PATH.')
    [System.Windows.Forms.MessageBox]::Show('Node no encontrado en PATH.', 'EP - Bandeja', 'OK', 'Error') | Out-Null
    return @{ started = $false; pid = $null }
  }

  Log("Node: $node")

  $script = Join-Path $root 'scripts\launcher-dashboard.mjs'
  $dashArgs = @($script, '--mode', $Mode, '--port', [string]$script:Port, '--no-open')

  $p = Start-Process -FilePath $node -WorkingDirectory $root -ArgumentList $dashArgs -PassThru -WindowStyle Hidden
  Log("Dashboard spawn PID=$($p.Id)")

  # Esperar breve a que abra puerto.
  $deadline = (Get-Date).AddSeconds(6)
  do {
    Start-Sleep -Milliseconds 250
    $status = Get-JsonOrNull '/api/status'
  } while (-not $status -and (Get-Date) -lt $deadline)

  if (-not $status) {
    if (Sync-PortFromLock -RequireReachable) {
      $status = Get-JsonOrNull '/api/status'
    }
  }

  if ($status) { Log('Dashboard OK (api/status responde)') }
  else { Log('Dashboard NO responde en el tiempo esperado') }

  return @{ started = $true; pid = $p.Id }
}

function Get-SystemMood($status, $health) {
  if (-not $status) { return 'error' }

  $running = @()
  try { $running = @($status.running) } catch { $running = @() }
  $hasDevOrProd = $running -contains 'dev' -or $running -contains 'prod' -or $running -contains 'dev-backend' -or $running -contains 'dev-frontend'
  $hasPortal = $running -contains 'portal'

  $mode = ("$($status.mode)").ToLowerInvariant()
  if ($mode -ne 'prod') { $mode = 'dev' }

  $services = $null
  try { $services = $health.services } catch { $services = $null }

  $stackState = ''
  $stackRunning = $false
  $dockerState = ''
  try { $stackState = ("$($status.dockerState.stack.state)").ToLowerInvariant() } catch { $stackState = '' }
  try { $stackRunning = [bool]$status.dockerState.stack.running } catch { $stackRunning = $false }
  try { $dockerState = ("$($status.dockerState.state)").ToLowerInvariant() } catch { $dockerState = '' }

  if ($dockerState -eq 'error' -or $stackState -eq 'error') { return 'error' }

  $stackHint = $stackRunning -or $stackState -eq 'starting' -or $stackState -eq 'checking' -or $stackState -eq 'skipped'
  $healthStackUp = $false
  $healthPortalUp = $false
  if ($services) {
    foreach ($key in @('apiDocente', 'webDocenteDev', 'webDocenteProd')) {
      try {
        if ($services.$key -and $services.$key.ok -eq $true) {
          $healthStackUp = $true
          break
        }
      } catch {}
    }
    try {
      if ($services.apiPortal -and $services.apiPortal.ok -eq $true) { $healthPortalUp = $true }
    } catch {}
  }

  if (-not $hasDevOrProd -and ($stackHint -or $healthStackUp)) { $hasDevOrProd = $true }
  if (-not $hasPortal -and $healthPortalUp) { $hasPortal = $true }

  $expected = @()
  if ($hasDevOrProd) {
    $expected += @('apiDocente')
    $expected += @($(if ($mode -eq 'prod') { 'webDocenteProd' } else { 'webDocenteDev' }))
  }
  if ($hasPortal) { $expected += @('apiPortal') }

  if ($expected.Count -eq 0) {
    if ($stackState -eq 'starting' -or $stackState -eq 'checking') { return 'warn' }
    return 'info'
  }

  $ok = 0
  $down = 0
  $unknown = 0

  foreach ($key in $expected) {
    $info = $null
    try { $info = $services.$key } catch { $info = $null }

    if (-not $info -or ($info.ok -isnot [bool])) {
      $unknown += 1
      continue
    }

    if ($info.ok) { $ok += 1 } else { $down += 1 }
  }

  if ($down -gt 0) {
    if ($stackState -eq 'starting' -or $stackState -eq 'checking') { return 'warn' }
    return 'error'
  }
  if ($unknown -gt 0) { return 'warn' }
  return 'ok'
}

function Get-MoodIcon([string]$mood) {
  $custom = Load-TrayIcon $mood
  if ($custom) { return $custom }

  switch ($mood) {
    'ok' { return [System.Drawing.SystemIcons]::Shield }
    'warn' { return [System.Drawing.SystemIcons]::Warning }
    'error' { return [System.Drawing.SystemIcons]::Error }
    default { return [System.Drawing.SystemIcons]::Information }
  }
}

function ConvertTo-ShortText([string]$s, [int]$max = 60) {
  if (-not $s) { return '' }
  $t = $s.Trim()
  if ($t.Length -le $max) { return $t }
  return $t.Substring(0, [Math]::Max(0, $max - 1)) + '…'
}

$launch = Start-DashboardIfNeeded
Ensure-StackOnLaunch

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Visible = $true
$notify.Text = 'EP: iniciando…'
$notify.Icon = (Get-MoodIcon 'info')
Log('NotifyIcon visible')

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$miTitle = $menu.Items.Add('EP - Stack local')
$miTitle.Enabled = $false
$menu.Items.Add('-') | Out-Null

$miOpen = $menu.Items.Add('Abrir dashboard')
$miStartDev = $menu.Items.Add('Iniciar DEV')
$miStartProd = $menu.Items.Add('Iniciar PROD')
$miStopAll = $menu.Items.Add('Detener todo')
$miRestartStack = $menu.Items.Add('Reiniciar stack')
$menu.Items.Add('-') | Out-Null
$miPid = $menu.Items.Add('PID: -')
$miPid.Enabled = $false
$miExit = $menu.Items.Add('Salir')

$notify.ContextMenuStrip = $menu

$miOpen.add_Click({
  Start-Process ((Get-ApiBase) + '/') | Out-Null
})

$notify.add_DoubleClick({
  Start-Process ((Get-ApiBase) + '/') | Out-Null
})

$miStartDev.add_Click({ Invoke-PostJsonOrNull '/api/start' @{ task = 'dev' } | Out-Null })
$miStartProd.add_Click({ Invoke-PostJsonOrNull '/api/start' @{ task = 'prod' } | Out-Null })

$miRestartStack.add_Click({ Invoke-PostJsonOrNull '/api/restart' @{ task = 'stack' } | Out-Null })

$miStopAll.add_Click({
  $st = Get-JsonOrNull '/api/status'
  if ($st -and $st.running) {
    foreach ($t in @($st.running)) {
      Invoke-PostJsonOrNull '/api/stop' @{ task = "$t" } | Out-Null
    }
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500

$lastMood = 'info'
$script:ApiFailCount = 0
$script:LastRestartAttempt = 0
$script:RestartCooldownMs = 20000
$script:RestartInFlight = $false

$timer.add_Tick({
  # Durante el cierre del runspace/app, Windows Forms puede disparar un tick tardío.
  # En ese escenario PowerShell aborta pipelines y lanza PipelineStoppedException.
  try {
    if (Test-Path variable:exiting) {
      if ($exiting) { return }
    }

    $st = Get-JsonOrNull '/api/status'
    if (-not $st) {
      if (Sync-PortFromLock -RequireReachable) {
        $st = Get-JsonOrNull '/api/status'
      }
    }

    if (-not $st) {
      $script:ApiFailCount += 1
      if (-not $Attach -and $script:ApiFailCount -ge 3) {
        $now = [Environment]::TickCount64
        if (($now - $script:LastRestartAttempt) -ge $script:RestartCooldownMs -and -not $script:RestartInFlight) {
          $script:LastRestartAttempt = $now
          $script:RestartInFlight = $true
          Log('Dashboard no responde. Intentando relanzar...')
          try {
            Start-DashboardIfNeeded | Out-Null
          } finally {
            $script:RestartInFlight = $false
          }
        }
      }
    } else {
      $script:ApiFailCount = 0
    }
    $hl = Get-JsonOrNull '/api/health'

    $mood = Get-SystemMood $st $hl
    if (-not $mood) { $mood = 'error' }

    if ($mood -ne $lastMood) {
      $lastMood = $mood
      $notify.Icon = (Get-MoodIcon $mood)
    }

    $runningCount = 0
    try { $runningCount = @($st.running).Count } catch { $runningCount = 0 }
    $mode = '-'
    try { $mode = ("$($st.mode)").ToUpperInvariant() } catch { $mode = '-' }

    $label = switch ($mood) {
      'ok' { 'OK' }
      'warn' { 'WARN' }
      'error' { 'ERROR' }
      default { 'INFO' }
    }

    $text = "EP $label | $mode | proc:$runningCount"
    $notify.Text = ConvertTo-ShortText $text 60

    $dashPidText = '-'
    $install = Get-JsonOrNull '/api/install'
    try { if ($install.dashboard.pid) { $dashPidText = [string]$install.dashboard.pid } } catch { $dashPidText = '-' }
    try { $miPid.Text = "PID: $dashPidText" } catch {}
  } catch [System.Management.Automation.PipelineStoppedException] {
    return
  } catch [System.ObjectDisposedException] {
    return
  } catch {
    Log("Tick error: $($_.Exception.GetType().FullName): $($_.Exception.Message)")
  }
})

$exiting = $false
$miExit.add_Click({
  if ($exiting) { return }
  $exiting = $true
  try { $timer.Stop() } catch {}
  try { $timer.Dispose() } catch {}
  $notify.Visible = $false
  $notify.Dispose()

  # Disponer íconos custom (si fueron cargados).
  try {
    if (Test-Path variable:script:TrayIconCache) {
      foreach ($k in @($script:TrayIconCache.Keys)) {
        $ico = $script:TrayIconCache[$k]
        if ($ico -and ($ico -is [System.Drawing.Icon])) {
          try { $ico.Dispose() } catch {}
        }
      }
      $script:TrayIconCache.Clear()
    }
  } catch {}

  try { if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() } } catch {}

  # Si nosotros lo lanzamos, intentamos cerrarlo.
  if ($launch.started -and $launch.pid) {
    try { Stop-Process -Id $launch.pid -Force -ErrorAction SilentlyContinue } catch {}
  }

  [System.Windows.Forms.Application]::Exit()
})

$timer.Start()

if (-not $NoOpen) {
  # Abrir dashboard una vez que esté arriba.
  $deadline = (Get-Date).AddSeconds(6)
  do {
    Start-Sleep -Milliseconds 250
    $st = Get-JsonOrNull '/api/status'
    if (-not $st) {
      Sync-PortFromLock -RequireReachable | Out-Null
    }
  } while (-not $st -and (Get-Date) -lt $deadline)

  if ($st) {
    Start-Process ((Get-ApiBase) + '/') | Out-Null
  }
}

[System.Windows.Forms.Application]::Run()
