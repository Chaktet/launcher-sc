# Reduce una textura ANIMADA de Minecraft manteniendo el numero de fotogramas.
#
# Una animada es una tira vertical: N fotogramas cuadrados de <ancho> px apilados.
# Se escala CADA FOTOGRAMA POR SEPARADO; si se escalara la tira entera de una vez,
# la interpolacion mezclaria el borde inferior de un fotograma con el superior del
# siguiente y saldrian fantasmas en la animacion.
#
# SourceCopy + TileFlipXY: copia el alfa interpolado tal cual en vez de mezclarlo
# contra el fondo (evita halos oscuros en los bordes transparentes).
param(
    [Parameter(Mandatory=$true)][string]$Origen,
    [Parameter(Mandatory=$true)][string]$Destino,
    [Parameter(Mandatory=$true)][int]$AnchoNuevo
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($Origen)
$w = $src.Width; $h = $src.Height

if($h % $w -ne 0){
    $src.Dispose()
    throw "La altura ($h) no es multiplo del ancho ($w): no es una tira de fotogramas cuadrados."
}
$frames = $h / $w
$altoNuevo = $AnchoNuevo * $frames

Write-Output "  origen : $w x $h  ($frames fotogramas de ${w}px)"
Write-Output "  destino: $AnchoNuevo x $altoNuevo  ($frames fotogramas de ${AnchoNuevo}px)"

$dst = New-Object System.Drawing.Bitmap($AnchoNuevo, $altoNuevo, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.CompositingMode   = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$g.CompositingQuality= [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

$attr = New-Object System.Drawing.Imaging.ImageAttributes
$attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)

for($i = 0; $i -lt $frames; $i++){
    $destRect = New-Object System.Drawing.Rectangle(0, ($i * $AnchoNuevo), $AnchoNuevo, $AnchoNuevo)
    $g.DrawImage($src, $destRect, 0, ($i * $w), $w, $w, [System.Drawing.GraphicsUnit]::Pixel, $attr)
}

$g.Dispose()
$attr.Dispose()
$dst.Save($Destino, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
$src.Dispose()

Write-Output ("  escrito: {0:N0} bytes" -f (Get-Item $Destino).Length)
