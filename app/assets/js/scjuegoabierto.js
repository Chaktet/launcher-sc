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
 * se anotó al lanzarlo) y que su línea de comandos apunte a nuestra carpeta de
 * instancias (--gameDir). Si no coincide, el juego anotado ya no está.
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
// sc$juegoAbierto() se llama al pintar Ajustes; no hace falta preguntar cada vez.
const CACHE_MS = 3000
// La consulta de identidad tarda ~1 s (arranca PowerShell). Confirmada una vez, durante
// este tiempo basta con ver que el PID sigue vivo.
const IDENTIDAD_VALIDA_MS = 5 * 60 * 1000
// Margen entre la hora de creación real y la anotada.
const MARGEN_CREADO_MS = 3000
const MARGEN_DESDE_MS = 60 * 1000

let cache = { hasta: 0, pid: null }
// Última identidad confirmada: { clave, hasta }.
let confirmada = { clave: null, hasta: 0 }

function ruta(){
    return path.join(ConfigManager.getInstanceDirectory(), FICHERO)
}

function normalizar(p){
    return String(p || '').replace(/\//g, '\\').toLowerCase()
}

/**
 * Identidad de un proceso: { creado: ms UTC|null, nombre, linea } o null si no existe.
 * Lanza si no se puede consultar.
 */
function identidadSync(pid){
    if(process.platform === 'win32'){
        const ps = '$p = Get-CimInstance Win32_Process -Filter \'ProcessId=' + Number(pid) + '\'; '
            + 'if($p){ [Console]::Out.WriteLine($p.CreationDate.ToUniversalTime().ToString(\'o\')); '
            + '[Console]::Out.WriteLine($p.Name); [Console]::Out.WriteLine([string]$p.CommandLine) }'
        const out = child_process.execFileSync('powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
            { encoding: 'utf8', timeout: 5000, windowsHide: true })
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
        const linea = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')
        return { creado: null, nombre: linea.split(' ')[0], linea }
    }
    const linea = child_process.execFileSync('ps', ['-p', String(pid), '-o', 'command='],
        { encoding: 'utf8', timeout: 3000 })
    return linea.trim() === '' ? null : { creado: null, nombre: linea.split(' ')[0], linea }
}

/** Hora de creación anotada en segundo plano tras lanzar (no bloquea el arranque). */
function anotarCreacion(pid){
    if(process.platform !== 'win32'){
        return
    }
    const ps = '(Get-CimInstance Win32_Process -Filter \'ProcessId=' + Number(pid) + '\').CreationDate.ToUniversalTime().ToString(\'o\')'
    child_process.execFile('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { encoding: 'utf8', timeout: 10000, windowsHide: true },
        (err, out) => {
            const creado = err ? NaN : Date.parse(String(out).trim())
            if(!Number.isFinite(creado)){
                return
            }
            try {
                const d = JSON.parse(fs.readFileSync(ruta(), 'utf8'))
                if(d.pid === pid){
                    d.creado = creado
                    fs.writeFileSync(ruta(), JSON.stringify(d))
                }
            } catch(_e){
                // El juego ya se cerró y la marca no existe: nada que completar.
            }
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
        cache = { hasta: 0, pid: null }
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
    cache = { hasta: 0, pid: null }
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
function esElJuegoAnotado(d){
    let id
    try {
        id = identidadSync(d.pid)
    } catch(e){
        logger.warn('No se pudo consultar la identidad del proceso ' + d.pid, e)
        return null
    }
    if(id == null){
        return false
    }
    if(!/java/i.test(id.nombre)){
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
    const instancias = normalizar(d.instancias || ConfigManager.getInstanceDirectory())
    if(id.linea.trim() !== '' && !normalizar(id.linea).includes(instancias)){
        return false
    }
    return true
}

/**
 * PID del juego abierto de una sesión anterior, o null. Borra la marca si ya no vale.
 *
 * @returns {number|null}
 */
exports.juegoPrevioAbierto = function(){
    if(Date.now() < cache.hasta){
        return cache.pid
    }
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
                const clave = `${d.pid}|${d.desde}|${d.creado}`
                if(!(confirmada.clave === clave && Date.now() < confirmada.hasta)){
                    const r = esElJuegoAnotado(d)
                    vivo = r === true
                        || (r == null && Date.now() - (d.desde || 0) < MAX_SIN_VERIFICAR_MS)
                    if(r === true){
                        confirmada = { clave, hasta: Date.now() + IDENTIDAD_VALIDA_MS }
                    }
                }
            }
            if(vivo){
                pid = d.pid
            } else {
                fs.rmSync(F, { force: true })
            }
        }
    } catch(e){
        logger.warn('No se pudo leer la marca del juego abierto', e)
    }
    cache = { hasta: Date.now() + CACHE_MS, pid }
    return pid
}
