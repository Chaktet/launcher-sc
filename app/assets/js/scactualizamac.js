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

const RELEASES = 'https://github.com/Chaktet/launcher-sc/releases/download/'

let preparada = null // { version, app } del .app nuevo ya descomprimido

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

function ejecutar(cmd, args){
    return new Promise((resolve, reject) => {
        child_process.execFile(cmd, args, { timeout: 5 * 60 * 1000 }, (err, out, errOut) =>
            err ? reject(new Error(cmd + ': ' + (String(errOut || '').trim() || err.message))) : resolve(out))
    })
}

/**
 * Baja y prepara la versión de `info` (lo que da electron-updater en update-available).
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
    const dir = path.join(app.getPath('temp'), 'sc-launcher-actualizacion')
    await fs.promises.rm(dir, { recursive: true, force: true })
    await fs.promises.mkdir(dir, { recursive: true })
    const zip = path.join(dir, 'nuevo.zip')

    const res = await net.fetch(RELEASES + 'v' + version + '/' + encodeURIComponent(fichero.url), { cache: 'no-store' })
    if(!res.ok || res.body == null){
        throw new Error('HTTP ' + res.status + ' al bajar ' + fichero.url)
    }
    const total = Number(res.headers.get('content-length')) || fichero.size || 0
    const hash = crypto.createHash('sha512')
    const salida = fs.createWriteStream(zip)
    const inicio = Date.now()
    let hecho = 0
    let ultimoPct = -1
    const lector = res.body.getReader()
    try {
        for(;;){
            const { done, value } = await lector.read()
            if(done){
                break
            }
            hash.update(value)
            hecho += value.length
            if(!salida.write(value)){
                await new Promise(r => salida.once('drain', r))
            }
            const pct = total > 0 ? Math.floor(hecho * 100 / total) : 0
            if(pct !== ultimoPct){
                ultimoPct = pct
                progreso({ percent: pct, transferred: hecho, total, bytesPerSecond: hecho / Math.max(1, (Date.now() - inicio) / 1000) })
            }
        }
    } finally {
        await new Promise(r => salida.end(r))
    }
    // Un .zip corrupto o cambiado instalaría una app rota: se rechaza antes de tocar nada.
    if(hash.digest('base64') !== fichero.sha512){
        throw new Error('sha512 del .zip de Mac no coincide con latest-mac.yml')
    }
    const extraido = path.join(dir, 'app')
    await ejecutar('/usr/bin/ditto', ['-x', '-k', zip, extraido])
    const nuevo = path.join(extraido, 'SC Launcher.app')
    await fs.promises.access(path.join(nuevo, 'Contents', 'MacOS'))
    // Por si acaso: sin marca de cuarentena Gatekeeper no vuelve a preguntar.
    await ejecutar('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', nuevo]).catch(() => {})
    await fs.promises.rm(zip, { force: true })
    preparada = { version, app: nuevo }
}

/**
 * Cierra el launcher y cambia el .app por el nuevo. Devuelve false si no hay nada
 * preparado (entonces no se cierra nada).
 */
function instalar(){
    const actual = rutaApp()
    if(preparada == null || actual == null){
        return false
    }
    // El script vive fuera del .app y sigue tras cerrar el launcher. Si el cambio falla,
    // vuelve a dejar el .app viejo y lo abre: nunca se queda el jugador sin launcher.
    const script = path.join(path.dirname(preparada.app), '..', 'instalar.sh')
    fs.writeFileSync(script, [
        '#!/bin/sh',
        'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done',
        'rm -rf "$2.viejo"',
        'if mv "$2" "$2.viejo" && mv "$3" "$2"; then rm -rf "$2.viejo"; else [ -d "$2" ] || mv "$2.viejo" "$2"; fi',
        'open "$2"',
        ''
    ].join('\n'), { mode: 0o755 })
    child_process.spawn('/bin/sh', [script, String(process.pid), actual, preparada.app], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
    return true
}

module.exports = { sePuedeInstalar, descargar, instalar }
