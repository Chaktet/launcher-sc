import java.io.*; import java.nio.*; import java.nio.file.*; import java.util.*;
import dev.kosmx.playerAnim.core.data.gson.AnimationSerializing;
import io.github.kosmx.emotes.common.network.EmotePacket;
import dev.kosmx.playerAnim.core.data.KeyframeAnimation;
public class Medir {
  public static void main(String[] a) throws Exception {
    for (File f : new File(a[0]).listFiles()) {
      if (!f.getName().endsWith(".json")) continue;
      try (InputStream in = new FileInputStream(f)) {
        List<KeyframeAnimation> l = AnimationSerializing.deserializeAnimation(in);
        for (KeyframeAnimation k : l) {
          ByteBuffer b = new EmotePacket.Builder().configureToStreamEmote(k).setSizeLimit(Integer.MAX_VALUE).build().write();
          System.out.println(b.remaining() + "\t" + f.getName());
        }
        if (l.isEmpty()) System.out.println("EMPTY\t" + f.getName());
      } catch (Throwable t) { System.out.println("FAIL\t" + f.getName() + "\t" + t); }
    }
  }
}
