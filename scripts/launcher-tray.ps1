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

function Log([string]$msg) {
  try {
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $logFile -Value ("[$ts] " + $msg)
  } catch {
    # ignore logging failures
  }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

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
$mutexName = "Global\\SEU_TRAY_$Port"
$createdNew = $false
$mutex = $null
try {
  $mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
} catch {
  $createdNew = $true
}

if (-not $createdNew) {
  Log("Tray singleton: instancia ya existe (mutex=$mutexName). Abriendo dashboard y saliendo.")
  try { Start-Process ("http://127.0.0.1:$Port/") | Out-Null } catch {}
  return
}

function Get-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  return $null
}

function Get-ApiBase {
  return "http://127.0.0.1:$Port"
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
    return "$type: $msg"
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

function Start-DashboardIfNeeded {
  Log("Tray start. Mode=$Mode Port=$Port Attach=$Attach")
  $status = Get-JsonOrNull '/api/status'
  if ($status) { return @{ started = $false; pid = $null } }

  if ($Attach) {
    return @{ started = $false; pid = $null }
  }

  $node = Get-NodePath
  if (-not $node) {
    Log('Node no encontrado en PATH.')
    [System.Windows.Forms.MessageBox]::Show('Node no encontrado en PATH.', 'SEU - Bandeja', 'OK', 'Error') | Out-Null
    return @{ started = $false; pid = $null }
  }

  Log("Node: $node")

  $script = Join-Path $root 'scripts\launcher-dashboard.mjs'
  $dashArgs = @($script, '--mode', $Mode, '--port', [string]$Port, '--no-open')

  $p = Start-Process -FilePath $node -WorkingDirectory $root -ArgumentList $dashArgs -PassThru -WindowStyle Hidden
  Log("Dashboard spawn PID=$($p.Id)")

  # Esperar breve a que abra puerto.
  $deadline = (Get-Date).AddSeconds(6)
  do {
    Start-Sleep -Milliseconds 250
    $status = Get-JsonOrNull '/api/status'
  } while (-not $status -and (Get-Date) -lt $deadline)

  if ($status) { Log('Dashboard OK (api/status responde)') }
  else { Log('Dashboard NO responde en el tiempo esperado') }

  return @{ started = $true; pid = $p.Id }
}

function Get-SystemMood($status, $health) {
  if (-not $status) { return 'error' }

  $running = @()
  try { $running = @($status.running) } catch { $running = @() }
  $hasDevOrProd = $running -contains 'dev' -or $running -contains 'prod'
  $hasPortal = $running -contains 'portal'

  $mode = ("$($status.mode)").ToLowerInvariant()
  if ($mode -ne 'prod') { $mode = 'dev' }

  $services = $null
  try { $services = $health.services } catch { $services = $null }

  $expected = @()
  if ($hasDevOrProd) {
    $expected += @('apiDocente')
    $expected += @($(if ($mode -eq 'prod') { 'webDocenteProd' } else { 'webDocenteDev' }))
  }
  if ($hasPortal) { $expected += @('apiPortal') }

  if ($expected.Count -eq 0) { return 'info' }

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

  if ($down -gt 0) { return 'error' }
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

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Visible = $true
$notify.Text = 'SEU: iniciando…'
$notify.Icon = (Get-MoodIcon 'info')
Log('NotifyIcon visible')

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$miTitle = $menu.Items.Add('SEU - Stack local')
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

$timer.add_Tick({
  # Durante el cierre del runspace/app, Windows Forms puede disparar un tick tardío.
  # En ese escenario PowerShell aborta pipelines y lanza PipelineStoppedException.
  try {
    if (Test-Path variable:exiting) {
      if ($exiting) { return }
    }

    $st = Get-JsonOrNull '/api/status'
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

    $text = "SEU $label | $mode | proc:$runningCount"
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
  } while (-not $st -and (Get-Date) -lt $deadline)

  if ($st) {
    Start-Process ((Get-ApiBase) + '/') | Out-Null
  }
}

[System.Windows.Forms.Application]::Run()
