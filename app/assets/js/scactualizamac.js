/**
 * Actualización automática en Mac sin firma de Apple (1.17.8).
 *
 * El actualizador de electron-updater en Mac (Squirrel.Mac) solo instala una app nueva
 * firmada por el mismo desarrollador de Apple, y el launcher de Mac va con firma ad hoc
 * (no se paga la cuota de Apple). Así que lo hacemos nosotros: se baja el .zip de la
 * release, se comprueba su sha512 contra latest-mac.yml, se descomprime con `ditto`
 * (conserva la firma y los enlaces del .app) y, al instalar, un script espera a que el
 * launcher se cierre, cambia el .app viejo por el nuevo y lo abre.
 *
 * Lo que baja el propio launcher no lleva la marca de cuarentena de macOS, así que el
 * .app nuevo se abre sin el aviso de Gatekeeper: el permiso solo se da en la primera
 * instalación. Si el .app no se puede sustituir (abierto desde el .dmg, desde Descargas
 * con «App Translocation», o sin permiso de escritura) se avisa para hacerlo a mano.
 */
const { app, net } = require('electron')
const child_process = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable, Transform } = require('stream')
const { pipeline } = require('stream/promises')

const RELEASES = 'https://github.com/Chaktet/launcher-sc/releases/download/'
// Sin un solo byte en este tiempo, la descarga se da por colgada: sin límite, una
// conexión abierta que no entrega nada dejaba la puerta (y JUGAR) bloqueada para siempre.
const INACTIVIDAD_MS = 60 * 1000

let preparada = null // { version, dir, app } del .app nuevo ya descomprimido
let instalando = false

/** Ruta del «SC Launcher.app» en ejecución, o null si no es un .app. */
function rutaApp(){
    const m = /^(.*?\.app)\//.exec(app.getPath('exe'))
    return m == null ? null : m[1]
}

/** ¿Se puede sustituir el .app en su sitio? */
function sePuedeInstalar(){
    const actual = rutaApp()
    if(actual == null || actual.startsWith('/Volumes/') || actual.includes('/AppTranslocation/')){
        return false
    }
    try {
        fs.accessSync(path.dirname(actual), fs.constants.W_OK)
        fs.accessSync(actual, fs.constants.W_OK)
        return true
    } catch {
        return false
    }
}

function hayPreparada(){
    return preparada != null
}

function ejecutar(cmd, args){
    return new Promise((resolve, reject) => {
        child_process.execFile(cmd, args, { timeout: 5 * 60 * 1000 }, (err, out, errOut) =>
            err ? reject(new Error(cmd + ': ' + (String(errOut || '').trim() || err.message))) : resolve(out))
    })
}

/**
 * Baja y prepara la versión de `info` (lo que da electron-updater en update-available).
 * Cada versión va en su propia carpeta: la ya preparada no se toca hasta que la nueva
 * está entera (Codex: borrarla antes dejaba «lista» apuntando a una app a medias).
 * @param {object} info
 * @param {(p: {percent: number, bytesPerSecond: number, total: number, transferred: number}) => void} progreso
 */
async function descargar(info, progreso){
    const version = String(info.version)
    if(preparada != null && preparada.version === version){
        return
    }
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const fichero = (info.files || []).find(f => typeof f.url === 'string' && f.url.endsWith(`-mac-${arch}.zip`))
    if(fichero == null || !fichero.sha512){
        throw new Error('La release ' + version + ' no trae el .zip de Mac para ' + arch)
    }
    const raiz = path.join(app.getPath('temp'), 'sc-launcher-actualizacion')
    const dir = path.join(raiz, version.replace(/[^\w.-]/g, '_'))
    await fs.promises.rm(dir, { recursive: true, force: true })
    await fs.promises.mkdir(dir, { recursive: true })
    const zip = path.join(dir, 'nuevo.zip')

    const ctrl = new AbortController()
    let reloj = setTimeout(() => ctrl.abort(), INACTIVIDAD_MS)
    try {
        const res = await net.fetch(RELEASES + 'v' + version + '/' + encodeURIComponent(fichero.url), { cache: 'no-store', signal: ctrl.signal })
        if(!res.ok || res.body == null){
            throw new Error('HTTP ' + res.status + ' al bajar ' + fichero.url)
        }
        const total = Number(res.headers.get('content-length')) || fichero.size || 0
        const hash = crypto.createHash('sha512')
        const inicio = Date.now()
        let hecho = 0
        let ultimoPct = -1
        const contar = new Transform({
            transform(trozo, _cod, listo){
                clearTimeout(reloj)
                reloj = setTimeout(() => ctrl.abort(), INACTIVIDAD_MS)
                hash.update(trozo)
                hecho += trozo.length
                const pct = total > 0 ? Math.floor(hecho * 100 / total) : 0
                if(pct !== ultimoPct){
                    ultimoPct = pct
                    progreso({ percent: pct, transferred: hecho, total, bytesPerSecond: hecho / Math.max(1, (Date.now() - inicio) / 1000) })
                }
                listo(null, trozo)
            }
        })
        // pipeline lleva los errores de cualquier tramo (disco lleno, sin permiso, red
        // cortada o abortada) a esta promesa, en vez de una excepción suelta.
        await pipeline(Readable.fromWeb(res.body), contar, fs.createWriteStream(zip), { signal: ctrl.signal })
        // Un .zip corrupto o cambiado instalaría una app rota: se rechaza antes de tocar nada.
        if(hash.digest('base64') !== fichero.sha512){
            throw new Error('sha512 del .zip de Mac no coincide con latest-mac.yml')
        }
    } catch(err){
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
        throw ctrl.signal.aborted ? new Error('Descarga de la actualización de Mac sin respuesta durante 60 s') : err
    } finally {
        clearTimeout(reloj)
    }
    const extraido = path.join(dir, 'app')
    await ejecutar('/usr/bin/ditto', ['-x', '-k', zip, extraido])
    const nuevo = path.join(extraido, 'SC Launcher.app')
    await fs.promises.access(path.join(nuevo, 'Contents', 'MacOS'))
    // Por si acaso: sin marca de cuarentena Gatekeeper no vuelve a preguntar.
    await ejecutar('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', nuevo]).catch(() => {})
    await fs.promises.rm(zip, { force: true })
    const anterior = preparada
    preparada = { version, dir, app: nuevo }
    if(anterior != null && anterior.dir !== dir){
        fs.promises.rm(anterior.dir, { recursive: true, force: true }).catch(() => {})
    }
}

/**
 * Lanza el cambio del .app y, si `cerrar`, cierra el launcher. Solo una vez por sesión:
 * dos scripts a la vez sobre las mismas rutas podían dejar al jugador sin .app (Codex).
 * Devuelve false si no hay nada preparado (entonces no se cierra nada).
 */
function instalar(cerrar = true){
    const actual = rutaApp()
    if(instalando || preparada == null || actual == null){
        return false
    }
    instalando = true
    // El script vive fuera del .app y sigue tras cerrar el launcher. Primero copia el .app
    // nuevo JUNTO al viejo (mismo disco: los dos mv son renombres que no se quedan a
    // medias); si algo falla, el viejo vuelve a su sitio: nunca se queda el jugador sin
    // launcher. Al pulsar el botón se reabre solo; al cerrar el launcher, no.
    const script = path.join(preparada.dir, 'instalar.sh')
    fs.writeFileSync(script, [
        '#!/bin/sh',
        'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done',
        'rm -rf "$2.nuevo" "$2.viejo"',
        'if /usr/bin/ditto "$3" "$2.nuevo" && mv "$2" "$2.viejo"; then',
        '  if mv "$2.nuevo" "$2"; then rm -rf "$2.viejo"; else mv "$2.viejo" "$2"; fi',
        'fi',
        'rm -rf "$2.nuevo"',
        '[ "$4" = 1 ] && open "$2"',
        ''
    ].join('\n'), { mode: 0o755 })
    child_process.spawn('/bin/sh', [script, String(process.pid), actual, preparada.app, cerrar ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref()
    if(cerrar){
        app.quit()
    }
    return true
}

module.exports = { sePuedeInstalar, hayPreparada, descargar, instalar }
