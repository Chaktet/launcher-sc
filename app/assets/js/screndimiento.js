/**
 * Performance helpers (1.9.0): automatic memory, PRO/LITE recommendation and the
 * one-click graphics presets. Pure functions plus small file edits; the UI lives
 * in settings.js / landing.js / overlay.js.
 */
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const GB = 1073741824

/**
 * Memory for the game when "RAM automática" is on.
 *
 * Starts from the profile's recommended value (distribution javaOptions.ram)
 * and adds a little on big machines, but always leaves room for Windows, the
 * launcher and the browser/Discord most players keep open:
 *   reserve = 2.5 GB up to 8 GB of RAM, 4 GB up to 16 GB, 5 GB above.
 * More heap than the pack needs only makes the garbage collector pauses longer,
 * so the extra is capped at +2 GB. Never below the profile minimum (the launch
 * checks already warn when that does not fit). Rounded down to 0.5 GB.
 *
 * @param {{recommended?: number, minimum?: number}} ram Distribution values in MB.
 * @param {number} totalBytes Total system memory (os.totalmem()).
 * @returns {number} Gigabytes, multiple of 0.5.
 */
function ramAutomatica(ram, totalBytes = os.totalmem()){
    const total = totalBytes / GB
    const recomendada = (ram?.recommended ?? 4096) / 1024
    const minima = (ram?.minimum ?? 2048) / 1024
    const reserva = total <= 8.5 ? 2.5 : (total <= 16.5 ? 4 : 5)
    const extra = total >= 24 ? 2 : (total >= 15 ? 1 : 0)
    const objetivo = Math.min(total - reserva, recomendada + extra)
    return Math.max(minima, Math.floor(objetivo * 2) / 2)
}

/** "7G" / "5632M" in the format the config and the JVM use. */
function formatoJvm(gb){
    return gb % 1 === 0 ? gb + 'G' : Math.round(gb * 1024) + 'M'
}

/** "7 GB" / "5,5 GB" for the UI. */
function formatoGb(gb){
    return String(gb).replace('.', ',') + ' GB'
}

/** Profiles from heaviest to lightest. */
const NIVELES = ['pro', 'lite', 'superlite']

/**
 * Level of a profile by its id. «SuperLite» must be checked before «Lite»: the
 * rest of the launcher still treats any id containing «Lite» as a light profile
 * (docs/ARQUITECTURA.md), which is right for SUPER LITE too.
 *
 * @param {string} id Server id of the distribution.
 * @returns {'pro'|'lite'|'superlite'}
 */
function nivelDePerfil(id){
    const s = String(id || '')
    if(/superlite/i.test(s)){
        return 'superlite'
    }
    return /lite/i.test(s) ? 'lite' : 'pro'
}

let scGpuCache = null
/**
 * What the graphics card can do, read once through WebGL (renderer process).
 * maxTextura: the PRO and LITE packs build an 8192×8192 item atlas; a card that
 * cannot hold that texture shows broken items or crashes, SUPER LITE's atlas
 * is 2048 (measured 18-10). integrada: shares the PC's RAM (Intel UHD/Iris,
 * AMD «Radeon Graphics»/Vega iGPU): the atlas and the Pokémon textures come out
 * of the same RAM the game needs. Never throws: unknown = null / false.
 *
 * @returns {{maxTextura: number|null, renderer: string, integrada: boolean}}
 */
function infoGpu(){
    if(scGpuCache != null){
        return scGpuCache
    }
    let maxTextura = null
    let renderer = ''
    try {
        const c = document.createElement('canvas')
        const gl = c.getContext('webgl2') || c.getContext('webgl')
        if(gl){
            maxTextura = gl.getParameter(gl.MAX_TEXTURE_SIZE)
            const ext = gl.getExtension('WEBGL_debug_renderer_info')
            renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
            const lose = gl.getExtension('WEBGL_lose_context')
            if(lose){
                lose.loseContext()
            }
        }
    } catch(e){
        // Sin WebGL (aceleración desactivada): se decide solo por RAM y núcleos.
    }
    const integrada = /(intel|uhd graphics|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics)/i.test(renderer)
        && !/\barc\b/i.test(renderer)
    scGpuCache = { maxTextura: typeof maxTextura === 'number' ? maxTextura : null, renderer, integrada }
    return scGpuCache
}

/**
 * Which profile suits this PC (measured 18-10 at the title screen, live heap after
 * a full GC: PRO 2.58 GB, LITE with all skins 2.18 GB, SUPER LITE 1.70 GB with a
 * 2048² item atlas instead of 8192²).
 *  - SUPER LITE: the card cannot hold an 8192 texture; under 7 GB of RAM; or an
 *    integrated card with under 9 GB (an «8 GB» laptop reports ~7.8).
 *  - LITE: integrated card; under 10 GB of RAM; or fewer than 4 logical cores.
 *  - PRO otherwise.
 *
 * @returns {{nivel: 'pro'|'lite'|'superlite', lite: boolean, motivo: string}}
 *   lite = any light profile (older callers only knew PRO/LITE).
 */
function perfilRecomendado(totalBytes = os.totalmem(), nucleos = os.cpus().length, gpu = infoGpu()){
    const total = totalBytes / GB
    const r = (nivel, motivo) => ({ nivel, lite: nivel !== 'pro', motivo })
    if(gpu.maxTextura != null && gpu.maxTextura < 8192){
        return r('superlite', 'gpu')
    }
    if(total < 7){
        return r('superlite', 'ram')
    }
    if(gpu.integrada){
        return r(total < 9 ? 'superlite' : 'lite', 'gpu')
    }
    if(total < 10){
        return r('lite', 'ram')
    }
    if(nucleos < 4){
        return r('lite', 'cpu')
    }
    return r('pro', '')
}

/**
 * The next lighter profile id in the distribution, or null when already on the
 * lightest one available.
 *
 * @param {string} id Current server id.
 * @param {Array<{rawServer: {id: string}}>} servers distribution.servers
 * @returns {string|null}
 */
function perfilMasLigero(id, servers){
    const actual = NIVELES.indexOf(nivelDePerfil(id))
    for(let i = actual + 1; i < NIVELES.length; i++){
        const s = (servers || []).find(x => nivelDePerfil(x.rawServer.id) === NIVELES[i])
        if(s != null){
            return s.rawServer.id
        }
    }
    return null
}

/**
 * The available profile closest to the recommendation: the recommended level if
 * the distribution has it, else the lightest one that is not lighter than that
 * (an older manifest with only PRO/LITE and a SUPER LITE recommendation → LITE).
 *
 * @param {Array<{rawServer: {id: string}}>} servers distribution.servers
 * @param {string} nivel Recommended level.
 * @returns {string|null} Server id.
 */
function perfilDisponible(servers, nivel = perfilRecomendado().nivel){
    const objetivo = NIVELES.indexOf(nivel)
    let mejor = null
    let mejorNivel = -1
    for(const s of servers || []){
        const n = NIVELES.indexOf(nivelDePerfil(s.rawServer.id))
        if(n <= objetivo && n > mejorNivel){
            mejor = s.rawServer.id
            mejorNivel = n
        }
    }
    return mejor
}

/**
 * Did this game session run out of memory? Reads the end of the instance's
 * latest.log, only if it was written after the session started (a log from an
 * earlier session must not trigger anything). Needs real memory evidence: a
 * resource pack failing for another reason (bad zip) is not a memory problem.
 * On 16-10 the pack was dropped because of an OutOfMemoryError while loading it,
 * and the error is in the same log.
 *
 * @param {string} instancia Instance directory of the profile.
 * @param {number} desde Session start (ms since epoch); 0 = do not check.
 * @returns {boolean}
 */
function cierrePorMemoria(instancia, desde = 0){
    let fd = null
    try {
        const ruta = path.join(instancia, 'logs', 'latest.log')
        const st = fs.statSync(ruta)
        if(desde > 0 && st.mtimeMs < desde){
            return false
        }
        const tam = Math.min(st.size, 512 * 1024)
        fd = fs.openSync(ruta, 'r')
        const b = Buffer.alloc(tam)
        fs.readSync(fd, b, 0, tam, st.size - tam)
        return /java\.lang\.OutOfMemoryError|Java heap space|GC overhead limit exceeded/i.test(b.toString('utf8'))
    } catch(e){
        return false
    } finally {
        if(fd != null){
            try { fs.closeSync(fd) } catch(e){ /* nada */ }
        }
    }
}

/**
 * options.txt values per preset (Minecraft 1.21.1 keys). The server caps the
 * view distance anyway, so "alto" mostly buys smoother far terrain.
 */
const CALIDADES = {
    bajo: {
        renderDistance: '6', simulationDistance: '5', graphicsMode: '0', particles: '2',
        entityShadows: 'false', biomeBlendRadius: '0', mipmapLevels: '0',
        renderClouds: '"false"', entityDistanceScaling: '0.75'
    },
    medio: {
        renderDistance: '10', simulationDistance: '8', graphicsMode: '1', particles: '1',
        entityShadows: 'true', biomeBlendRadius: '2', mipmapLevels: '2',
        renderClouds: '"fast"', entityDistanceScaling: '1.0'
    },
    alto: {
        renderDistance: '14', simulationDistance: '10', graphicsMode: '1', particles: '0',
        entityShadows: 'true', biomeBlendRadius: '3', mipmapLevels: '4',
        renderClouds: '"true"', entityDistanceScaling: '1.25'
    }
}

/** Edits key:value lines keeping the file's line endings and everything else. */
function editarLineas(ruta, separador, valores){
    const raw = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : ''
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    const lineas = raw.split(/\r?\n/)
    while(lineas.length > 0 && lineas[lineas.length - 1].trim() === ''){
        lineas.pop()
    }
    for(const [clave, valor] of Object.entries(valores)){
        const i = lineas.findIndex(l => l.startsWith(clave + separador))
        if(i >= 0){
            lineas[i] = clave + separador + valor
        } else {
            lineas.push(clave + separador + valor)
        }
    }
    const tmp = ruta + '.sc-tmp'
    fs.mkdirSync(path.dirname(ruta), { recursive: true })
    fs.writeFileSync(tmp, lineas.join(eol) + eol)
    fs.renameSync(tmp, ruta)
}

/**
 * Writes a preset into the instance. Must only run with the game closed
 * (Minecraft rewrites options.txt on exit and would undo it).
 * "bajo" also turns shaders off; the other presets leave the shader choice
 * alone. Returns false when options.txt does not exist yet (first launch
 * still pending), so the caller keeps the preset pending.
 *
 * @param {string} instancia Instance directory of the profile.
 * @param {'bajo'|'medio'|'alto'} nivel
 * @returns {boolean} True if written.
 */
function aplicarCalidad(instancia, nivel){
    const valores = CALIDADES[nivel]
    if(valores == null){
        throw new Error('Calidad desconocida: ' + nivel)
    }
    const opciones = path.join(instancia, 'options.txt')
    if(!fs.existsSync(opciones)){
        return false
    }
    editarLineas(opciones, ':', valores)
    if(nivel === 'bajo'){
        const iris = path.join(instancia, 'config', 'iris.properties')
        if(fs.existsSync(iris)){
            editarLineas(iris, '=', { enableShaders: 'false' })
        }
    }
    return true
}

module.exports = { ramAutomatica, formatoJvm, formatoGb, perfilRecomendado, aplicarCalidad, CALIDADES,
    NIVELES, nivelDePerfil, infoGpu, perfilMasLigero, perfilDisponible, cierrePorMemoria }
