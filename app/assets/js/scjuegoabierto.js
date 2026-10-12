/**
 * ¿Sigue abierto un Minecraft lanzado por el launcher, aunque sea de una sesión anterior?
 *
 * El juego se lanza separado del launcher (launchDetached), así que sobrevive a que el
 * jugador cierre y vuelva a abrir el launcher. Pero `proc` solo existe en memoria: tras
 * reabrir, el launcher creía que no había juego, dejaba lanzar un SEGUNDO Minecraft
 * (dos JVM con 6 GB cada una) y tocaba options.txt con el juego abierto, que lo reescribe
 * entero al cerrarse y se pierde el cambio. Por eso se anota el PID en disco al lanzar.
 *
 * Un PID se reutiliza: que exista un proceso con ese número no basta, se comprueba
 * además que sea un java.
 */
const child_process = require('child_process')
const fs            = require('fs')
const path          = require('path')

const { LoggerUtil } = require('helios-core')
const ConfigManager  = require('./configmanager')

const logger = LoggerUtil.getLogger('ScJuegoAbierto')

const FICHERO = 'sc-juego.pid'
// Si no se puede comprobar el nombre del proceso, solo se da por bueno un PID reciente:
// mejor arriesgar un segundo juego que bloquear JUGAR para siempre por un PID reciclado.
const MAX_SIN_VERIFICAR_MS = 12 * 3600 * 1000
// sc$juegoAbierto() se llama al pintar Ajustes; no hace falta preguntar a Windows cada vez.
const CACHE_MS = 3000

let cache = { hasta: 0, pid: null }

function ruta(){
    return path.join(ConfigManager.getInstanceDirectory(), FICHERO)
}

/** Anota el juego recién lanzado. */
exports.anotar = function(pid, servidor){
    if(pid == null){
        return
    }
    try {
        fs.mkdirSync(ConfigManager.getInstanceDirectory(), { recursive: true })
        fs.writeFileSync(ruta(), JSON.stringify({ pid, servidor, desde: Date.now() }))
        cache = { hasta: 0, pid: null }
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

/** true si es java, false si no, null si no se puede saber. */
function esJava(pid){
    try {
        if(process.platform === 'win32'){
            const out = child_process.execFileSync('tasklist',
                ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
                { encoding: 'utf8', timeout: 3000, windowsHide: true })
            // Sin coincidencia tasklist escribe un aviso en el idioma del sistema: se mira
            // solo si alguna línea empieza por el nombre de un ejecutable de Java.
            return /^"javaw?\.exe"/im.test(out)
        }
        if(process.platform === 'linux'){
            return /java/i.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'))
        }
        const out = child_process.execFileSync('ps', ['-p', String(pid), '-o', 'comm='],
            { encoding: 'utf8', timeout: 3000 })
        return /java/i.test(out)
    } catch(e){
        logger.warn('No se pudo comprobar el nombre del proceso ' + pid, e)
        return null
    }
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
            const d = JSON.parse(fs.readFileSync(F, 'utf8'))
            let vivo = Number.isInteger(d.pid) && d.pid > 0 && existe(d.pid)
            if(vivo){
                const java = esJava(d.pid)
                vivo = java === true
                    || (java == null && Date.now() - (d.desde || 0) < MAX_SIN_VERIFICAR_MS)
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
