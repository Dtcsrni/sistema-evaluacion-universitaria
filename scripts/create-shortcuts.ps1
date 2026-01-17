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
  # ICO con imágenes PNG embebidas (nítido en múltiples escalas).
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
    # ICONDIR
    $bw.Write([uint16]0) # reserved
    $bw.Write([uint16]1) # type = icon
    $bw.Write([uint16]$count)

    # ICONDIRENTRY
    for ($i = 0; $i -lt $pngImages.Count; $i++) {
      $size = [int]$sizes[$i]
      $png = $pngImages[$i]
      $w = if ($size -ge 256) { 0 } else { [byte]$size }
      $h = if ($size -ge 256) { 0 } else { [byte]$size }
      $bw.Write($w)
      $bw.Write($h)
      $bw.Write([byte]0) # color count
      $bw.Write([byte]0) # reserved
      $bw.Write([uint16]1) # planes
      $bw.Write([uint16]32) # bitcount
      $bw.Write([uint32]$png.Length) # bytes in res
      $bw.Write([uint32]$offset) # image offset
      $offset += $png.Length
    }

    # Image data
    for ($i = 0; $i -lt $pngImages.Count; $i++) {
      $bw.Write($pngImages[$i])
    }
  } finally {
    $bw.Flush()
    $bw.Dispose()
    $fs.Dispose()
  }
}

function New-ModernDashboardBitmap([int]$size, [string]$label, [string]$bgHexA, [string]$bgHexB, [string]$accentHex) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $bgA = [System.Drawing.ColorTranslator]::FromHtml($bgHexA)
  $bgB = [System.Drawing.ColorTranslator]::FromHtml($bgHexB)
  $accent = [System.Drawing.ColorTranslator]::FromHtml($accentHex)
  $ink = [System.Drawing.Color]::FromArgb(238, 255, 255, 255)
  $inkSoft = [System.Drawing.Color]::FromArgb(210, 226, 232, 240)
  $shadow = [System.Drawing.Color]::FromArgb(85, 0, 0, 0)

  $graphics.Clear([System.Drawing.Color]::Transparent)

  $pad = [Math]::Max(2, [int]($size * 0.07))
  $rect = New-Object System.Drawing.RectangleF $pad, $pad, ($size - 2*$pad), ($size - 2*$pad)
  $radius = [Math]::Max(6, [int]($size * 0.22))
  $bgPath = New-RoundedRectPath $rect $radius
  try {
    # Fondo base (oscuro) + glow neón
    $brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $bgA, $bgB, 35)
    $graphics.FillPath($brushBg, $bgPath)

    $glowRect = New-Object System.Drawing.RectangleF ($pad * -0.2), ($pad * -0.1), ($size * 1.1), ($size * 1.0)
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse($glowRect) | Out-Null
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(70, $accent.R, $accent.G, $accent.B)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $accent.R, $accent.G, $accent.B))
    $graphics.FillRectangle($glow, 0, 0, $size, $size)

    # Borde/ring moderno
    $penOuter = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 0, 0, 0), [Math]::Max(1, [int]($size * 0.03)))
    $graphics.DrawPath($penOuter, $bgPath)
    $penRing = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(205, $accent.R, $accent.G, $accent.B), [Math]::Max(2, [int]($size * 0.06)))
    $penRing.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penRing.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawPath($penRing, $bgPath)

    # Highlight "glass" (arco superior)
    $penGlass = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, 255, 255, 255), [Math]::Max(2, [int]($size * 0.10)))
    $penGlass.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penGlass.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcRect = New-Object System.Drawing.RectangleF ($pad + $size * 0.02), ($pad + $size * 0.02), ($size - 2*$pad - $size * 0.04), ($size - 2*$pad - $size * 0.04)
    $graphics.DrawArc($penGlass, $arcRect, 205, 80)

    # Panel central sutil (más "moderno" que una tarjeta blanca sólida)
    $panelPad = [Math]::Max(2, [int]($size * 0.20))
    $panelRect = New-Object System.Drawing.RectangleF ($panelPad), ([int]($size * 0.33)), ($size - 2*$panelPad), ([int]($size * 0.34))
    $panelRadius = [Math]::Max(6, [int]($size * 0.12))
    $panelPath = New-RoundedRectPath $panelRect $panelRadius
    $panelFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, 255, 255, 255))
    $panelBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(65, $accent.R, $accent.G, $accent.B), [Math]::Max(1, [int]($size * 0.012)))
    $graphics.FillPath($panelFill, $panelPath)
    $graphics.DrawPath($panelBorder, $panelPath)

    # Glyph (nodos) — más limpio, contraste alto
    $stroke = [Math]::Max(2, [int]($size * 0.05))
    $node = [Math]::Max(2, [int]($size * 0.07))
    $penWire = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(215, 226, 232, 240), $stroke)
    $penWire.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penWire.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $cx = $size * 0.50
    $cy = $size * 0.50
    $dx = $size * 0.18
    $dy = $size * 0.11
    $p1 = New-Object System.Drawing.PointF ($cx - $dx), ($cy)
    $p2 = New-Object System.Drawing.PointF ($cx), ($cy)
    $p3 = New-Object System.Drawing.PointF ($cx), ($cy + $dy)
    $p4 = New-Object System.Drawing.PointF ($cx + $dx), ($cy + $dy)

    $graphics.DrawLine($penWire, $p1, $p2)
    $graphics.DrawLine($penWire, $p2, $p3)
    $graphics.DrawLine($penWire, $p3, $p4)

    $nodeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, $accent.R, $accent.G, $accent.B))
    $graphics.FillEllipse($nodeBrush, ($p1.X - $node/2), ($p1.Y - $node/2), $node, $node)
    $graphics.FillEllipse($nodeBrush, ($p2.X - $node/2), ($p2.Y - $node/2), $node, $node)
    $graphics.FillEllipse($nodeBrush, ($p3.X - $node/2), ($p3.Y - $node/2), $node, $node)
    $graphics.FillEllipse($nodeBrush, ($p4.X - $node/2), ($p4.Y - $node/2), $node, $node)

    # Badge pequeño (DEV/PROD) en esquina, sin tapar el icono
    if ($size -ge 96) {
      $badgeW = [int]($size * 0.44)
      $badgeH = [int]($size * 0.18)
      $badgeX = [int]($pad)
      $badgeY = [int]($size - $pad - $badgeH)

      $badgeRect = New-Object System.Drawing.RectangleF $badgeX, $badgeY, $badgeW, $badgeH
      $badgePath = New-RoundedRectPath $badgeRect ([Math]::Max(6, [int]($badgeH * 0.45)))

      $badgeFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(130, 0, 0, 0))
      $badgeBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(190, $accent.R, $accent.G, $accent.B), [Math]::Max(1, [int]($size * 0.012)))
      $graphics.FillPath($badgeFill, $badgePath)
      $graphics.DrawPath($badgeBorder, $badgePath)

      $fontSize = [int]([Math]::Max(11, $size * 0.12))
      $font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
      $format = New-Object System.Drawing.StringFormat
      $format.Alignment = "Center"
      $format.LineAlignment = "Center"
      $textBrush = New-Object System.Drawing.SolidBrush $ink
      $graphics.DrawString($label, $font, $textBrush, $badgeRect, $format)

      $textBrush.Dispose(); $format.Dispose(); $font.Dispose(); $badgeBorder.Dispose(); $badgeFill.Dispose(); $badgePath.Dispose()
    } else {
      # Punto de estado esquina para tamaños chicos
      $dot = [Math]::Max(3, [int]($size * 0.16))
      $dotRect = New-Object System.Drawing.RectangleF ($size - $pad - $dot), ($pad), $dot, $dot
      $dotShadow = New-Object System.Drawing.SolidBrush $shadow
      $graphics.FillEllipse($dotShadow, ($dotRect.X + 1), ($dotRect.Y + 1), $dotRect.Width, $dotRect.Height)
      $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, $accent.R, $accent.G, $accent.B))
      $graphics.FillEllipse($dotBrush, $dotRect)
      $dotBrush.Dispose(); $dotShadow.Dispose()
    }

    # Cleanup (local)
    $nodeBrush.Dispose()
    $penWire.Dispose()
    $panelBorder.Dispose()
    $panelFill.Dispose()
    $panelPath.Dispose()
    $penGlass.Dispose()
    $penRing.Dispose()
    $penOuter.Dispose()
    $glow.Dispose()
    $glowPath.Dispose()
    $brushBg.Dispose()
  } finally {
    $bgPath.Dispose()
    $graphics.Dispose()
  }

  return $bitmap
}

function New-DashboardIcon([string]$path, [string]$label, [string]$bgHexA, [string]$bgHexB, [string]$accentHex) {
  if (-not $Force -and (Test-Path $path)) {
    return
  }

  $sizes = @(16, 24, 32, 48, 64, 96, 128, 256)
  $pngs = New-Object "System.Collections.Generic.List[byte[]]"

  foreach ($s in $sizes) {
    $bmp = New-ModernDashboardBitmap $s $label $bgHexA $bgHexB $accentHex
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

# Paleta (oscuro + neón), consistente con los favicons.
New-DashboardIcon $iconDev "DEV" "#02030a" "#0b1220" "#22e8ff"
New-DashboardIcon $iconProd "PROD" "#02030a" "#0b1220" "#35ff93"

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
