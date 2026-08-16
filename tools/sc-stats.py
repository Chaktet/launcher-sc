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
LOG_DIRECTO_HOY = '/var/log/apache2/packs_directo.log'
HIST = '/var/www/packs/launcher/historico.json'
OUT = '/var/www/packs/launcher/stats.json'
OUT_MOVIL = '/var/www/packs/movil/stats.json'

CAMPOS = ('exe', 'movil', 'arranques', 'directo')

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

    return dias


def fusionar(hist, nuevos):
    """Se queda con el valor mas alto de cada dia: al rotar el log no se pierde."""
    for d, v in nuevos.items():
        prev = hist.get(d, {})
        hist[d] = {c: max(prev.get(c, 0), v.get(c, 0)) for c in CAMPOS}
    return hist


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
        })

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
        'activos_2h': launchers_activos(),
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
