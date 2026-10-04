param([string]$Dir, [int]$Size = 128)
# Resizes every icon in $Dir to $Size x $Size (high-quality, keeps alpha), in place.
Add-Type -AssemblyName System.Drawing
foreach ($f in Get-ChildItem $Dir -Filter *.png) {
  $src = [System.Drawing.Image]::FromFile($f.FullName)
  if ($src.Width -le $Size) { $src.Dispose(); continue }
  $dst = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingMode = 'SourceCopy'
  $g.DrawImage($src, 0, 0, $Size, $Size)
  $g.Dispose(); $src.Dispose()
  $tmp = $f.FullName + '.tmp'
  $dst.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); $dst.Dispose()
  Move-Item -Force $tmp $f.FullName
}
