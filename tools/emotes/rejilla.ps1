param([string]$Dir,[string]$Out,[int]$Cols=12,[int]$S=110)
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem $Dir -Filter *.png | Sort-Object Name
$rows=[math]::Ceiling($files.Count/$Cols); $sheet = New-Object System.Drawing.Bitmap ($S*$Cols),(($S+14)*$rows)
$g=[System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::FromArgb(70,70,80))
$i=0; foreach($f in $files){ $img=[System.Drawing.Image]::FromFile($f.FullName); $x=($i%$Cols)*$S; $y=[math]::Floor($i/$Cols)*($S+14)
 $g.DrawImage($img,$x+5,$y+14,$S-10,$S-10); $g.DrawString($f.BaseName.Substring(0,[math]::Min(18,$f.BaseName.Length)),(New-Object System.Drawing.Font "Arial",7),[System.Drawing.Brushes]::White,$x+1,$y); $img.Dispose(); $i++ }
$sheet.Save($Out)
