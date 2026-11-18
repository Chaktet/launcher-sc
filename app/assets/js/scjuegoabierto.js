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
 * un proceso con ese PID.
 *  - Windows (1.17.24): el juego nace con un candado heredado (sccandado.js) cuya ruta va en
 *    la marca. Mientras el candado esté ocupado, ESE juego sigue abierto; no se mira el PID.
 *    Hasta la 1.17.23 se preguntaba a Windows por PowerShell (WMI): fuera, los antivirus
 *    puntúan un PowerShell oculto que mira otros procesos (Felix 17-11-2026).
 *  - Mac y Linux: se compara la identidad del proceso (que sea java y que su --gameDir
 *    esté dentro de nuestra carpeta de instancias).
 *
 * Dos formas de preguntar:
 *  - juegoPrevioAbiertoAsync(): comprobación completa y fresca. Es la que hay que esperar
 *    antes de lanzar el juego, escribir options.txt, reparar o instalar una actualización.
 *  - juegoPrevioAbierto(): el último resultado conocido, sin esperar ni consultar nada
 *    (y pide uno nuevo en segundo plano si está viejo). Solo para avisos de la interfaz.
 */
const child_process = require('child_process')
const fs            = require('fs')
const os            = require('os')
const path          = require('path')

const { LoggerUtil } = require('helios-core')
const ConfigManager  = require('./configmanager')
const ScCandado      = require('./sccandado')

const logger = LoggerUtil.getLogger('ScJuegoAbierto')

const FICHERO = 'sc-juego.pid'
// Si Windows no responde a la consulta de identidad, solo se da por bueno un PID
// reciente: mejor arriesgar un segundo juego que bloquear JUGAR por un PID reciclado.
const MAX_SIN_VERIFICAR_MS = 12 * 3600 * 1000
// Cada cuánto se refresca en segundo plano el resultado que usan los avisos pasivos.
const PASIVO_MS = 30 * 1000

// Último resultado conocido (para juegoPrevioAbierto) y consulta en curso.
let ultimo = { pid: null, en: 0 }
let enCurso = null

function ruta(){
    return path.join(ConfigManager.getInstanceDirectory(), FICHERO)
}

function normalizar(p){
    return String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/**
 * Identidad de un proceso en Mac y Linux: { nombre, linea } o null si no existe. Rechaza si no
 * se puede consultar. En Windows no se pregunta por otros procesos (ver arriba): rechaza.
 */
async function identidad(pid){
    if(process.platform === 'win32'){
        throw new Error('En Windows la identidad la da el candado')
    }
    if(process.platform === 'linux'){
        const linea = (await fs.promises.readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' ')
        return { nombre: linea.split(' ')[0], linea }
    }
    const linea = await new Promise((resolve, reject) => {
        child_process.execFile('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 3000 },
            (err, out) => err && !out ? reject(err) : resolve(String(out || '')))
    })
    return linea.trim() === '' ? null : { nombre: linea.split(' ')[0], linea }
}

/** Valor del argumento --gameDir de una línea de comandos (con o sin comillas). */
function argumentoGameDir(linea){
    const m = /(?:^|\s)--gameDir\s+(?:"([^"]+)"|(\S+))/.exec(linea)
    return m == null ? null : (m[1] || m[2])
}

/**
 * Anota el juego recién lanzado.
 *
 * @param {string|null} candado Ruta del candado que heredó el juego (Windows), o null.
 */
exports.anotar = function(pid, servidor, candado){
    if(pid == null){
        return
    }
    try {
        fs.mkdirSync(ConfigManager.getInstanceDirectory(), { recursive: true })
        fs.writeFileSync(ruta(), JSON.stringify({
            pid,
            servidor,
            desde: Date.now(),
            instancias: ConfigManager.getInstanceDirectory(),
            candado: typeof candado === 'string' ? candado : null
        }))
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
    if(typeof d.candado === 'string' && d.candado !== ''){
        // true/false es definitivo: lo dice Windows, no el PID. null = no se pudo abrir por
        // otro motivo (permisos, disco): decide la regla de la marca reciente.
        return ScCandado.ocupado(d.candado)
    }
    if(process.platform === 'win32'){
        // Marca sin candado (no se pudo crear): no hay a quién preguntar.
        return null
    }
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
    // Línea vacía = proceso de otro usuario sin permiso para leerla.
    if(id.linea.trim() !== ''){
        const gameDir = argumentoGameDir(id.linea)
        const instancias = normalizar(d.instancias || ConfigManager.getInstanceDirectory())
        if(gameDir == null || !normalizar(gameDir).startsWith(instancias + '\\')){
            return false
        }
    }
    return true
}

// Lo que devuelven las consultas cuando hay un juego abierto del que no se sabe el PID. No es
// null (los llamadores solo miran eso) y nadie mata ni busca por este número.
const PID_DESCONOCIDO = 0

/**
 * ¿Hay un juego nuestro abierto que no llegó a anotarse? Pasa si su vigilante murió entre lanzar
 * Java y avisar al launcher: Java sigue con su candado, pero sc-juego.pid nunca se escribió y el
 * siguiente JUGAR abriría un segundo Minecraft (revisión de Codex 17-11).
 */
function juegoSinMarca(){
    if(!ScCandado.disponible){
        return false
    }
    try {
        const carpeta = path.join(ConfigManager.getInstanceDirectory(), 'sc-vigilante')
        return fs.readdirSync(carpeta).some(f => /^juego-[0-9a-f]+\.lock$/.test(f) && ScCandado.ocupado(path.join(carpeta, f)) === true)
    } catch(_e){
        // Sin carpeta: nunca se lanzó nada.
        return false
    }
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
            let vivo = d != null && Number.isInteger(d.pid) && d.pid > 0
            if(vivo){
                // El candado manda sobre el PID; sin respuesta, PID vivo y marca reciente.
                const r = await esElJuegoAnotado(d)
                // Una marca anterior al último arranque del PC no puede ser de un proceso vivo
                // (marcas de la 1.17.23, sin candado, tras un apagón con el juego abierto).
                const arranque = Date.now() - os.uptime() * 1000
                vivo = r === true
                    || (r == null && existe(d.pid) && (d.desde || 0) > arranque
                        && Date.now() - (d.desde || 0) < MAX_SIN_VERIFICAR_MS)
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
    if(pid == null && juegoSinMarca()){
        pid = PID_DESCONOCIDO
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
