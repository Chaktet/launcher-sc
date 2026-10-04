import java.io.*; import java.nio.*; import java.nio.file.*; import java.util.*;
import io.github.kosmx.emotes.server.serializer.type.JsonEmoteWrapper;
import io.github.kosmx.emotes.common.network.EmotePacket;
import io.github.kosmx.emotes.common.network.objects.NetData;
import dev.kosmx.playerAnim.core.data.KeyframeAnimation;

// Converts every emote .json in <in> to Emotecraft's own binary format (.emotecraft) in <out>, using the mod's
// reader and writer, then reads each file back and checks the animation is byte-identical on the wire.
public class Binario {
  static byte[] wire(KeyframeAnimation k) throws Exception {
    ByteBuffer b = new EmotePacket.Builder().configureToStreamEmote(k).setSizeLimit(Integer.MAX_VALUE).build().write();
    byte[] a = new byte[b.remaining()]; b.get(a); return a;
  }
  public static void main(String[] a) throws Exception {
    io.github.kosmx.emotes.executor.EmoteInstance.config = new io.github.kosmx.emotes.common.SerializableConfig(); // factory defaults, same as players
    File in = new File(a[0]), out = new File(a[1]); out.mkdirs();
    int ok = 0, bad = 0;
    for (File f : in.listFiles()) {
      if (!f.getName().endsWith(".json")) continue;
      String base = f.getName().substring(0, f.getName().length() - 5);
      try (InputStream s = new FileInputStream(f)) {
        List<KeyframeAnimation> l = new JsonEmoteWrapper().read(s, f.getName());
        if (l.size() != 1) throw new IllegalStateException("emotes in file: " + l.size());
        KeyframeAnimation k = l.get(0);
        ByteBuffer b = new EmotePacket.Builder().configureToSaveEmote(k).setSizeLimit(Integer.MAX_VALUE).build().write();
        byte[] bytes = new byte[b.remaining()]; b.get(bytes);
        File o = new File(out, base + ".emotecraft");
        Files.write(o.toPath(), bytes);
        NetData back = new EmotePacket.Builder().build().read(ByteBuffer.wrap(Files.readAllBytes(o.toPath())));
        if (back == null || back.emoteData == null) throw new IllegalStateException("read back null");
        if (!Arrays.equals(wire(k), wire(back.emoteData))) throw new IllegalStateException("animation differs after round trip");
        for (String key : new String[]{"name", "description", "author"}) if (!Objects.equals(k.extraData.get(key), back.emoteData.extraData.get(key))) throw new IllegalStateException("name/author differ: " + k.extraData + " vs " + back.emoteData.extraData);
        ok++;
      } catch (Throwable t) { bad++; System.out.println("FAIL\t" + f.getName() + "\t" + t); }
    }
    System.out.println("ok " + ok + " fail " + bad);
  }
}
