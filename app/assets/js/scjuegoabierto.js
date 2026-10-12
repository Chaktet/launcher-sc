/**
 * ¿Sigue abierto un Minecraft lanzado por el launcher, aunque sea de una sesión anterior?
 *
 * El juego se lanza separado del launcher (launchDetached), así que sobrevive a que el
 * jugador cierre y vuelva a abrir el launcher. Pero `proc` solo existe en memoria: tras
 * reabrir, el launcher creía que no había juego, dejaba lanzar un SEGUNDO Minecraft
 * (dos JVM con 6 GB cada una) y tocaba options.txt con el juego abierto, que lo reescribe
 * entero al cerrarse y se pierde el cambio. Por eso se anota el PID en disco al lanzar.
 *
 * Un PID se reutiliza, y cualquier otro java.exe (otro launcher, un servidor local)
 * puede acabar con el número de un juego ya cerrado. Por eso no basta con que exista
 * un java con ese PID: se compara la IDENTIDAD del proceso, su hora de creación (la que
 * se anotó al lanzarlo) y que su argumento --gameDir esté dentro de nuestra carpeta de
 * instancias. Si no coincide, el juego anotado ya no está.
 *
 * Dos formas de preguntar:
 *  - juegoPrevioAbiertoAsync(): comprobación completa y fresca. Es la que hay que esperar
 *    antes de lanzar el juego, escribir options.txt, reparar o instalar una actualización.
 *  - juegoPrevioAbierto(): el último resultado conocido, sin esperar ni consultar nada
 *    (y pide uno nuevo en segundo plano si está viejo). Solo para avisos de la interfaz.
 * La consulta a Windows (PowerShell, ~1 s) va SIEMPRE en segundo plano: nunca bloquea la
 * interfaz, y si hay varias peticiones a la vez comparten la misma consulta.
 */
const child_process = require('child_process')
const fs            = require('fs')
const path          = require('path')

const { LoggerUtil } = require('helios-core')
const ConfigManager  = require('./configmanager')

const logger = LoggerUtil.getLogger('ScJuegoAbierto')

const FICHERO = 'sc-juego.pid'
// Si Windows no responde a la consulta de identidad, solo se da por bueno un PID
// reciente: mejor arriesgar un segundo juego que bloquear JUGAR por un PID reciclado.
const MAX_SIN_VERIFICAR_MS = 12 * 3600 * 1000
// Cada cuánto se refresca en segundo plano el resultado que usan los avisos pasivos.
const PASIVO_MS = 30 * 1000
// Margen entre la hora de creación real y la anotada.
const MARGEN_CREADO_MS = 3000
const MARGEN_DESDE_MS = 60 * 1000

// Último resultado conocido (para juegoPrevioAbierto) y consulta en curso.
let ultimo = { pid: null, en: 0 }
let enCurso = null

function ruta(){
    return path.join(ConfigManager.getInstanceDirectory(), FICHERO)
}

function normalizar(p){
    return String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function powershell(comando, timeout){
    return new Promise((resolve, reject) => {
        child_process.execFile('powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', comando],
            { encoding: 'utf8', timeout, windowsHide: true },
            (err, out) => err ? reject(err) : resolve(String(out)))
    })
}

/**
 * Identidad de un proceso: { creado: ms UTC|null, nombre, linea } o null si no existe.
 * Rechaza si no se puede consultar.
 */
async function identidad(pid){
    if(process.platform === 'win32'){
        const out = await powershell('$p = Get-CimInstance Win32_Process -Filter \'ProcessId=' + Number(pid) + '\'; '
            + 'if($p){ [Console]::Out.WriteLine($p.CreationDate.ToUniversalTime().ToString(\'o\')); '
            + '[Console]::Out.WriteLine($p.Name); [Console]::Out.WriteLine([string]$p.CommandLine) }', 5000)
        const lineas = out.split(/\r?\n/)
        if(lineas[0].trim() === ''){
            return null
        }
        const creado = Date.parse(lineas[0].trim())
        return {
            creado: Number.isFinite(creado) ? creado : null,
            nombre: (lineas[1] || '').trim(),
            linea: lineas.slice(2).join(' ')
        }
    }
    if(process.platform === 'linux'){
        const linea = (await fs.promises.readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' ')
        return { creado: null, nombre: linea.split(' ')[0], linea }
    }
    const linea = await new Promise((resolve, reject) => {
        child_process.execFile('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 3000 },
            (err, out) => err && !out ? reject(err) : resolve(String(out || '')))
    })
    return linea.trim() === '' ? null : { creado: null, nombre: linea.split(' ')[0], linea }
}

/** Valor del argumento --gameDir de una línea de comandos (con o sin comillas). */
function argumentoGameDir(linea){
    const m = /(?:^|\s)--gameDir\s+(?:"([^"]+)"|(\S+))/.exec(linea)
    return m == null ? null : (m[1] || m[2])
}

/** Hora de creación anotada en segundo plano tras lanzar (no bloquea el arranque). */
function anotarCreacion(pid){
    if(process.platform !== 'win32'){
        return
    }
    powershell('(Get-CimInstance Win32_Process -Filter \'ProcessId=' + Number(pid) + '\').CreationDate.ToUniversalTime().ToString(\'o\')', 10000)
        .then(out => {
            const creado = Date.parse(out.trim())
            if(!Number.isFinite(creado)){
                return
            }
            const d = JSON.parse(fs.readFileSync(ruta(), 'utf8'))
            if(d.pid === pid){
                d.creado = creado
                fs.writeFileSync(ruta(), JSON.stringify(d))
            }
        })
        .catch(() => {
            // Sin hora exacta se compara con `desde`; o el juego ya se cerró.
        })
}

/** Anota el juego recién lanzado. */
exports.anotar = function(pid, servidor){
    if(pid == null){
        return
    }
    try {
        fs.mkdirSync(ConfigManager.getInstanceDirectory(), { recursive: true })
        fs.writeFileSync(ruta(), JSON.stringify({
            pid,
            servidor,
            desde: Date.now(),
            instancias: ConfigManager.getInstanceDirectory()
        }))
        anotarCreacion(pid)
    } catch(e){
        logger.warn('No se pudo anotar el PID del juego', e)
    }
}

/** El juego `pid` se ha cerrado: se borra la marca si sigue siendo la suya. */
exports.borrar = function(pid){
    try {
        const d = JSON.parse(fs.readFileSync(ruta(), 'utf8'))
        if(d.pid === pid){
            fs.rmSync(ruta(), { force: true })
        }
    } catch(_e){
        // Sin marca o ilegible: nada que borrar.
    }
    ultimo = { pid: null, en: Date.now() }
}

function existe(pid){
    try {
        process.kill(pid, 0)
        return true
    } catch(e){
        // EPERM: existe pero es de otro usuario.
        return e.code === 'EPERM'
    }
}

/**
 * ¿El proceso `d.pid` es el juego que se anotó? true / false, o null si no se pudo
 * consultar.
 */
async function esElJuegoAnotado(d){
    let id
    try {
        id = await identidad(d.pid)
    } catch(e){
        logger.warn('No se pudo consultar la identidad del proceso ' + d.pid, e)
        return null
    }
    if(id == null || !/java/i.test(id.nombre)){
        return false
    }
    if(id.creado != null){
        const anotado = typeof d.creado === 'number' ? d.creado : d.desde
        const margen = typeof d.creado === 'number' ? MARGEN_CREADO_MS : MARGEN_DESDE_MS
        // Sin hora exacta, el juego se creó justo ANTES de anotar `desde`.
        if(typeof anotado !== 'number' || Math.abs(id.creado - anotado) > margen){
            return false
        }
    }
    // Línea vacía = proceso de otro usuario sin permiso para leerla: decide la hora.
    if(id.linea.trim() !== ''){
        const gameDir = argumentoGameDir(id.linea)
        const instancias = normalizar(d.instancias || ConfigManager.getInstanceDirectory())
        if(gameDir == null || !normalizar(gameDir).startsWith(instancias + '\\')){
            return false
        }
    }
    return true
}

async function comprobar(){
    let pid = null
    try {
        const F = ruta()
        if(fs.existsSync(F)){
            let d = null
            try {
                d = JSON.parse(fs.readFileSync(F, 'utf8'))
            } catch(_e){
                // Marca ilegible: no prueba nada.
            }
            let vivo = d != null && Number.isInteger(d.pid) && d.pid > 0 && existe(d.pid)
            if(vivo){
                const r = await esElJuegoAnotado(d)
                vivo = r === true
                    || (r == null && Date.now() - (d.desde || 0) < MAX_SIN_VERIFICAR_MS)
            }
            if(vivo){
                pid = d.pid
            } else {
                // Solo si la marca sigue siendo la misma que se ha comprobado: mientras se
                // consultaba pudo lanzarse un juego nuevo y anotarse.
                try {
                    const actual = JSON.parse(fs.readFileSync(F, 'utf8'))
                    if(d == null || actual.pid === d.pid){
                        fs.rmSync(F, { force: true })
                    }
                } catch(_e){
                    fs.rmSync(F, { force: true })
                }
            }
        }
    } catch(e){
        logger.warn('No se pudo leer la marca del juego abierto', e)
    }
    ultimo = { pid, en: Date.now() }
    return pid
}

/**
 * Comprobación completa y fresca. Esperarla antes de cualquier acción que choque con
 * un juego abierto. Las llamadas simultáneas comparten la misma consulta.
 *
 * @returns {Promise<number|null>} PID del juego abierto de una sesión anterior, o null.
 */
exports.juegoPrevioAbiertoAsync = function(){
    if(enCurso == null){
        enCurso = comprobar().finally(() => {
            enCurso = null
        })
    }
    return enCurso
}

/**
 * Último resultado conocido, sin esperar. Solo para avisos de la interfaz: si está
 * viejo, pide uno nuevo en segundo plano y devuelve el que había.
 *
 * @returns {number|null}
 */
exports.juegoPrevioAbierto = function(){
    if(Date.now() - ultimo.en > PASIVO_MS){
        exports.juegoPrevioAbiertoAsync().catch(() => {})
    }
    return ultimo.pid
}
