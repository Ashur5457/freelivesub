# FreeLiveSub icon (B3: two speech bubbles). ASCII only: PowerShell 5.1 reads BOM-less files as ANSI.
# Draw at 512x512 (128-unit design x4), then downscale. 16/32 use the "small" variant: no tail, bigger glyphs, thicker outline.
param([string]$OutDir)
Add-Type -AssemblyName System.Drawing

$green = [System.Drawing.ColorTranslator]::FromHtml('#1D9E75')
$dark  = [System.Drawing.ColorTranslator]::FromHtml('#0F6E56')
$S = 4
$HIRAGANA_A = [string][char]0x3042

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Draw one glyph centered at (cx, cy) in 128-unit coordinates
function Glyph($g, [string]$text, [float]$size, $color, [float]$cx, [float]$cy) {
  $font = New-Object System.Drawing.Font('Yu Gothic', ($size * $S), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush($color)
  $rect = New-Object System.Drawing.RectangleF((($cx - 60) * $S), (($cy - 60) * $S), (120 * $S), (120 * $S))
  $g.DrawString($text, $font, $brush, $rect, $fmt)
}

function Draw([bool]$small) {
  $bmp = New-Object System.Drawing.Bitmap(512, 512)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  # Back bubble (source text)
  $back = RoundRect (4 * $S) (8 * $S) (84 * $S) (68 * $S) (18 * $S)
  $g.FillPath((New-Object System.Drawing.SolidBrush($green)), $back)
  if (-not $small) {
    $tail = [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF((20 * $S), (72 * $S))),
      (New-Object System.Drawing.PointF((14 * $S), (92 * $S))),
      (New-Object System.Drawing.PointF((40 * $S), (74 * $S))))
    $g.FillPolygon((New-Object System.Drawing.SolidBrush($green)), $tail)
  }
  $jaSize = 46
  if ($small) { $jaSize = 54 }
  Glyph $g $HIRAGANA_A $jaSize ([System.Drawing.Color]::White) 46 40

  # Front bubble (translation)
  $front = RoundRect (40 * $S) (52 * $S) (84 * $S) (68 * $S) (18 * $S)
  $g.FillPath([System.Drawing.Brushes]::White, $front)
  $penW = 6
  if ($small) { $penW = 9 }
  $pen = New-Object System.Drawing.Pen($green, ($penW * $S))
  $g.DrawPath($pen, $front)
  $enSize = 46
  if ($small) { $enSize = 54 }
  Glyph $g 'A' $enSize $dark 82 87

  $g.Dispose()
  return $bmp
}

function Save($src, [int]$size, [string]$path) {
  $out = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$big = Draw $false
$small = Draw $true
Save $big 128 (Join-Path $OutDir 'icon128.png')
Save $big 48 (Join-Path $OutDir 'icon48.png')
Save $small 32 (Join-Path $OutDir 'icon32.png')
Save $small 16 (Join-Path $OutDir 'icon16.png')
'ok'
