/**
 * Java del juego: qué instalación usar, cómo saber si está entera y cómo repararla (1.17.11).
 *
 * Por qué existe (informe de un jugador del 28-10): SC-10 «Java incompleto», pulsaba
 * «Reparar Java» y volvía a salir lo mismo aunque tenía el antivirus quitado. La reparación
 * solo borraba NUESTRO runtime y dejaba el Java sin configurar; el siguiente JUGAR escaneaba
 * el sistema (JAVA_HOME, Archivos de programa, registro) y cogía cualquier Java 21 que
 * hubiera, roto incluido, sin volver a bajar el nuestro. Además, con el nuestro presente,
 * Helios prefiere a igual versión una ruta sin «jdk» y la nuestra es «jdk-21…»: un Java del
 * sistema ganaba siempre. Y el detector de SC-10 confundía con «Java roto» un fallo de
 * memoria al arrancar («Could not reserve enough space…») y cualquier mod que fallase con
 * RuntimeException (la /i hacía que «runtime» casara con «RuntimeException»).
 *
 * Reglas:
 *  - Nuestro runtime va primero siempre; un Java del sistema solo si el nuestro no sirve.
 *  - Un Java del sistema que ya dio SC-10 queda vetado: no se vuelve a elegir. Nunca se
 *    borra nada fuera de <datos>/runtime (no es nuestro).
 *  - Antes de lanzar se mira que estén los ficheros sin los que Java no arranca: si falta
 *    alguno se repara solo, sin esperar al SC-10.
 */
const fs = require('fs')
const path = require('path')

const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('ScJava')

const FICHERO = 'sc-java.json'
// Reparaciones automáticas recientes: si vuelve a romperse dentro de esta ventana, ya no es
// una descarga a medias sino algo que lo rompe cada vez (antivirus): se escala al aviso.
const VENTANA_REPETIDO = 2 * 60 * 60 * 1000
// Tras un SC-14 (nuestro Java descargado no se deja ejecutar) se acepta un Java del sistema
// durante un día: es la salida que se le da al jugador (instalar el .msi de Adoptium).
const VENTANA_BLOQUEADO = 24 * 60 * 60 * 1000

function rutaEstado(dirLauncher){
    return path.join(dirLauncher, FICHERO)
}

function leerEstado(dirLauncher){
    try {
        const d = JSON.parse(fs.readFileSync(rutaEstado(dirLauncher), 'utf8'))
        return {
            vetados: Array.isArray(d.vetados) ? d.vetados.filter(v => typeof v === 'string') : [],
            reparaciones: Array.isArray(d.reparaciones) ? d.reparaciones.filter(n => Number.isFinite(n)) : [],
            propioBloqueado: Number.isFinite(d.propioBloqueado) ? d.propioBloqueado : 0
        }
    } catch(_e){
        return { vetados: [], reparaciones: [], propioBloqueado: 0 }
    }
}

function guardarEstado(dirLauncher, estado){
    try {
        fs.writeFileSync(rutaEstado(dirLauncher), JSON.stringify(estado, null, 2))
    } catch(e){
        logger.warn('No se pudo guardar sc-java.json', e)
    }
}

function normalizar(p){
    const r = path.resolve(String(p))
    return process.platform === 'win32' ? r.toLowerCase() : r
}

/** Carpeta raíz de la instalación (la que contiene bin/ y lib/) a partir del ejecutable. */
function homeDe(exe){
    return path.dirname(path.dirname(exe))
}

/** ¿El ejecutable está dentro de <datos>/runtime? */
function esPropio(exe, dataDir){
    if(exe == null || dataDir == null){
        return false
    }
    const base = normalizar(path.join(dataDir, 'runtime')) + path.sep
    return normalizar(exe).startsWith(base)
}

/**
 * Ficheros sin los que la JVM no arranca o muere al empezar (tzdb.dat es el SC-10 de
 * siempre). Devuelve los que faltan o pesan 0, como rutas relativas. Lista vacía = entera.
 */
function faltanEsenciales(exe, plataforma = process.platform){
    if(exe == null){
        return ['(sin ejecutable)']
    }
    const home = homeDe(exe)
    const lista = plataforma === 'win32'
        ? ['bin/java.exe', 'bin/javaw.exe', 'bin/java.dll', 'bin/server/jvm.dll', 'lib/modules', 'lib/tzdb.dat', 'lib/jvm.cfg']
        : ['bin/java', plataforma === 'darwin' ? 'lib/server/libjvm.dylib' : 'lib/server/libjvm.so',
            'lib/modules', 'lib/tzdb.dat', 'lib/jvm.cfg']
    return lista.filter(rel => {
        try {
            return !(fs.statSync(path.join(home, ...rel.split('/'))).size > 0)
        } catch(_e){
            return true
        }
    })
}

/**
 * Lee la salida del juego y dice si es Java roto, y por qué (pista `x`). Los fallos de
 * memoria al arrancar NO son Java roto: tienen su propia función, que va antes.
 *
 * Los nombres de clase se buscan con mayúsculas exactas y las rutas con sus barras: con la
 * /i de antes «runtime» casaba con java.lang.RuntimeException y un mod roto salía como SC-10.
 *
 * @returns {string|null} motivo, o null si no es Java roto.
 */
function motivoJavaRoto(txt){
    const t = String(txt || '')
    const enRuntime = '([\\\\/]runtime[\\\\/]|[\\\\/]jdk-\\d)'
    if(/tzdb\.dat|Unable to load TZDB time-zone rules/.test(t)){
        return 'tzdb'
    }
    if(/could not open [`'"][^\n]*jvm\.cfg/i.test(t)){
        return 'jvmcfg'
    }
    // Solo los mensajes del lanzador de Java al no encontrar la JVM: «jvm.dll» a secas sale
    // también en el «Problematic frame» de cualquier cierre de la JVM, que no es Java roto.
    if(/missing [`'"]server[`'"] JVM|Error: could not find (java\.dll|jvm\.dll|libjvm)|Error loading: [^\n]*(jvm\.dll|libjvm)/.test(t)){
        return 'jvm'
    }
    if(/java\.lang\.NoClassDefFoundError: java\/|NoClassDefFoundError: java\/lang\//.test(t)){
        return 'clasebase'
    }
    if(new RegExp('ExceptionInInitializerError[\\s\\S]{0,200}' + enRuntime, 'i').test(t)){
        return 'inicializador'
    }
    if(new RegExp('FileNotFoundException:[^\\n]*' + enRuntime, 'i').test(t)){
        return 'fichero'
    }
    if(/Error occurred during initialization of VM/.test(t) && !esFalloDeMemoriaAlArrancar(t)){
        return 'iniciovm'
    }
    return null
}

/**
 * La JVM no pudo reservar la memoria pedida (o el -Xmx no es válido). Sale con la misma
 * línea «Error occurred during initialization of VM» que un Java roto, pero reinstalar Java
 * no lo arregla nunca: es la RAM asignada o el archivo de paginación de Windows.
 */
function esFalloDeMemoriaAlArrancar(txt){
    return /Could not reserve enough space|Too small (initial|maximum) heap|Invalid (initial|maximum) heap size|Initial heap size set to a larger value than the maximum heap size|Unable to allocate [0-9]+KB bitmaps|OutOfMemoryError/i
        .test(String(txt || ''))
}

/** Veta un Java del sistema que dio SC-10: no se vuelve a elegir. Nunca se borra. */
function vetar(dirLauncher, exe){
    if(exe == null){
        return
    }
    const estado = leerEstado(dirLauncher)
    const n = normalizar(exe)
    if(!estado.vetados.includes(n)){
        estado.vetados.push(n)
        guardarEstado(dirLauncher, estado)
        logger.warn(`Java del sistema vetado por estar roto: ${exe}`)
    }
}

function estaVetado(dirLauncher, exe){
    return exe != null && leerEstado(dirLauncher).vetados.includes(normalizar(exe))
}

/** Anota una reparación y dice si es repetida (otra en las últimas 2 h). */
function anotarReparacion(dirLauncher, ahora = Date.now()){
    const estado = leerEstado(dirLauncher)
    const recientes = estado.reparaciones.filter(t => ahora - t < VENTANA_REPETIDO)
    const repetida = recientes.length > 0
    estado.reparaciones = [...recientes, ahora].slice(-10)
    guardarEstado(dirLauncher, estado)
    return repetida
}

/** Nuestro Java no se deja ejecutar en este equipo (SC-14): un día se aceptan los del sistema. */
function marcarPropioBloqueado(dirLauncher, ahora = Date.now()){
    const estado = leerEstado(dirLauncher)
    estado.propioBloqueado = ahora
    guardarEstado(dirLauncher, estado)
}

function propioBloqueadoReciente(dirLauncher, ahora = Date.now()){
    return ahora - leerEstado(dirLauncher).propioBloqueado < VENTANA_BLOQUEADO
}

function reparacionReciente(dirLauncher, ahora = Date.now()){
    return leerEstado(dirLauncher).reparaciones.some(t => ahora - t < VENTANA_REPETIDO)
}

/**
 * Quita NUESTRO runtime para que se baje de cero. Si no se deja borrar (un java.exe colgado,
 * el antivirus escaneándolo: EBUSY/EPERM) se aparta con otro nombre, que se limpia en el
 * siguiente arranque del launcher: así la descarga nueva nunca se mezcla con lo roto.
 *
 * @returns {boolean} true si <datos>/runtime ya no existe.
 */
function quitarRuntime(dataDir){
    const runtime = path.join(dataDir, 'runtime')
    try {
        fs.rmSync(runtime, { recursive: true, force: true })
    } catch(e){
        logger.warn('No se pudo borrar runtime; se aparta con otro nombre.', e)
        try {
            fs.renameSync(runtime, path.join(dataDir, `runtime-roto-${Date.now()}`))
        } catch(e2){
            logger.error('Tampoco se pudo apartar runtime.', e2)
        }
    }
    return !fs.existsSync(runtime)
}

/** Borra las carpetas runtime-roto-* que quedaron de una reparación anterior. */
function limpiarApartados(dataDir){
    try {
        for(const n of fs.readdirSync(dataDir)){
            if(/^runtime-roto-\d+$/.test(n)){
                try {
                    fs.rmSync(path.join(dataDir, n), { recursive: true, force: true })
                } catch(_e){ /* sigue bloqueada: otro día */ }
            }
        }
    } catch(_e){ /* sin carpeta de datos todavía */ }
}

/**
 * Elige la instalación de Java: la nuestra si está y funciona. Si no, null (= descargar la
 * nuestra), salvo que se permita el sistema: tras un SC-14 reciente o si la descarga falló.
 * Del sistema, nunca una vetada ni una a la que le falten ficheros.
 *
 * Por qué no el del sistema sin más: es lo que hacía Helios, y un Java 21 del sistema roto o
 * recortado (los que traen otros programas) ganaba siempre y no se podía reparar.
 *
 * @param {object} javaGuard funciones de helios-core/java (inyectadas para poder probarlo).
 * @param {boolean} permitirSistema forzar que valga uno del sistema (la descarga falló).
 */
async function elegir(dataDir, dirLauncher, rango, javaGuard, permitirSistema = false){
    const rutas = [...new Set(await javaGuard.getValidatableJavaPaths(dataDir))]
    const ajustes = await javaGuard.resolveJvmSettings(rutas)
    const aptos = javaGuard.filterApplicableJavaPaths(ajustes, rango)
        .filter(d => {
            const exe = javaGuard.javaExecFromRoot(d.path)
            if(estaVetado(dirLauncher, exe)){
                logger.info(`Se salta un Java vetado: ${d.path}`)
                return false
            }
            const faltan = faltanEsenciales(exe)
            if(faltan.length > 0){
                logger.warn(`Se salta un Java incompleto (${faltan.join(', ')}): ${d.path}`)
                return false
            }
            return true
        })
    javaGuard.rankApplicableJvms(aptos)
    const propio = aptos.find(d => esPropio(javaGuard.javaExecFromRoot(d.path), dataDir))
    if(propio != null){
        return propio
    }
    return permitirSistema || propioBloqueadoReciente(dirLauncher) ? (aptos[0] || null) : null
}

module.exports = {
    esPropio,
    faltanEsenciales,
    motivoJavaRoto,
    esFalloDeMemoriaAlArrancar,
    vetar,
    estaVetado,
    anotarReparacion,
    reparacionReciente,
    marcarPropioBloqueado,
    propioBloqueadoReciente,
    quitarRuntime,
    limpiarApartados,
    elegir
}
