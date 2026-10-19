#!/bin/bash
# Publishes config/lithium.properties in the three launcher profiles (prepara.js on the LIVE manifest).
# Refuses if the manifest changed while it worked. Usage: bash publica.sh
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
K=/c/Users/Chaktet/.ssh/servers-mc/id_ed25519
PROXY="ssh -i $K -o BatchMode=yes -o StrictHostKeyChecking=no -W %h:%p ubuntu@15.235.13.90"
ovh() { ssh -i "$K" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=no -o ProxyCommand="$PROXY" ubuntu@100.101.9.93 "$@"; }
L=/var/www/packs/launcher
FECHA=$(date -u +%Y%m%d-%H%M%S)
F=$D/lithium.properties
MF=$(md5sum < "$F" | cut -d' ' -f1)

M0=$(ovh "md5sum < $L/distribution.json" | cut -d' ' -f1)
ovh "cat $L/distribution.json" > "$T/pub.json"
[ "$(md5sum < "$T/pub.json" | cut -d' ' -f1)" = "$M0" ] || { echo "descarga incompleta"; exit 1; }
node "$D/prepara.js" "$(cygpath -w "$T/pub.json")" "$(cygpath -w "$T/nuevo.json")"
NUEVO=$(md5sum < "$T/nuevo.json" | cut -d' ' -f1)

# 1. the file in the PRO and LITE config folders (SUPER LITE uses the LITE one), owner copied from immediatelyfast.json
ovh "cat > /tmp/lithium.properties.$MF" < "$F"
for P in ServidorCobblemon-1.21.1 ServidorCobblemonLite-1.21.1; do
  R=$L/servers/$P/files/config
  ovh "set -e; [ \"\$(md5sum < /tmp/lithium.properties.$MF | cut -d' ' -f1)\" = $MF ]
       sudo install -m 644 --owner=\$(stat -c %U $R/immediatelyfast.json) --group=\$(stat -c %G $R/immediatelyfast.json) /tmp/lithium.properties.$MF $R/lithium.properties
       md5sum $R/lithium.properties"
done

# 2. manifest, with a backup and a check that nobody published in between
ovh "cat > /tmp/distribution.lithium.json" < "$T/nuevo.json"
ovh "set -e; [ \"\$(md5sum < $L/distribution.json | cut -d' ' -f1)\" = $M0 ] || { echo 'EL MANIFIESTO CAMBIÓ: no publico'; exit 1; }
     [ \"\$(md5sum < /tmp/distribution.lithium.json | cut -d' ' -f1)\" = $NUEVO ]
     python3 -m json.tool /tmp/distribution.lithium.json > /dev/null
     sudo mkdir -p $L/_backup-lithium-$FECHA && sudo cp -p $L/distribution.json $L/_backup-lithium-$FECHA/
     sudo cp /tmp/distribution.lithium.json $L/distribution.json.nuevo && sudo chown --reference=$L/distribution.json $L/distribution.json.nuevo \
       && sudo chmod --reference=$L/distribution.json $L/distribution.json.nuevo && sudo mv -f $L/distribution.json.nuevo $L/distribution.json
     rm -f /tmp/lithium.properties.$MF /tmp/distribution.lithium.json; md5sum $L/distribution.json"
echo "copia del manifiesto anterior: $L/_backup-lithium-$FECHA/"

# 3. verify through Cloudflare (what players get)
for i in 1 2 3 4 5 6; do
  C=$(curl -fsS "https://descargas.servidorcobblemon.es/launcher/distribution.json?nc=$RANDOM" | md5sum | cut -d' ' -f1)
  [ "$C" = "$NUEVO" ] && break; sleep 10
done
[ "$C" = "$NUEVO" ] && echo "manifiesto por Cloudflare OK ($NUEVO)" || echo "AVISO: Cloudflare aún da $C (esperado $NUEVO)"
for P in ServidorCobblemon-1.21.1 ServidorCobblemonLite-1.21.1; do
  U="https://descargas.servidorcobblemon.es/launcher/servers/$P/files/config/lithium.properties"
  G=$(curl -fsS "$U?nc=$RANDOM" | md5sum | cut -d' ' -f1)
  echo "$P: $(curl -sI "$U?nc=$RANDOM" | grep -i '^content-length' | tr -d '\r') (esperado $(stat -c %s "$F")), md5 $G (esperado $MF)"
done
rm -rf "$T"
