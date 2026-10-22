/**
 * Fondos del launcher (1.16.13, Felix 18-10-2026).
 *
 * El servidor irá publicando fondos nuevos. Regla: cuando sale uno nuevo, el launcher
 * se pone ese solo (aunque el jugador hubiera elegido otro); desde Ajustes → Launcher
 * cada jugador puede volver a cualquiera de los anteriores.
 *
 * - Catálogo: https://<host>/launcher/fondos/fondos.json (descargas y, si falla, la ruta
 *   directa, que funciona con el bloqueo de LaLiga). Se guarda una copia en la carpeta
 *   del launcher para arrancar sin red.
 * - El fondo que ya trae el instalador (INCLUIDO) no se descarga nunca: si el catálogo
 *   lo lista con el mismo id, se usan los ficheros locales.
 * - Las imágenes remotas se guardan en <launcher>/fondos/. Un fondo solo se pone cuando
 *   su imagen está entera en disco: nunca se queda la ventana sin fondo.
 * - Configuración: settings.launcher.fondoElegido (id o null = el más nuevo) y
 *   fondoNuevoVisto (el más nuevo que ya se aplicó una vez).
 */
const fs = require('fs')
const { pathToFileURL } = require('url')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const ConfigManager = require('./configmanager')
const { SC_HOST_PRINCIPAL, SC_HOST_DIRECTO } = require('./distromanager')

const RUTA_CATALOGO = '/launcher/fondos/fondos.json'
const RUTA_FICHEROS = '/launcher/fondos/'
const MAX_IMAGEN = 12 * 1024 * 1024
const MAX_CATALOGO = 256 * 1024
const RE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/
const RE_FICHERO = /^[a-z0-9][a-z0-9.-]{0,79}\.(webp|png|jpg)$/

// El fondo que trae el instalador: siempre disponible, sin red.
const INCLUIDO = {
    id: 'valle-2026-10',
    nombre: 'Valle Cobblemon',
    fecha: '2026-10-12',
    incluido: true,
    archivos: { 1280: 'assets/images/ui/fondo-1280.webp', 1920: 'assets/images/ui/fondo-1920.webp' }
}

function dirFondos(){
    return path.join(ConfigManager.getLauncherDirectory(), 'fondos')
}

function rutaCatalogoLocal(){
    return path.join(dirFondos(), 'fondos.json')
}

/** Valida un catálogo remoto: lo que no tenga la forma esperada se descarta entero o por fondo. */
function validar(datos){
    if(datos == null || !Array.isArray(datos.fondos)){
        return null
    }
    const vistos = new Set()
    const fondos = []
    for(const f of datos.fondos.slice(0, 100)){
        if(f == null || !RE_ID.test(String(f.id)) || vistos.has(f.id) || typeof f.nombre !== 'string'
            || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha)) || f.archivos == null){
            continue
        }
        const archivos = {}
        for(const ancho of ['1280', '1920']){
            if(RE_FICHERO.test(String(f.archivos[ancho] || ''))){
                archivos[ancho] = f.archivos[ancho]
            }
        }
        if(!archivos['1280'] && !archivos['1920']){
            continue
        }
        const sha = {}
        for(const k of Object.keys(archivos)){
            const s = f.sha256 && f.sha256[k]
            if(/^[0-9a-f]{64}$/.test(String(s || ''))){
                sha[k] = s
            }
        }
        vistos.add(f.id)
        fondos.push({ id: f.id, nombre: f.nombre.slice(0, 60), fecha: f.fecha, archivos, sha256: sha })
    }
    return fondos
}

/** Catálogo que se conoce ahora (copia local + el incluido), del más antiguo al más nuevo. */
function catalogo(){
    let remotos = []
    try {
        remotos = validar(JSON.parse(fs.readFileSync(rutaCatalogoLocal(), 'utf8'))) || []
    } catch { /* sin copia: solo el incluido */ }
    const lista = remotos.map(f => f.id === INCLUIDO.id ? { ...INCLUIDO, nombre: f.nombre } : f)
    if(!lista.some(f => f.id === INCLUIDO.id)){
        lista.push(INCLUIDO)
    }
    // Por fecha; a igual fecha manda el orden del catálogo.
    return lista.map((f, i) => ({ f, i })).sort((a, b) => a.f.fecha.localeCompare(b.f.fecha) || a.i - b.i).map(x => x.f)
}

function masNuevo(lista){
    return lista[lista.length - 1]
}

function anchoPreferido(){
    return (typeof window !== 'undefined' && window.innerWidth * window.devicePixelRatio > 1400) ? '1920' : '1280'
}

/** Ruta de la imagen lista para usar (file:// o relativa), o null si aún no está en disco. */
function imagen(fondo, ancho = anchoPreferido()){
    if(fondo == null){
        return null
    }
    const orden = ancho === '1920' ? ['1920', '1280'] : ['1280', '1920']
    for(const a of orden){
        const nombre = fondo.archivos[a]
        if(!nombre){
            continue
        }
        if(fondo.incluido){
            return nombre
        }
        const local = path.join(dirFondos(), nombre)
        if(fs.existsSync(local)){
            // pathToFileURL codifica #, %, espacios y acentos de la carpeta del usuario (revisión de Codex).
            return pathToFileURL(local).href
        }
    }
    return null
}

function disponible(fondo){
    return imagen(fondo) != null
}

/** Miniatura para el selector: la imagen local si ya está; si no, la de 1280 desde descargas. */
function miniatura(fondo){
    const local = imagen(fondo, '1280')
    if(local != null){
        return local
    }
    const nombre = fondo.archivos['1280'] || fondo.archivos['1920']
    return `https://${SC_HOST_PRINCIPAL}${RUTA_FICHEROS}${encodeURIComponent(nombre)}`
}

/**
 * El fondo que toca ahora. Si el más nuevo no se ha aplicado nunca y ya está en disco,
 * pasa a ser el que se usa (se olvida la elección anterior): así sale solo el fondo
 * nuevo y el jugador puede volver al viejo desde Ajustes.
 */
function efectivo(){
    const lista = catalogo()
    const nuevo = masNuevo(lista)
    if(nuevo.id !== ConfigManager.getFondoNuevoVisto() && disponible(nuevo)){
        ConfigManager.setFondoNuevoVisto(nuevo.id)
        ConfigManager.setFondoElegido(null)
        ConfigManager.save()
    }
    const elegido = ConfigManager.getFondoElegido()
    const visto = lista.find(f => f.id === ConfigManager.getFondoNuevoVisto())
    const candidatos = [lista.find(f => f.id === elegido), visto, nuevo, INCLUIDO]
    return candidatos.find(f => f != null && disponible(f)) || INCLUIDO
}

/** Pone un fondo en la ventana cuando su imagen ya está cargada (sin parpadeo a negro). */
function aplicar(fondo = efectivo()){
    const src = imagen(fondo)
    if(src == null || typeof document === 'undefined'){
        return Promise.resolve(false)
    }
    return new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
            document.body.style.backgroundImage = `url("${src}")`
            // Diseño PokéNav (1.17): la ventana es la carcasa roja y el fondo se ve dentro de los
            // marcos de la portada y la entrada, que lo leen de esta variable.
            document.documentElement.style.setProperty('--sc-fondo', `url("${src}")`)
            document.body.setAttribute('data-sc-fondo', fondo.id)
            // Ajustes repinta sus tarjetas (también cuando el cambio es el automático).
            window.dispatchEvent(new CustomEvent('sc-fondo-cambiado', { detail: fondo.id }))
            resolve(true)
        }
        img.onerror = () => resolve(false)
        img.src = src
    })
}

// Cada elección invalida las anteriores que aún estén descargando: si el jugador pulsa
// A (bajando) y después B, al terminar A no se pone encima de B (revisión de Codex).
let eleccionVigente = 0

/** Elección del jugador desde Ajustes. null = seguir siempre el más nuevo. */
function elegir(id){
    const lista = catalogo()
    const f = lista.find(x => x.id === id)
    ConfigManager.setFondoElegido(f != null && f.id !== masNuevo(lista).id ? f.id : null)
    ConfigManager.save()
    const turno = ++eleccionVigente
    const destino = f || efectivo()
    return descargar(destino).then(() => turno === eleccionVigente ? aplicar(destino) : false)
}

function pedir(host, ruta, max){
    return new Promise((resolve, reject) => {
        const req = https.get({ host, path: ruta, timeout: 15000, headers: { 'User-Agent': 'SC-Launcher' } }, res => {
            if(res.statusCode !== 200){
                res.resume()
                reject(new Error('HTTP ' + res.statusCode))
                return
            }
            const partes = []
            let total = 0
            res.on('data', d => {
                total += d.length
                if(total > max){
                    req.destroy(new Error('demasiado grande'))
                    return
                }
                partes.push(d)
            })
            res.on('end', () => resolve(Buffer.concat(partes)))
            res.on('error', reject)
        })
        req.on('timeout', () => req.destroy(new Error('timeout')))
        req.on('error', reject)
    })
}

/** Primero descargas; si no responde (bloqueo de LaLiga, Cloudflare), la ruta directa. */
function pedirConRespaldo(ruta, max){
    return pedir(SC_HOST_PRINCIPAL, ruta, max).catch(() => pedir(SC_HOST_DIRECTO, ruta, max))
}

function escribirAtomico(destino, datos){
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    const tmp = destino + '.' + process.pid + '.tmp'
    fs.writeFileSync(tmp, datos)
    fs.renameSync(tmp, destino)
}

/** ¿Los primeros bytes son de verdad una imagen (WebP, PNG o JPEG)? Un 200 con una página de error no lo es. */
function pareceImagen(datos){
    if(!Buffer.isBuffer(datos) || datos.length < 16){
        return false
    }
    const webp = datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WEBP'
    const png = datos[0] === 0x89 && datos.toString('ascii', 1, 4) === 'PNG'
    const jpg = datos[0] === 0xFF && datos[1] === 0xD8
    return webp || png || jpg
}

/**
 * Baja las imágenes de un fondo que falten (con su sha256 si el catálogo lo da). Basta
 * con UNA resolución en disco: si la otra no baja (sin red), el fondo sigue siendo
 * elegible con la que hay (revisión de Codex). Solo falla si no queda ninguna.
 */
async function descargar(fondo){
    if(fondo == null || fondo.incluido){
        return true
    }
    let ultimoError = null
    for(const [ancho, nombre] of Object.entries(fondo.archivos)){
        const local = path.join(dirFondos(), nombre)
        if(fs.existsSync(local)){
            continue
        }
        try {
            const datos = await pedirConRespaldo(RUTA_FICHEROS + nombre, MAX_IMAGEN)
            const esperado = fondo.sha256 && fondo.sha256[ancho]
            if(esperado && crypto.createHash('sha256').update(datos).digest('hex') !== esperado){
                throw new Error('sha256 distinto en ' + nombre)
            }
            if(!pareceImagen(datos)){
                throw new Error('no es una imagen: ' + nombre)
            }
            escribirAtomico(local, datos)
        } catch(e){
            ultimoError = e
        }
    }
    if(!disponible(fondo)){
        throw ultimoError || new Error('fondo no disponible: ' + fondo.id)
    }
    return true
}

/**
 * Al arrancar, en segundo plano: catálogo nuevo, imagen del más nuevo y, si con eso
 * cambia el fondo que toca, se pone sin reiniciar. Nunca lanza: sin red sigue el de antes.
 *
 * @returns {Promise<object[]>} El catálogo resultante.
 */
async function refrescar(){
    try {
        const crudo = await pedirConRespaldo(RUTA_CATALOGO, MAX_CATALOGO)
        if(validar(JSON.parse(crudo.toString('utf8'))) != null){
            escribirAtomico(rutaCatalogoLocal(), crudo)
        }
    } catch { /* sin red o catálogo raro: la copia anterior vale */ }
    try {
        const antes = typeof document !== 'undefined' ? document.body.getAttribute('data-sc-fondo') : null
        await descargar(masNuevo(catalogo()))
        const ahora = efectivo()
        if(ahora.id !== antes){
            await aplicar(ahora)
        }
    } catch { /* la imagen nueva no bajó: se intenta en el próximo arranque */ }
    return catalogo()
}

module.exports = { INCLUIDO, catalogo, masNuevo, efectivo, aplicar, elegir, refrescar, descargar, disponible, imagen, miniatura }
