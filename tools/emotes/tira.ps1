param([string]$Dir,[string]$Out)
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem $Dir -Filter *.png | Sort-Object Name
$s=200; $sheet = New-Object System.Drawing.Bitmap ($s*6),($s*2+40)
$g=[System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::FromArgb(60,60,70)); $g.InterpolationMode='NearestNeighbor'
$i=0; foreach($f in $files){ $img=[System.Drawing.Image]::FromFile($f.FullName); $x=($i%6)*$s; $y=[math]::Floor($i/6)*($s+20)
 $g.DrawImage($img,$x+10,$y+15,$s-20,$s-20); $g.DrawString($f.BaseName,(New-Object System.Drawing.Font "Arial",9),[System.Drawing.Brushes]::White,$x+3,$y); $img.Dispose(); $i++ }
$sheet.Save($Out)
