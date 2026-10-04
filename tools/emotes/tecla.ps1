param([int]$ProcessId, [int]$Vk, [int]$HoldMs = 100)
# Posts a key down/up to the process window (works while it is behind other windows).
Add-Type @"
using System; using System.Runtime.InteropServices;
public class K {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);
}
"@
$h = (Get-Process -Id $ProcessId).MainWindowHandle
$sc = [K]::MapVirtualKey($Vk, 0)
[K]::PostMessage($h, 0x0100, [IntPtr]$Vk, [IntPtr](1 -bor ($sc -shl 16))) | Out-Null
Start-Sleep -Milliseconds $HoldMs
[K]::PostMessage($h, 0x0101, [IntPtr]$Vk, [IntPtr](1 -bor ($sc -shl 16) -bor (3 -shl 30))) | Out-Null
