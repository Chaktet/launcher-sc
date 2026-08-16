#!/bin/bash
# Despliega la ruta directa en OVH-A: certificado + vhost :443.
#
#   bash tools/desplegar-ruta-directa.sh
#
# REQUISITO PREVIO, y no se puede automatizar desde aqui: el registro DNS
#   directo.servidorcobblemon.es  A  51.79.83.226   con la nube de Cloudflare
#   DESACTIVADA (gris). Si esta naranja, el trafico vuelve a pasar por Cloudflare
#   y todo esto no sirve de nada.
#
# Este script:
#   - Comprueba el DNS ANTES de tocar nada y aborta si no cuadra.
#   - Usa `certbot certonly --webroot`, NO `--apache`: asi certbot no reescribe
#     ningun vhost existente. packs.conf es el default server de *:80 y de el
#     depende que descargas.servidorcobblemon.es siga sirviendo — no se toca.
#   - Valida la configuracion con `configtest` antes de aplicarla.
#   - Hace `reload` (graceful), NUNCA `restart`: no corta descargas en curso y
#     no afecta a Velocity, al Lobby ni a Hoenn, que viven en esta misma maquina.
set -euo pipefail

HOST=directo.servidorcobblemon.es
ORIGEN=51.79.83.226
RAIZ=/var/www/packs
VHOST=/etc/apache2/sites-available/directo.conf

paso(){ echo; echo "== $* =="; }

paso "1/7 · comprobando el DNS"
IP=$(getent hosts "$HOST" | awk '{print $1}' | head -1 || true)
if [ -z "$IP" ]; then
    echo "  ABORTADO: $HOST no resuelve. Crea el registro DNS primero."
    exit 1
fi
echo "  $HOST -> $IP"
if [ "$IP" != "$ORIGEN" ]; then
    echo "  ABORTADO: deberia apuntar a $ORIGEN."
    echo "  Si resuelve a IPs de Cloudflare (104.x / 172.x), la nube esta NARANJA."
    echo "  Ponla GRIS en el panel de Cloudflare y vuelve a lanzarlo."
    exit 1
fi

paso "2/7 · copia de seguridad de la configuracion"
sudo tar czf "/root/apache2-antes-directo-$(date +%Y%m%d-%H%M).tgz" /etc/apache2 2>/dev/null
echo "  guardada en /root/"

paso "3/7 · certificado (validacion por webroot, sin tocar vhosts)"
if [ -d "/etc/letsencrypt/live/$HOST" ]; then
    echo "  ya existe, no se pide otro"
else
    sudo certbot certonly --webroot -w "$RAIZ" -d "$HOST" \
        --non-interactive --agree-tos --register-unsafely-without-email
fi
sudo test -f "/etc/letsencrypt/live/$HOST/fullchain.pem" || { echo "  ABORTADO: no hay certificado"; exit 1; }
echo "  certificado listo"

paso "4/7 · habilitando modulos"
sudo a2enmod ssl headers >/dev/null
echo "  ssl y headers habilitados"

paso "5/7 · instalando el vhost"
sudo cp /tmp/directo-vhost.conf "$VHOST"
sudo a2ensite directo.conf >/dev/null
echo "  $VHOST instalado y habilitado"

paso "6/7 · validando la configuracion ANTES de aplicarla"
if ! sudo apache2ctl configtest 2>&1 | tee /tmp/configtest.out | grep -q "Syntax OK"; then
    echo "  ABORTADO: la configuracion no valida. Deshaciendo."
    cat /tmp/configtest.out
    sudo a2dissite directo.conf >/dev/null
    exit 1
fi
echo "  Syntax OK"

paso "7/7 · recarga graceful"
sudo systemctl reload apache2
sleep 2
echo "  escuchando ahora:"
sudo ss -lnt | awk '/:80 |:443 /{print "    "$4}'

paso "comprobacion final"
echo "  por la ruta directa:"
curl -sI "https://$HOST/launcher/distribution.json" | head -1 | sed 's/^/    /'
echo "  por la ruta normal (debe seguir igual):"
curl -sI "https://descargas.servidorcobblemon.es/launcher/distribution.json" | head -1 | sed 's/^/    /'
echo
echo "Si algo saliera mal:"
echo "  sudo a2dissite directo.conf && sudo systemctl reload apache2"
echo "  (o restaurar /root/apache2-antes-directo-*.tgz)"
