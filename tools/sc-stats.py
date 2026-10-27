#!/usr/bin/env python3
"""
Estadisticas del SC Launcher.

Los registros de Apache se borran a los 14 dias, asi que aqui se acumulan los
totales por dia en un fichero propio (historico.json) que nunca pierde datos:
de cada dia se guarda el valor MAS ALTO visto, de modo que cuando el registro
rota, la cifra ya contabilizada permanece.

Se leen DOS caminos, porque desde el 2026-08-16 el launcher tiene dos:
  - packs_access.log*  -> la ruta normal, por Cloudflare (formato `combined`)
  - packs_directo.log* -> la ruta directa, que esquiva Cloudflare cuando los
                          operadores espanoles bloquean sus rangos durante los
                          partidos (formato propio `scdirecto`)
Los dos suman en los totales, y ademas se cuenta aparte cuanta gente esta
teniendo que usar el escape: si ese numero sube, es que el bloqueo esta activo.
"""
import gzip
import json
import os
import re
import glob
from datetime import datetime, timezone, timedelta

LOG_GLOB = '/var/log/apache2/packs_access.log*'
LOG_DIRECTO = '/var/log/apache2/packs_directo.log*'
LOG_CF = '/var/log/apache2/packs_cf.log'
LOG_CF_GLOB = '/var/log/apache2/packs_cf.log*'
LOG_DIRECTO_HOY = '/var/log/apache2/packs_directo.log'
HIST = '/var/www/packs/launcher/historico.json'
OUT = '/var/www/packs/launcher/stats.json'
OUT_MOVIL = '/var/www/packs/movil/stats.json'

CAMPOS = ('exe', 'movil', 'arranques', 'directo', 'unicos')

MESES = {'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
         'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'}

RE_LINEA = re.compile(r'\[(\d{2})/([A-Za-z]{3})/(\d{4}):')

# El estado va justo detras de la peticion entrecomillada. Hay que sacarlo asi y
# no buscando ' 200 ': el formato `combined` lleva el tamano detras del estado,
# pero el de la ruta directa TERMINA en el estado, sin espacio final, y la
# comprobacion con espacios a los dos lados no casaba nunca. Habria contado cero
# en silencio, que es el peor fallo posible en un contador.
RE_ESTADO = re.compile(r'"\s+(\d{3})')


def fecha_de(linea):
    m = RE_LINEA.search(linea)
    if not m:
        return None
    dia, mes, anio = m.group(1), m.group(2), m.group(3)
    if mes not in MESES:
        return None
    return '%s-%s-%s' % (anio, MESES[mes], dia)


def es_200(linea):
    m = RE_ESTADO.search(linea)
    return m is not None and m.group(1) == '200'


def abrir(ruta):
    if ruta.endswith('.gz'):
        return gzip.open(ruta, 'rt', errors='ignore')
    return open(ruta, 'r', errors='ignore')


def vacio():
    return {c: 0 for c in CAMPOS}


def contar():
    """Recuenta por dia lo que haya en los registros disponibles."""
    dias = {}

    def procesar(ruta, por_la_directa):
        try:
            with abrir(ruta) as f:
                for linea in f:
                    if not es_200(linea):
                        continue
                    d = fecha_de(linea)
                    if d is None:
                        continue
                    e = dias.setdefault(d, vacio())
                    if 'GET /SC-Launcher-setup' in linea:
                        e['exe'] += 1
                    elif 'GET /movil/SC-Movil' in linea and '.mrpack' in linea:
                        e['movil'] += 1
                    elif 'GET /launcher/distribution.json' in linea:
                        e['arranques'] += 1
                        # Un arranque servido por la ruta directa es un jugador
                        # al que su operador le esta bloqueando el camino normal.
                        if por_la_directa:
                            e['directo'] += 1
        except Exception:
            return

    for ruta in glob.glob(LOG_GLOB):
        procesar(ruta, False)
    for ruta in glob.glob(LOG_DIRECTO):
        procesar(ruta, True)

    for d, n in contar_unicos().items():
        dias.setdefault(d, vacio())['unicos'] = n

    for d, campos in contar_informes().items():
        dias.setdefault(d, vacio()).update(campos)

    return dias


def contar_unicos():
    """Jugadores distintos por dia, contando IPs SIN GUARDARLAS.

    ⚠ PRIVACIDAD: las IPs viven solo en memoria durante esta funcion y se tiran
    al salir. Al historico va UNICAMENTE el numero. Nunca escribas las IPs a
    disco: son datos personales y el registro de Apache del que salen ya se
    borra solo a los 14 dias.

    Se leen packs_cf.log* y packs_directo.log*, NO packs_access.log: en ese
    ultimo la IP que aparece es la de Cloudflare, no la del jugador — todos
    saldrian como el mismo. El formato `sccf` existe justamente para eso, porque
    guarda la cabecera CF-Connecting-IP con la IP real.

    Una IP no es una persona: dos hermanos en casa son una, y un movil que salta
    de wifi a datos son dos. Sirve para ver tendencias, no como censo.
    """
    por_dia = {}
    for patron in (LOG_CF_GLOB, LOG_DIRECTO):
        for ruta in glob.glob(patron):
            try:
                with abrir(ruta) as f:
                    for linea in f:
                        if 'GET /launcher/distribution.json' not in linea:
                            continue
                        d = fecha_de(linea)
                        if d is None:
                            continue
                        ip = linea.split(' ', 1)[0].strip()
                        if ip:
                            por_dia.setdefault(d, set()).add(ip)
            except Exception:
                continue
    return {d: len(ips) for d, ips in por_dia.items()}


def fusionar(hist, nuevos):
    """Se queda con el valor mas alto de cada dia: al rotar el log no se pierde.
    Ademas de CAMPOS, las claves 'inf_*' de los avisos de error (1.16.12)."""
    for d, v in nuevos.items():
        prev = hist.get(d, {})
        claves = set(CAMPOS) | {k for k in list(prev) + list(v) if k.startswith('inf_') and not k.startswith(CON_TOPE)}
        # Las de recursos (inf_r_<codigo>_<campo>_<valor>) con el mismo tope por dia que contar_informes:
        # primero las ya guardadas y luego las nuevas mientras quepan (revision de Codex).
        por_prefijo = {}
        for k in list(prev) + sorted(set(v) - set(prev)):
            if not k.startswith(CON_TOPE):
                continue
            prefijo = prefijo_de(k)
            n = por_prefijo.setdefault(prefijo, set())
            if k in n or len(n) < MAX_VALORES:
                n.add(k)
        for n in por_prefijo.values():
            claves |= n
        hist[d] = {c: max(prev.get(c, 0), v.get(c, 0)) for c in claves}
    return hist


# Avisos de error anonimos del launcher (1.16.12): GET /launcher/informe.txt?c=SC-04&v=...&p=...&r=...
# Solo se cuentan codigos y versiones con forma conocida; el resto de la query se ignora.
RE_INFORME = re.compile(r'"GET /launcher/informe\.txt\?(\S*) HTTP')
RE_CODIGO = re.compile(r'^SC-\d{2}$')
RE_VERSION = re.compile(r'^\d+\.\d+\.\d+$')
RE_PISTA = re.compile(r'^[A-Za-z0-9._-]{1,60}$')
CODIGOS_RECURSOS = ('SC-91', 'SC-92', 'SC-93')
X_VALIDOS = {'SC-91': ('error', 'apagado', 'falta'), 'SC-92': (), 'SC-93': ('parte', 'modelo', 'pose', 'geo')}
MAX_VALORES = 50
# Pistas de los fallos del launcher (1.16.18), para SC-90 (cierre a media partida) y los codigos de
# arranque: x error del sistema o de Java, m paquete del mod, d lo que falta, y mod del mixin,
# l biblioteca nativa, e codigo de salida, h estado HTTP, t tipo de fallo de descarga, z cuantos mods
# propios activos tiene el jugador (solo el numero); desde la version siguiente a la 1.17.2, k clase fija del fallo de descarga
# (bloqueado, hash, http...) y n nombre del error; desde la 1.17.5 tambien en SC-03 (n = EPERM, ENOENT...). Mismas reglas que las de recursos: identificadores
# ya saneados y como mucho MAX_VALORES por codigo, campo y dia.
# Desde la 1.17.9: a procesador real (x64, arm64), s compilacion de Windows, g marca de la grafica
# (SC-06/12/13/90), q antivirus como clase fija (SC-14, SC-19), f que dejo el juego al morir y
# u minutos jugados en tramos (SC-90). SC-19 = archivos borrados entre partidas (n cuantos, t que).
CAMPOS_PISTA = ('x', 'm', 'd', 'y', 'l', 'e', 'h', 't', 'z', 'k', 'n', 'a', 's', 'g', 'q', 'f', 'u')
# Claves con tope de valores por prefijo: recursos (inf_r_), pistas (inf_p_) y, desde el 20-10, tambien
# versiones (inf_v_) y las de SC-90 de la 1.16.12 (inf_m_, inf_x_): antes, variando v, m o x en una query
# hecha a mano se creaban claves sin limite que fusionar() guardaba para siempre (revision de Codex).
CON_TOPE = ('inf_r_', 'inf_p_', 'inf_v_', 'inf_m_', 'inf_x_')
# Origen del recurso roto (mod SC Avisos Cliente 1.1.0): que clase de pack lo sirve, nunca su nombre.
O_VALIDOS = ('sc', 'sc-viejo', 'otro', 'mod', 'juego', 'nada')


def prefijo_de(k):
    """Grupo al que se aplica el tope: inf_r_SC-93_m, inf_p_SC-90_d, inf_v_ ..."""
    if k.startswith(('inf_r_', 'inf_p_')):
        return '_'.join(k.split('_', 4)[:4])
    return k[:6]


def anadir(s, clave, ip):
    """Cuenta ip en clave salvo que su grupo ya tenga MAX_VALORES valores distintos ese dia."""
    if clave not in s and clave.startswith(CON_TOPE):
        prefijo = prefijo_de(clave)
        if sum(1 for k in s if k.startswith(prefijo)) >= MAX_VALORES:
            return
    s.setdefault(clave, set()).add(ip)
RE_MOMENTO = re.compile(r'\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2}) ([+-]\d{4})\]')


def _query(linea):
    m = RE_INFORME.search(linea)
    if not m:
        return None
    q = {}
    for par in m.group(1).split('&'):
        k, _, v = par.partition('=')
        q[k] = v
    # SC-99 es el codigo de las pruebas a mano: no cuenta.
    if not RE_CODIGO.match(q.get('c', '')) or q.get('c') == 'SC-99':
        return None
    return q


def contar_informes():
    """Jugadores DISTINTOS con cada codigo de error, por dia.

    ⚠ Igual que contar_unicos: las IP viven solo en memoria y al historico va el
    numero. Se leen packs_cf.log* (IP real) y packs_directo.log*; packs_access.log
    repetiria las peticiones de Cloudflare con la IP de Cloudflare.
    Devuelve {dia: {'inf_total': n, 'inf_SC-04': n, 'inf_directa': n, 'inf_v_1.16.12': n}}.
    """
    por_dia = {}
    for patron in (LOG_CF_GLOB, LOG_DIRECTO):
        for ruta in glob.glob(patron):
            try:
                with abrir(ruta) as f:
                    for linea in f:
                        if 'informe.txt' not in linea:
                            continue
                        q = _query(linea)
                        d = fecha_de(linea)
                        if q is None or d is None:
                            continue
                        ip = linea.split(' ', 1)[0].strip()
                        s = por_dia.setdefault(d, {})
                        s.setdefault('inf_total', set()).add(ip)
                        s.setdefault('inf_' + q['c'], set()).add(ip)
                        if q.get('r') == 'directa':
                            s.setdefault('inf_directa', set()).add(ip)
                        if RE_VERSION.match(q.get('v', '')):
                            anadir(s, 'inf_v_' + q['v'], ip)
                        # SC-90 = cierre con error a media partida: paquete del mod sospechoso
                        # (m) y tipo de excepcion (x), ya saneados por el launcher.
                        if q['c'] == 'SC-90':
                            for campo in ('m', 'x'):
                                if RE_PISTA.match(q.get(campo, '')):
                                    anadir(s, 'inf_%s_%s' % (campo, q[campo]), ip)
                        # SC-91/92/93 = recursos rotos vistos DENTRO del juego por el mod SC Avisos
                        # Cliente (1.16.13): que (x), cual (m) y la primera textura (t), ya saneados.
                        # Clave propia por codigo para no mezclarlas con las de SC-90.
                        # La query la puede escribir cualquiera (revision de Codex): x solo con los valores
                        # que existen y como mucho MAX_VALORES valores distintos de m/t por codigo y dia,
                        # para que nadie llene el historico de claves inventadas.
                        if q['c'] not in CODIGOS_RECURSOS:
                            for campo in CAMPOS_PISTA:
                                val = q.get(campo, '')
                                if not RE_PISTA.match(val):
                                    continue
                                anadir(s, 'inf_p_%s_%s_%s' % (q['c'], campo, val), ip)
                        if q['c'] in CODIGOS_RECURSOS:
                            for campo in ('m', 'x', 't', 'o'):
                                val = q.get(campo, '')
                                if not RE_PISTA.match(val):
                                    continue
                                if campo == 'x' and val not in X_VALIDOS[q['c']]:
                                    continue
                                if campo == 'o' and val not in O_VALIDOS:
                                    continue
                                anadir(s, 'inf_r_%s_%s_%s' % (q['c'], campo, val), ip)
            except Exception:
                continue
    return {d: {k: len(v) for k, v in s.items()} for d, s in por_dia.items()}


def informes_ultima_hora():
    """Jugadores distintos por codigo en los ultimos 60 minutos: lo que vigila la
    alerta de Discord (mc-monitor en Hetzner). Mismas reglas para las IP."""
    limite = datetime.now(timezone.utc) - timedelta(hours=1)
    por_codigo = {}
    # Tambien el .1: justo despues de rotar, la ultima hora esta repartida entre los dos
    # (revision de Codex). El filtro de hora deja fuera lo viejo del .1.
    for ruta in (LOG_CF, LOG_CF + '.1', LOG_DIRECTO_HOY, LOG_DIRECTO_HOY + '.1'):
        try:
            with open(ruta, 'r', errors='ignore') as f:
                for linea in f:
                    if 'informe.txt' not in linea:
                        continue
                    q = _query(linea)
                    m = RE_MOMENTO.search(linea)
                    if q is None or not m:
                        continue
                    try:
                        cuando = datetime.strptime(m.group(1) + ' ' + m.group(2), '%d/%b/%Y:%H:%M:%S %z')
                    except ValueError:
                        continue
                    if cuando >= limite:
                        por_codigo.setdefault(q['c'], set()).add(linea.split(' ', 1)[0])
        except Exception:
            continue
    return {c: len(ips) for c, ips in sorted(por_codigo.items())}


def informes_de(dia, prefijo):
    """{'SC-04': 3} o {'1.16.12': 2} a partir de las claves inf_* de un dia."""
    corte = len('inf_') if prefijo == 'inf_SC-' else len(prefijo)
    return {k[corte:]: v for k, v in sorted(dia.items()) if k.startswith(prefijo)}


def recursos_de(dia, prefijo='inf_r_'):
    """{'SC-93': {'m': {'wartortle': 4}, 'x': {'parte': 4}}} a partir de las claves inf_r_* de un dia.
    Con prefijo='inf_p_', lo mismo para las pistas de los fallos del launcher (cualquier codigo)."""
    out = {}
    for k, v in sorted(dia.items()):
        if not k.startswith(prefijo):
            continue
        partes = k[len(prefijo):].split('_', 2)
        if len(partes) == 3 and (prefijo != 'inf_r_' or partes[0] in CODIGOS_RECURSOS):
            out.setdefault(partes[0], {}).setdefault(partes[1], {})[partes[2]] = v
    return out


def launchers_activos():
    """IPs distintas que han pedido la distribucion en las ultimas 2 horas.

    Cuenta las dos rutas: quien entra por la directa esta igual de activo, y
    dejarlo fuera haria que el contador BAJARA justo cuando hay bloqueo, que es
    cuando mas interesa mirarlo.
    """
    ahora = datetime.now(timezone.utc)
    horas = {(ahora - timedelta(hours=h)).strftime('%d/%b/%Y:%H') for h in (0, 1)}
    ips = set()
    for ruta in (LOG_CF, LOG_DIRECTO_HOY):
        try:
            with open(ruta, 'r', errors='ignore') as f:
                for linea in f:
                    if 'GET /launcher/distribution.json' not in linea:
                        continue
                    if not any(h in linea for h in horas):
                        continue
                    ips.add(linea.split(' ', 1)[0])
        except Exception:
            continue
    return len(ips)


def main():
    hist = {}
    if os.path.exists(HIST):
        try:
            with open(HIST) as f:
                hist = json.load(f)
        except Exception:
            hist = {}

    hist = fusionar(hist, contar())

    os.makedirs(os.path.dirname(HIST), exist_ok=True)
    with open(HIST, 'w') as f:
        json.dump(hist, f, sort_keys=True)

    hoy = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    limite_mes = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
    limite_sem = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')

    def suma(campo, desde=None):
        return sum(v.get(campo, 0) for d, v in hist.items() if desde is None or d > desde)

    serie = []
    for i in range(29, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime('%Y-%m-%d')
        v = hist.get(d, {})
        serie.append({
            'd': d,
            'exe': v.get('exe', 0),
            'movil': v.get('movil', 0),
            'directo': v.get('directo', 0),
            'unicos': v.get('unicos', 0),
        })

    # Media de los 7 dias ANTERIORES a hoy: incluir el dia en curso la hunde,
    # porque va a medias.
    ult7 = [hist.get((datetime.now(timezone.utc) - timedelta(days=i)).strftime('%Y-%m-%d'), {}).get('unicos', 0)
            for i in range(1, 8)]
    ayer = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')

    datos = {
        'generado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'desde': min(hist.keys()) if hist else hoy,
        'instalador': {
            'total': suma('exe'),
            'mes': suma('exe', limite_mes),
            'semana': suma('exe', limite_sem),
            'hoy': hist.get(hoy, {}).get('exe', 0),
        },
        'movil': {
            'total': suma('movil'),
            'mes': suma('movil', limite_mes),
            'hoy': hist.get(hoy, {}).get('movil', 0),
        },
        'arranques': {
            'total': suma('arranques'),
            'mes': suma('arranques', limite_mes),
            'hoy': hist.get(hoy, {}).get('arranques', 0),
        },
        # Arranques servidos por la ruta directa: cuanta gente esta esquivando
        # el bloqueo. Si 'hoy' se dispara, es que hay bloqueo activo.
        'directo': {
            'total': suma('directo'),
            'mes': suma('directo', limite_mes),
            'semana': suma('directo', limite_sem),
            'hoy': hist.get(hoy, {}).get('directo', 0),
        },
        # Jugadores distintos por dia. NO se da un "total": sumar unicos diarios
        # no significa nada, porque la misma persona cuenta una vez por cada dia
        # que juega. Lo comparable es dia contra dia y contra la media.
        'unicos': {
            'hoy': hist.get(hoy, {}).get('unicos', 0),
            'ayer': hist.get(ayer, {}).get('unicos', 0),
            'media7': round(sum(ult7) / 7, 1),
            'maximo': max((v.get('unicos', 0) for v in hist.values()), default=0),
        },
        'activos_2h': launchers_activos(),
        # Avisos de error del launcher (1.16.12): jugadores distintos por codigo.
        # 'ultima_hora' es lo que vigila la alerta de Discord; 'versiones_hoy'
        # delata una version nueva que falla.
        'informes': {
            'hoy': informes_de(hist.get(hoy, {}), 'inf_SC-'),
            'ayer': informes_de(hist.get(ayer, {}), 'inf_SC-'),
            'versiones_hoy': informes_de(hist.get(hoy, {}), 'inf_v_'),
            'directa_hoy': hist.get(hoy, {}).get('inf_directa', 0),
            'total_hoy': hist.get(hoy, {}).get('inf_total', 0),
            'ultima_hora': informes_ultima_hora(),
            # Crasheos a media partida (SC-90) de hoy: mods sospechosos y excepciones.
            'crash_mods_hoy': informes_de(hist.get(hoy, {}), 'inf_m_'),
            'crash_excepciones_hoy': informes_de(hist.get(hoy, {}), 'inf_x_'),
            # Recursos rotos dentro del juego (SC-91/92/93, mod SC Avisos Cliente) de hoy:
            # por codigo, jugadores distintos por cada valor de x, m y t.
            'recursos_hoy': recursos_de(hist.get(hoy, {})),
            # Pistas de cada fallo (1.16.18, ver CAMPOS_PISTA), hoy y ayer.
            'pistas_hoy': recursos_de(hist.get(hoy, {}), 'inf_p_'),
            'pistas_ayer': recursos_de(hist.get(ayer, {}), 'inf_p_'),
            # 30 dias de jugadores distintos por codigo, para ver si un arreglo hace bajar un fallo.
            'serie': [dict(d=s['d'], **informes_de(hist.get(s['d'], {}), 'inf_SC-')) for s in serie],
        },
        'serie': serie,
    }

    with open(OUT, 'w') as f:
        json.dump(datos, f)

    os.makedirs(os.path.dirname(OUT_MOVIL), exist_ok=True)
    with open(OUT_MOVIL, 'w') as f:
        json.dump({
            'generado': datos['generado'],
            'total': datos['movil']['total'],
            'mes': datos['movil']['mes'],
            'hoy': datos['movil']['hoy'],
        }, f)


if __name__ == '__main__':
    main()
