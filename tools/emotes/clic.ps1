param([int]$ProcessId,[int]$X,[int]$Y)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class C { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }
"@
$h=(Get-Process -Id $ProcessId).MainWindowHandle; $l=[IntPtr](($Y -shl 16) -bor $X)
[C]::PostMessage($h,0x0200,[IntPtr]0,$l)|Out-Null; Start-Sleep -Milliseconds 150
[C]::PostMessage($h,0x0201,[IntPtr]1,$l)|Out-Null; Start-Sleep -Milliseconds 80
[C]::PostMessage($h,0x0202,[IntPtr]0,$l)|Out-Null
