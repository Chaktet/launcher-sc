#!/usr/bin/env python3
"""Mirror of the Java runtime the launcher installs (1.13.0), on our CDN.

Downloads the latest Temurin JDK and JRE <major> for Windows x64 from the official Adoptium API (the same builds
the launcher would pick by itself), checks their SHA-256 against Adoptium's checksum and publishes them with a
manifest:
  /var/www/packs/java/<package name>.zip
  /var/www/packs/java/manifest.json   {"21": {"windows-x64": {...}, "windows-x64-jre": {...}}}
each entry being {"name", "size", "sha256", "version"}, served as https://descargas.servidorcobblemon.es/java/...
The launcher tries this first and falls back to Adoptium if it fails.

"windows-x64-jre" (22-10-2026) is what launchers newer than 1.16.20 install: 49 MB instead of the JDK's 205 MB
(146 MB on disk instead of 329 MB), and it is all the game needs. "windows-x64" stays the JDK, because older
launchers only read that key.

Run by hand (sudo) when a new Java update is wanted; safe to re-run: an already mirrored build is skipped
only if its SHA-256 matches, and builds the manifest no longer names are deleted after 7 days (a launcher that
read the previous manifest can still download them).
"""
import hashlib, json, os, sys, tempfile, time, urllib.request

DESTINO = '/var/www/packs/java'
MAJORS = [21]
# Manifest key -> Adoptium image_type.
CLAVES = [('windows-x64', 'jdk'), ('windows-x64-jre', 'jre')]
GRACIA = 7 * 86400  # seconds an old build stays after leaving the manifest


def obtener(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'sc-java-cdn/1.0'})
    return urllib.request.urlopen(req, timeout=timeout)


def ultimo(major, tipo):
    with obtener('https://api.adoptium.net/v3/assets/latest/{}/hotspot?vendor=eclipse'.format(major)) as r:
        lista = json.load(r)
    for e in lista:
        b = e['binary']
        if e['version']['major'] == major and b['os'] == 'windows' and b['image_type'] == tipo and b['architecture'] == 'x64':
            p = b['package']
            return {'name': p['name'], 'size': p['size'], 'sha256': p['checksum'], 'url': p['link'],
                    'version': e['version']['openjdk_version']}
    raise RuntimeError('sin {} de Windows x64 para Java {}'.format(tipo, major))


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        for trozo in iter(lambda: f.read(1 << 20), b''):
            h.update(trozo)
    return h.hexdigest()


def espejar(major, info):
    final = os.path.join(DESTINO, info['name'])
    if os.path.exists(final) and os.path.getsize(final) == info['size'] and sha256(final) == info['sha256']:
        print('Java {}: {} ya estaba'.format(major, info['name']))
        return
    fd, tmp = tempfile.mkstemp(dir=DESTINO, prefix='.descarga-')
    h = hashlib.sha256()
    try:
        with os.fdopen(fd, 'wb') as f, obtener(info['url'], timeout=120) as r:
            while True:
                trozo = r.read(1 << 20)
                if not trozo:
                    break
                h.update(trozo)
                f.write(trozo)
        if h.hexdigest() != info['sha256'] or os.path.getsize(tmp) != info['size']:
            raise RuntimeError('SHA-256 o tamaño no coinciden con Adoptium')
        os.chmod(tmp, 0o644)
        os.replace(tmp, final)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print('Java {}: {} descargado y comprobado'.format(major, info['name']))


def main():
    os.makedirs(DESTINO, exist_ok=True)
    ruta_manifest = os.path.join(DESTINO, 'manifest.json')
    try:
        with open(ruta_manifest) as f:
            manifest = json.load(f)
    except FileNotFoundError:
        manifest = {}
    for major in MAJORS:
        entradas = {}
        for clave, tipo in CLAVES:
            info = ultimo(major, tipo)
            espejar(major, info)
            entradas[clave] = {k: info[k] for k in ('name', 'size', 'sha256', 'version')}
        manifest[str(major)] = entradas
    fd, tmp = tempfile.mkstemp(dir=DESTINO, prefix='.manifest-')
    with os.fdopen(fd, 'w') as f:
        json.dump(manifest, f, indent=1)
    os.chmod(tmp, 0o644)
    os.replace(tmp, ruta_manifest)
    # Zips the manifest no longer names are old builds: deleted after the grace period.
    # The grace period counts from when a build left the manifest (a .retirado-<name> marker).
    vivos = {e['name'] for v in manifest.values() for e in v.values()}
    for f in os.listdir(DESTINO):
        if f.startswith('.retirado-') and f[len('.retirado-'):] in vivos:
            # A build back in the manifest: its next retirement gets the full grace period again.
            os.unlink(os.path.join(DESTINO, f))
            continue
        if not f.endswith('.zip') or f in vivos:
            continue
        ruta = os.path.join(DESTINO, f)
        marca = os.path.join(DESTINO, '.retirado-' + f)
        if not os.path.exists(marca):
            open(marca, 'w').close()
        elif time.time() - os.path.getmtime(marca) > GRACIA:
            os.unlink(ruta)
            os.unlink(marca)
            print('Borrado el antiguo', f)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('ERROR:', e, file=sys.stderr)
        sys.exit(1)
