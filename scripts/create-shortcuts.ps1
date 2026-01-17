# Creates Windows shortcuts (.lnk) for the dashboard.
param(
  [string]$OutputDir = "accesos-directos",
  [switch]$Force
)

$root = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
$target = Join-Path $env:WINDIR "System32\wscript.exe"
$iconDir = Join-Path $root "scripts\icons"
$iconDev = Join-Path $iconDir "dashboard-dev.ico"
$iconProd = Join-Path $iconDir "dashboard-prod.ico"

$outPath = Join-Path $root $OutputDir
if (-not (Test-Path $outPath)) {
  New-Item -ItemType Directory -Path $outPath | Out-Null
}

if ($Force) {
  # Limpia accesos previos para evitar duplicados (incluye "Bandeja" y legacy).
  Get-ChildItem -Path $outPath -Filter "Sistema Evaluacion - *.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue } catch {}
  }
}

if (-not (Test-Path $iconDir)) {
  New-Item -ItemType Directory -Path $iconDir | Out-Null
}

Add-Type -AssemblyName System.Drawing

function New-DashboardIcon([string]$path, [string]$label, [string]$bgHexA, [string]$bgHexB, [string]$accentHex) {
  if (-not $Force -and (Test-Path $path)) {
    return
  }

  $size = 256
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $bgA = [System.Drawing.ColorTranslator]::FromHtml($bgHexA)
  $bgB = [System.Drawing.ColorTranslator]::FromHtml($bgHexB)
  $accent = [System.Drawing.ColorTranslator]::FromHtml($accentHex)
  $white = [System.Drawing.Color]::FromArgb(245, 255, 255, 255)
  $muted = [System.Drawing.Color]::FromArgb(180, 226, 232, 240)
  $glowA = [System.Drawing.Color]::FromArgb(140, 255, 255, 255)
  $glowB = [System.Drawing.Color]::FromArgb(0, 255, 255, 255)

  $graphics.Clear([System.Drawing.Color]::Transparent)

  # Fondo redondeado con gradiente.
  $rect = New-Object System.Drawing.RectangleF 16, 16, ($size - 32), ($size - 32)
  $radius = 64
  $pathRound = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pathRound.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90) | Out-Null
  $pathRound.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90) | Out-Null
  $pathRound.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90) | Out-Null
  $pathRound.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90) | Out-Null
  $pathRound.CloseFigure() | Out-Null

  $brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $bgA, $bgB, 35)
  $graphics.FillPath($brushBg, $pathRound)

  # Sombra suave interna (borde).
  $penSoft = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 15, 23, 42), 6)
  $graphics.DrawPath($penSoft, $pathRound)

  # Emblema: labor docente + toque tecnológico (cap + pizarra + circuitos).

  # Glow sutil.
  $glowRect = New-Object System.Drawing.RectangleF 38, 44, 180, 172
  $tmpGlowPath = $null
  $glowBrush = $null
  try {
    $tmpGlowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tmpGlowPath.AddEllipse($glowRect) | Out-Null
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($tmpGlowPath)
    $glowBrush.CenterColor = $glowA
    $glowBrush.SurroundColors = @($glowB)
    $graphics.FillEllipse($glowBrush, $glowRect)
  } catch {
    # Si el glow falla por recursos, se omite.
  }

  # Pizarra.
  $boardRect = New-Object System.Drawing.RectangleF 62, 92, 140, 110
  $boardRadius = 22
  $boardPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $boardPath.AddArc($boardRect.X, $boardRect.Y, $boardRadius, $boardRadius, 180, 90) | Out-Null
  $boardPath.AddArc($boardRect.Right - $boardRadius, $boardRect.Y, $boardRadius, $boardRadius, 270, 90) | Out-Null
  $boardPath.AddArc($boardRect.Right - $boardRadius, $boardRect.Bottom - $boardRadius, $boardRadius, $boardRadius, 0, 90) | Out-Null
  $boardPath.AddArc($boardRect.X, $boardRect.Bottom - $boardRadius, $boardRadius, $boardRadius, 90, 90) | Out-Null
  $boardPath.CloseFigure() | Out-Null

  $boardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(236, 255, 255, 255))
  $graphics.FillPath($boardBrush, $boardPath)
  $boardPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170, 226, 232, 240), 3)
  $graphics.DrawPath($boardPen, $boardPath)

  # Mortero (birrete).
  $capFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 11, 58, 107))
  $capShadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 15, 23, 42))
  $cap = New-Object System.Drawing.PointF[] 4
  $cap[0] = New-Object System.Drawing.PointF 88, 84
  $cap[1] = New-Object System.Drawing.PointF 132, 64
  $cap[2] = New-Object System.Drawing.PointF 176, 84
  $cap[3] = New-Object System.Drawing.PointF 132, 104
  $graphics.FillPolygon($capShadow, @(
    (New-Object System.Drawing.PointF 90, 86),
    (New-Object System.Drawing.PointF 132, 68),
    (New-Object System.Drawing.PointF 174, 86),
    (New-Object System.Drawing.PointF 132, 106)
  ))
  $graphics.FillPolygon($capFill, $cap)
  $capBandRect = New-Object System.Drawing.RectangleF 104, 102, 56, 16
  $capBandBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 29, 111, 184))
  $graphics.FillRectangle($capBandBrush, $capBandRect)

  # Circuitos (líneas + nodos) en acento.
  $cPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(210, $accent.R, $accent.G, $accent.B), 6)
  $cPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $cPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($cPen, 90, 140, 120, 140)
  $graphics.DrawLine($cPen, 120, 140, 120, 170)
  $graphics.DrawLine($cPen, 120, 170, 170, 170)
  $nodeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, $accent.R, $accent.G, $accent.B))
  $graphics.FillEllipse($nodeBrush, 84, 134, 12, 12)
  $graphics.FillEllipse($nodeBrush, 114, 134, 12, 12)
  $graphics.FillEllipse($nodeBrush, 114, 164, 12, 12)
  $graphics.FillEllipse($nodeBrush, 164, 164, 12, 12)

  # Tiza/indicador.
  $chalkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(160, 148, 163, 184), 6)
  $chalkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $chalkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($chalkPen, 90, 118, 160, 118)

  # Etiqueta DEV/PROD.
  $font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 34, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = "Center"
  $format.LineAlignment = "Center"
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
  $labelRect = New-Object System.Drawing.RectangleF 0, 202, $size, 52
  $graphics.DrawString($label, $font, $textBrush, $labelRect, $format)

  # Guardar .ico.
  $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
  $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Create)
  $icon.Save($stream)
  $stream.Close()

  # Cleanup.
  $icon.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
  $brushBg.Dispose()
  $pathRound.Dispose()
  $penSoft.Dispose()
  if ($tmpGlowPath) { $tmpGlowPath.Dispose() }
  if ($glowBrush) { $glowBrush.Dispose() }
  $boardBrush.Dispose()
  $boardPen.Dispose()
  $boardPath.Dispose()
  $capFill.Dispose()
  $capShadow.Dispose()
  $capBandBrush.Dispose()
  $cPen.Dispose()
  $nodeBrush.Dispose()
  $chalkPen.Dispose()
  $font.Dispose()
  $textBrush.Dispose()
  $format.Dispose()
}

New-DashboardIcon $iconDev "DEV" "#0b3a6b" "#2563eb" "#22c55e"
New-DashboardIcon $iconProd "PROD" "#14532d" "#16a34a" "#22c55e"

$wsh = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$name, [string]$mode, [string]$iconPath) {
  $lnkPath = Join-Path $outPath ($name + ".lnk")
  $shortcut = $wsh.CreateShortcut($lnkPath)
  $shortcut.TargetPath = $target
  # Solo 2 accesos directos: Dev y Prod. Ambos lanzan el ícono en bandeja.
  $shortcut.Arguments = "//nologo `"scripts\launcher-tray-hidden.vbs`" $mode 4519"
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = "Bandeja (tray) $name"
  $shortcut.IconLocation = $iconPath
  $shortcut.Save()
}

New-Shortcut "Sistema Evaluacion - Dev" "dev" $iconDev
New-Shortcut "Sistema Evaluacion - Prod" "prod" $iconProd

Write-Host "Accesos directos creados en: $outPath"
