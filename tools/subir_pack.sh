#!/bin/bash
# Sube el SC-Pack 2.1.1 a los dos perfiles.
# El zip es identico en ambos, asi que se sube UNA vez (143 MB en vez de 287)
# y se copia en el propio servidor.
# Solo ficheros estaticos: no reinicia nada ni desconecta a nadie.
set -e

K=/c/Users/Chaktet/.ssh/servers-mc/id_ed25519
PROXY="ssh -i $K -o BatchMode=yes -o StrictHostKeyChecking=no -W %h:%p ubuntu@15.235.13.90"
REMOTO=ubuntu@100.101.9.93
DEST=/var/www/packs/launcher
PRO=$DEST/servers/ServidorCobblemon-1.21.1/files/resourcepacks/SC-Pack.zip
LITE=$DEST/servers/ServidorCobblemonLite-1.21.1/files/resourcepacks/SC-Pack.zip

conectar() {
    ssh -i "$K" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=no \
        -o ProxyCommand="$PROXY" "$REMOTO" "$@"
}

cd /e/PROYECTOS-MC/sc-distribution
LOCAL=servers/ServidorCobblemon-1.21.1/files/resourcepacks/SC-Pack.zip
ESPERADO=$(md5sum "$LOCAL" | cut -d' ' -f1)
echo "md5 local: $ESPERADO  ($(stat -c%s "$LOCAL") bytes)"

echo
echo "== estado remoto antes =="
conectar "md5sum $PRO $LITE 2>&1 | cut -c1-40"

echo
echo "== subiendo el zip una sola vez (143 MB) =="
cat "$LOCAL" | conectar "cat > /home/ubuntu/SC-Pack-nuevo.zip && md5sum /home/ubuntu/SC-Pack-nuevo.zip | cut -d' ' -f1"

echo
echo "== colocandolo en los dos perfiles =="
conectar "sudo cp /home/ubuntu/SC-Pack-nuevo.zip $PRO && sudo cp /home/ubuntu/SC-Pack-nuevo.zip $LITE && rm /home/ubuntu/SC-Pack-nuevo.zip && echo colocado"

echo
echo "== subiendo distribution.json =="
tar czf - distribution.json | conectar "cat > /home/ubuntu/d.tgz && sudo tar xzf /home/ubuntu/d.tgz -C $DEST && rm /home/ubuntu/d.tgz && echo ok"

echo
echo "== comprobacion final en el origen =="
conectar "md5sum $PRO $LITE; ls -l $PRO"
echo "esperado: $ESPERADO"
