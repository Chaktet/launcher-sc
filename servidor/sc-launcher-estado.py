#!/usr/bin/env python3
"""Live state for the SC Launcher (1.11.0): players per region, upcoming events and an optional notice.

Runs every minute from cron on OVH-A (/etc/cron.d/sc-launcher-estado) and writes
/var/www/packs/launcher/estado.json, served as https://descargas.servidorcobblemon.es/launcher/estado.json
(Cloudflare does not cache .json there: cf-cache-status DYNAMIC).

Read-only on everything it touches:
- players: Minecraft status ping to each region on localhost (the same ping the server list does);
- events: SELECT on SCEventos' table, with the credentials of Kanto's SCEventos config (never printed);
- notice: /etc/sc-launcher/aviso.json, edited by hand when there is maintenance, e.g.
  {"activo": true, "tipo": "mantenimiento", "titulo": "Mantenimiento", "texto": "Kalos vuelve a las 18:00."}
  ("tipo": "mantenimiento" or "info"; "activo": false or deleting the file hides it).

Safe to re-run: a lock skips a run while the previous one is still going, every network step has a
total deadline, and the output is replaced atomically from a unique temporary file.
"""
import fcntl, json, os, socket, struct, subprocess, sys, tempfile, time

import yaml

SALIDA = '/var/www/packs/launcher/estado.json'
CONFIG_EVENTOS = '/home/ubuntu/Kanto/plugins/SCEventos/config.yml'
AVISO = '/etc/sc-launcher/aviso.json'
CERROJO = '/run/sc-launcher-estado.lock'
REGIONES = [('kanto', 'Kanto', 25580), ('kalos', 'Kalos', 25599)]
NOMBRES = {'kanto': 'Kanto', 'kalos': 'Kalos'}
DIAS = 60
PLAZO_PING = 3.0          # seconds for the whole ping of one region
MAX_RESPUESTA = 64 * 1024  # a status reply is a few KB


def varint(n):
    out = b''
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


class Lector:
    """Reads from a socket with one deadline for the whole exchange."""

    def __init__(self, s, plazo):
        self.s, self.fin = s, time.monotonic() + plazo

    def exacto(self, n):
        datos = b''
        while len(datos) < n:
            queda = self.fin - time.monotonic()
            if queda <= 0:
                raise TimeoutError('plazo')
            self.s.settimeout(queda)
            trozo = self.s.recv(n - len(datos))
            if not trozo:
                raise IOError('respuesta cortada')
            datos += trozo
        return datos

    def varint(self):
        n = 0
        for i in range(5):
            b = self.exacto(1)[0]
            n |= (b & 0x7F) << (7 * i)
            if not b & 0x80:
                return n
        raise IOError('varint demasiado largo')


def jugadores(puerto):
    """Online players of a region via the status ping, or None if it does not answer properly."""
    try:
        with socket.create_connection(('127.0.0.1', puerto), timeout=PLAZO_PING) as s:
            host = b'127.0.0.1'
            hs = varint(0) + varint(767) + varint(len(host)) + host + struct.pack('>H', puerto) + varint(1)
            s.sendall(varint(len(hs)) + hs + b'\x01\x00')
            r = Lector(s, PLAZO_PING)
            largo_paquete = r.varint()
            if not 0 < largo_paquete <= MAX_RESPUESTA:
                return None
            paquete = r.exacto(largo_paquete)
            # Packet id (VarInt 0) + string length (VarInt) + UTF-8 JSON, exactly.
            pos, ident = 0, 0
            for i in range(5):
                b = paquete[pos]; pos += 1
                ident |= (b & 0x7F) << (7 * i)
                if not b & 0x80:
                    break
            if ident != 0:
                return None
            largo, desp = 0, 0
            while True:
                b = paquete[pos]; pos += 1
                largo |= (b & 0x7F) << desp
                desp += 7
                if not b & 0x80:
                    break
                if desp > 28:
                    return None
            if pos + largo != len(paquete):
                return None
            online = json.loads(paquete[pos:].decode('utf8'))['players']['online']
            return online if isinstance(online, int) and online >= 0 else None
    except Exception:
        return None


def credenciales():
    """mysql block and table prefix from SCEventos' config.yml."""
    with open(CONFIG_EVENTOS, encoding='utf8') as f:
        cfg = yaml.safe_load(f) or {}
    mysql = cfg.get('mysql') or {}
    return mysql, str(cfg.get('tabla-prefijo', 'evt_'))


def opcion_cnf(valor):
    """Value for a MariaDB option file: quoted, with backslash and quote escaped."""
    v = str(valor).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
    return '"' + v + '"'


def eventos():
    mysql, prefijo = credenciales()
    if not prefijo or not all(c.isalnum() or c == '_' for c in prefijo):
        raise ValueError('prefijo raro')
    ahora = int(time.time() * 1000)
    sql = ("SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', id, 'nombre', nombre, 'descripcion', descripcion,"
           " 'servidor', servidor, 'inicio', inicio, 'fin', fin)), '[]') FROM (SELECT * FROM {p}evento"
           " WHERE cancelado = 0 AND fin > {a} AND inicio < {h} ORDER BY inicio, id LIMIT 60) e").format(
        p=prefijo, a=ahora, h=ahora + DIAS * 86400000)
    # Password through a 0600 defaults file, never on the command line (ps would show it).
    fd, defaults = tempfile.mkstemp(prefix='sc-estado-', suffix='.cnf')
    try:
        with os.fdopen(fd, 'w') as f:
            f.write('[client]\nhost={}\nport={}\nuser={}\npassword={}\n'.format(
                opcion_cnf(mysql.get('host') or '127.0.0.1'), int(mysql.get('port') or 3306),
                opcion_cnf(mysql.get('username') or ''), opcion_cnf(mysql.get('password') or '')))
        r = subprocess.run(['mysql', '--defaults-extra-file=' + defaults, '-N', '-B', '--raw',
                            '--connect-timeout=5', str(mysql.get('database') or 'sccoins'), '-e', sql],
                           capture_output=True, text=True, timeout=15)
    finally:
        os.unlink(defaults)
    if r.returncode != 0:
        raise RuntimeError('consulta de eventos: codigo {}'.format(r.returncode))
    lista = json.loads(r.stdout.strip() or '[]')
    for e in lista:
        e['region'] = NOMBRES.get(e.pop('servidor', ''), '')
    return lista


# Fixed game schedules, read straight from the plugin configs on this host (the source the plugins themselves use),
# so the launcher can never drift from the game. Discord's calendar (SC Guardian, horarios.json) shows the same events.
CONFIG_RAIDS = '/home/ubuntu/AVelocity/plugins/customraidvelocity/config.yml'
# The mod's config (its ConfigLoader), not plugins/CustomCommunityDay/: that one is a stale copy from May (Codex review).
CONFIG_COMMUNITY = '/home/ubuntu/Kanto/config/CustomCommunityMod/config.yml'
DIAS_SEMANA = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
DURACION_RAID_MIN = 30  # same as SC Guardian's Discord events


def offset_min(zona, defecto_horas=0):
    """'GMT-5' / 'UTC+2' / '-5' / '-05:00' -> minutes."""
    if zona is None:
        return int(round(float(defecto_horas) * 60))
    s = str(zona).strip().upper().replace('GMT', '').replace('UTC', '')
    if not s:
        return 0
    signo = -1 if s.startswith('-') else 1
    s = s.lstrip('+-')
    h, _, m = s.partition(':')
    return signo * (int(h) * 60 + int(m or 0))


def hora_min(texto):
    """'6:00PM', '12:00PM', '3:00:PM', '18:00' -> minutes after midnight."""
    s = str(texto).strip().upper().replace(' ', '')
    pm, am = s.endswith('PM'), s.endswith('AM')
    s = s[:-2].rstrip(':') if pm or am else s
    h, _, m = s.partition(':')
    h, m = int(h), int(m or 0)
    if pm and h != 12:
        h += 12
    if am and h == 12:
        h = 0
    return h * 60 + m


def dias_locales(desde_ms, hasta_ms, off):
    """(UTC ms of local midnight, weekday 0 = Monday) for every local day touching the window."""
    dia = 86400000
    d = (desde_ms + off * 60000) // dia * dia
    while d <= hasta_ms + off * 60000:
        yield d - off * 60000, (d // dia + 3) % 7  # 1970-01-01 was a Thursday
        d += dia


def eventos_fijos(ahora):
    """Legendary raids (tier 5, not the hourly ones) and Community Days for the next DIAS days, same shape as eventos()
    plus 'fijo': true. Each config is read on its own: a broken one only drops its own events."""
    desde, hasta = ahora - 86400000, ahora + DIAS * 86400000
    lista = []
    try:
        with open(CONFIG_RAIDS, encoding='utf8') as f:
            cfg = yaml.safe_load(f) or {}
        rh = cfg.get('raid-hours') or {}
        off = offset_min(rh.get('timezone'), cfg.get('zone-offset-hours', 0))
        for medianoche, dow in dias_locales(desde, hasta, off):
            for hueco in ((rh.get('days') or {}).get(DIAS_SEMANA[dow]) or {}).values():
                if not isinstance(hueco, dict) or hueco.get('every-hour') or 5 not in (hueco.get('tier-spawn') or []):
                    continue
                inicio = medianoche + hora_min(hueco.get('hour', '0:00')) * 60000
                fin = inicio + DURACION_RAID_MIN * 60000
                if fin <= ahora or inicio > hasta:
                    continue
                prob = int(hueco.get('chance', 100))
                lista.append({'id': 'raid:%d' % inicio, 'fijo': True, 'inicio': inicio, 'fin': fin,
                              'nombre': 'Raid legendaria' + (' (%d %% de probabilidad)' % prob if prob < 100 else ''),
                              'descripcion': 'Raid de un Pokémon legendario en una región al azar. Únete en el juego con /raid.'
                                             + (' Ese día sale con un %d %% de probabilidad.' % prob if prob < 100 else ''),
                              'region': 'Kanto o Kalos'})
    except Exception as e:
        print('raids fijas:', type(e).__name__, file=sys.stderr)
    try:
        with open(CONFIG_COMMUNITY, encoding='utf8') as f:
            eh = (yaml.safe_load(f) or {}).get('event-hour') or {}
        off = offset_min(eh.get('zone'))
        dias = {DIAS_SEMANA.index(str(d).upper()) for d in (eh.get('days') or []) if str(d).upper() in DIAS_SEMANA}
        for medianoche, dow in dias_locales(desde, hasta, off):
            if dow not in dias:
                continue
            inicio = medianoche + hora_min(eh.get('start')) * 60000
            fin = medianoche + hora_min(eh.get('end')) * 60000
            if fin <= inicio:
                fin += 86400000
            if fin <= ahora or inicio > hasta:
                continue
            lista.append({'id': 'cd:%d' % inicio, 'fijo': True, 'inicio': inicio, 'fin': fin, 'nombre': 'Community Day',
                          'descripcion': 'El Pokémon de la semana aparece en las zonas especiales. La última hora trae el '
                                         'doble de shinys. En el juego: /community',
                          'region': 'Kanto y Kalos'})
    except Exception as e:
        print('community day:', type(e).__name__, file=sys.stderr)
    return sorted(lista, key=lambda e: e['inicio'])


def aviso():
    try:
        with open(AVISO, encoding='utf8') as f:
            a = json.load(f)
        if a.get('activo') and a.get('texto'):
            return {'tipo': str(a.get('tipo', 'info')), 'titulo': str(a.get('titulo', '')), 'texto': str(a['texto'])}
    except Exception:
        pass
    return None


def main():
    cerrojo = open(CERROJO, 'w')
    try:
        fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(0)  # the previous run is still working
    estado = {'version': 1, 'actualizado': int(time.time() * 1000), 'regiones': [], 'eventos': None, 'aviso': aviso()}
    for rid, nombre, puerto in REGIONES:
        n = jugadores(puerto)
        estado['regiones'].append({'id': rid, 'nombre': nombre, 'online': n is not None, 'jugadores': n})
    try:
        estado['eventos'] = eventos()
    except Exception as e:
        # null = "could not read" (the launcher says so), [] = "no events".
        estado['error_eventos'] = type(e).__name__
    # Separate key (1.16.12): launchers before it ignore it, so they do not start sending a Windows notice for the
    # near-daily legendary raids; the new launcher shows them in the calendar and the card without notifying.
    estado['fijos'] = eventos_fijos(estado['actualizado'])
    fd, tmp = tempfile.mkstemp(prefix='.estado-', suffix='.json', dir=os.path.dirname(SALIDA))
    try:
        with os.fdopen(fd, 'w', encoding='utf8') as f:
            json.dump(estado, f, ensure_ascii=False, separators=(',', ':'))
        os.chmod(tmp, 0o644)
        os.replace(tmp, SALIDA)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


if __name__ == '__main__':
    main()
