/**
 * Support ZIP (1.10.0): everything staff needs to diagnose a launch or game
 * problem in one file the player can attach to a ticket. Nothing is uploaded:
 * the ZIP is saved in Downloads and the folder is opened.
 *
 * Contents: launcher.log (+ rotated copies), the profile's latest.log and
 * debug.log, the newest crash report, the last launch failure reports and a
 * summary of the PC and launcher settings. config.json is NOT included (it
 * holds the account tokens). Every text file goes through limpiar(), which
 * removes tokens and the Windows user name.
 */
const fs     = require('fs')
const os     = require('os')
const path   = require('path')
const AdmZip = require('adm-zip')

// Per-file cap: a 200 MB latest.log after a crash loop would make a ZIP nobody can attach.
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Removes what must never leave the PC: tokens, session ids and passwords (as
 * CLI arguments, serialized argument arrays, JSON fields with plain or escaped
 * quotes, key=value, URL parameters, "Session ID is token: ..."), JWTs, and the
 * Windows user and PC names wherever they appear as a separate word (paths,
 * OneDrive folders, UNC shares, 8.3 short names, environment dumps). The
 * Minecraft nick stays: staff need it, and "ChaktetZz" is not the word "Chaktet".
 *
 * @param {string} texto
 * @param {{usuario?: string, equipo?: string}} quien Defaults to this PC (tests pass their own).
 * @returns {string}
 */
function limpiar(texto, quien = {}){
    const Q = '(?:\\\\*["\'])?' // optional quote, possibly escaped (\" or \\\")
    const SECRETOS = 'accessToken|refreshToken|msAccessToken|msRefreshToken|clientToken|access_token|refresh_token|id_token|password|passwd|pwd|sessionId|session_id|xuid'
    let t = texto
    // --accessToken X · "--accessToken","X" · \"--accessToken\", \"X\"
    t = t.replace(new RegExp('(--(?:accessToken|clientId|xuid|session|password))' + Q + '(\\s*,\\s*|\\s+|=)' + Q + '[^\\s"\'\\\\,\\]]+', 'gi'), '$1$2<oculto>')
    // "accessToken": "X" · accessToken=X · \"password\":\"X\" · ?access_token=X&
    t = t.replace(new RegExp('(\\b(?:' + SECRETOS + ')' + Q + '\\s*[:=]\\s*' + Q + ')[^\\s"\'\\\\,}&\\]]+', 'gi'), '$1<oculto>')
    // Minecraft: "Session ID is token:abc:def" / "(Session ID is token: X)"
    t = t.replace(/(Session ID is\s*)(?:token:\s*)?[^\s)]+/gi, '$1<oculto>')
    t = t.replace(/(token:)\s*[A-Za-z0-9._:-]{16,}/g, '$1<oculto>')
    t = t.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<jwt oculto>')

    const usuario = quien.usuario ?? os.userInfo().username
    const equipo = quien.equipo ?? os.hostname()
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const palabra = (s, por) => {
        if(s && s.length >= 3){
            t = t.replace(new RegExp('(?<![A-Za-z0-9])' + esc(s) + '(?![A-Za-z0-9])', 'gi'), por)
        }
    }
    if(usuario){
        // 8.3 short form of the profile folder: first 6 letters + ~N (C:\Users\CHAKTE~1).
        const corto = usuario.replace(/[^A-Za-z0-9]/g, '').slice(0, 6)
        if(corto.length >= 3 && (usuario.length > 8 || /\s/.test(usuario))){
            t = t.replace(new RegExp('(?<![A-Za-z0-9])' + esc(corto) + '~\\d+', 'gi'), '<usuario>')
        }
        palabra(usuario, '<usuario>')
    }
    palabra(equipo, '<equipo>')
    t = t.replace(/^((?:COMPUTERNAME|USERDOMAIN|USERDOMAIN_ROAMINGPROFILE|LOGONSERVER)=).*$/gim, '$1<oculto>')
    return t
}

/** Last MAX_BYTES of a text file, cleaned; null if it does not exist. */
function leerTexto(ruta){
    try {
        const st = fs.statSync(ruta)
        if(!st.isFile()){
            return null
        }
        let buf = fs.readFileSync(ruta)
        let recortado = ''
        if(buf.length > MAX_BYTES){
            buf = buf.subarray(buf.length - MAX_BYTES)
            recortado = '[... recortado: solo los últimos 8 MB ...]\n'
        }
        return recortado + limpiar(buf.toString('utf8'))
    } catch(_e){
        return null
    }
}

/** Newest files of a folder matching a filter, newest first. */
function masRecientes(dir, filtro, n){
    try {
        return fs.readdirSync(dir)
            .filter(filtro)
            .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t)
            .slice(0, n)
            .map(x => path.join(dir, x.f))
    } catch(_e){
        return []
    }
}

/**
 * Builds the ZIP.
 *
 * @param {Object} o
 * @param {string} o.instancia Instance folder of the selected profile.
 * @param {string} o.carpetaLogs Launcher logs folder (registro.rutaCarpeta).
 * @param {string} o.carpetaInformes Launch failure reports folder.
 * @param {string} o.resumen Plain-text summary (PC, launcher, settings).
 * @param {string} o.destino Folder where the ZIP is written.
 * @returns {{ruta: string, ficheros: string[]}}
 */
function crearZipSoporte(o){
    const zip = new AdmZip()
    const ficheros = []
    const meter = (nombre, texto) => {
        if(texto != null){
            zip.addFile(nombre, Buffer.from(texto, 'utf8'))
            ficheros.push(nombre)
        }
    }

    meter('resumen.txt', limpiar(o.resumen))
    for(const f of masRecientes(o.carpetaLogs, f => /^launcher\d*\.log$/.test(f), 3)){
        meter('launcher/' + path.basename(f), leerTexto(f))
    }
    meter('juego/latest.log', leerTexto(path.join(o.instancia, 'logs', 'latest.log')))
    meter('juego/debug.log', leerTexto(path.join(o.instancia, 'logs', 'debug.log')))
    for(const f of masRecientes(path.join(o.instancia, 'crash-reports'), f => f.endsWith('.txt'), 1)){
        meter('juego/crash-reports/' + path.basename(f), leerTexto(f))
    }
    for(const f of masRecientes(o.carpetaInformes, f => f.endsWith('.txt'), 3)){
        meter('informes/' + path.basename(f), leerTexto(f))
    }
    // JVM crash logs (hs_err) land in the instance folder when Java itself dies.
    for(const f of masRecientes(o.instancia, f => /^hs_err_pid\d+\.log$/.test(f), 1)){
        meter('juego/' + path.basename(f), leerTexto(f))
    }

    const d = new Date()
    const dos = n => String(n).padStart(2, '0')
    const nombre = `SC-soporte-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}.zip`
    fs.mkdirSync(o.destino, { recursive: true })
    const ruta = path.join(o.destino, nombre)
    zip.writeZip(ruta)
    return { ruta, ficheros }
}

module.exports = { crearZipSoporte, limpiar }
