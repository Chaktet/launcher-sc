param([string]$In, [string]$Out, [int]$Size = 256)
# Green-screen key + tight crop + square nearest-neighbour scale, like Emotecraft's built-in icons.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Icono {
  static bool IsGreen(int r, int g, int b) {
    float max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b));
    if (max < 20) return false;
    float s = (max - min) / max; float h;
    if (max == min) return false;
    if (max == r) h = 60f * (((g - b) / (max - min)) % 6f);
    else if (max == g) h = 60f * (((b - r) / (max - min)) + 2f);
    else h = 60f * (((r - g) / (max - min)) + 4f);
    if (h < 0) h += 360f;
    return h > 65 && h < 140 && s > 0.45f;
  }
  public static Bitmap Run(Bitmap src, int size) {
    int W = src.Width, H = src.Height;
    var data = src.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    int[] px = new int[W * H]; Marshal.Copy(data.Scan0, px, 0, px.Length); src.UnlockBits(data);
    // the game area excludes the window frame: keep only pixels inside the biggest green region rows/cols
    int x0 = W, y0 = H, x1 = -1, y1 = -1;
    bool[] keep = new bool[W * H];
    // limit to the client area (skip 45px title bar and 12px borders)
    for (int y = 48; y < H - 16; y++) for (int x = 16; x < W - 16; x++) {
      int c = px[y * W + x]; int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      if (r < 12 && g < 12 && b < 12) continue;
      if (r > 235 && g > 235 && b > 235) continue;
      if (!IsGreen(r, g, b)) { keep[y * W + x] = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    int bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.Max(bw, bh);
    side = (int)(side * 1.08);
    var outBmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    float scale = (float)size / side;
    int ox = (side - bw) / 2, oy = (side - bh) / 2;
    for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
      int sx = x0 - ox + (int)(x / scale), sy = y0 - oy + (int)(y / scale);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H || !keep[sy * W + sx]) continue;
      outBmp.SetPixel(x, y, Color.FromArgb(px[sy * W + sx]));
    }
    return outBmp;
  }
}
"@
$src = [System.Drawing.Bitmap]::FromFile($In)
$o = [Icono]::Run($src, $Size)
$o.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose(); $o.Dispose()
