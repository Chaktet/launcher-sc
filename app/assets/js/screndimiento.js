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

/**
 * Which profile suits this PC. LITE up to 8 GB of RAM (PRO recommends 6 GB and an
 * 8 GB machine would only have ~5 left for it) or with fewer than 4 logical
 * cores; PRO from 12 GB.
 *
 * @returns {{lite: boolean, motivo: string}}
 */
function perfilRecomendado(totalBytes = os.totalmem(), nucleos = os.cpus().length){
    const total = totalBytes / GB
    if(total < 10){
        return { lite: true, motivo: 'ram' }
    }
    if(nucleos < 4){
        return { lite: true, motivo: 'cpu' }
    }
    return { lite: false, motivo: '' }
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

module.exports = { ramAutomatica, formatoJvm, formatoGb, perfilRecomendado, aplicarCalidad, CALIDADES }
