param([int]$ProcessId, [string]$OutDir, [int]$Count = 20, [int]$EverySec = 3)
# Captures only the given process window (PrintWindow, works while the window is behind others).
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
}
"@
New-Item -ItemType Directory -Force $OutDir | Out-Null
[W]::SetProcessDPIAware() | Out-Null
$p = Get-Process -Id $ProcessId
for ($i = 0; $i -lt $Count; $i++) {
  $h = $p.MainWindowHandle
  $r = New-Object W+RECT
  [W]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $dc = $g.GetHdc()
  [W]::PrintWindow($h, $dc, 2) | Out-Null
  $g.ReleaseHdc($dc)
  $bmp.Save((Join-Path $OutDir ("cap{0:D3}.png" -f $i)))
  $g.Dispose(); $bmp.Dispose()
  Start-Sleep -Seconds $EverySec
  $p.Refresh()
}
