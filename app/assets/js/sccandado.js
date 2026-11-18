/**
 * Candados de fichero: saber si un proceso nuestro sigue vivo SIN preguntar a Windows por él.
 *
 * Hasta la 1.17.23 la identidad de un proceso (¿ese PID sigue siendo nuestro Java, nuestro
 * vigilante?) se sacaba lanzando PowerShell oculto (WMI, Win32_Process) y `tasklist`. Un
 * programa que abre PowerShell escondido para mirar otros procesos es justo lo que puntúan los
 * antivirus, y VirusTotal lo etiquetaba («calls-wmi»). Felix, 17-11-2026: fuera.
 *
 * Ahora cada proceso que interesa mantiene abierto EN EXCLUSIVA un fichero `.lock`:
 *  - el vigilante y el launcher abren el suyo y no lo cierran hasta morir;
 *  - el juego lo HEREDA al nacer (va como descriptor extra del spawn): Java ni lo mira, pero
 *    Windows lo mantiene abierto hasta que el proceso termina, muera como muera.
 * Mientras el dueño vive, nadie más puede abrir ni borrar el fichero (EBUSY). Cuando muere,
 * Windows lo suelta solo. No depende del PID, así que un PID reciclado tras un apagón ya no
 * engaña a nadie (el fallo de «Actualizando el launcher… Casi listo» de la 1.17.21).
 *
 * Solo Windows: en Mac y Linux abrir() devuelve null y cada llamador sigue con lo que hacía.
 * Solo Node (lo usa también scvigilanteproceso.js, que no tiene Electron).
 */
const fs   = require('fs')
const path = require('path')

// UV_FS_O_EXLOCK de libuv: en Windows abre sin compartir (ni lectura, ni escritura, ni borrado).
// Node no lo publica en fs.constants, pero pasa las banderas tal cual a libuv.
const EXLOCK = 0x10000000

exports.disponible = process.platform === 'win32'

/**
 * Crea (o reabre) el fichero y lo deja abierto en exclusiva.
 *
 * @returns {number|null} El descriptor, que hay que mantener abierto; null si no se pudo.
 */
exports.abrir = function(ruta){
    if(!exports.disponible){
        return null
    }
    // Un antivirus puede tener el fichero recién creado abierto un instante.
    for(let i = 0; i < 3; i++){
        try {
            return fs.openSync(ruta, fs.constants.O_RDWR | fs.constants.O_CREAT | EXLOCK)
        } catch(_e){
            // Se reintenta.
        }
    }
    return null
}

/** Cierra un descriptor de abrir() sin lanzar nunca. */
exports.cerrar = function(fd){
    if(fd == null){
        return
    }
    try {
        fs.closeSync(fd)
    } catch(_e){
        // Ya cerrado.
    }
}

/**
 * ¿Lo tiene abierto alguien? true = su dueño vive; false = nadie (o no existe);
 * null = no se pudo saber (el llamador decide con su regla de respaldo).
 */
exports.ocupado = function(ruta){
    if(!exports.disponible){
        return null
    }
    try {
        fs.closeSync(fs.openSync(ruta, 'r'))
        return false
    } catch(e){
        if(e.code === 'EBUSY'){
            return true
        }
        return e.code === 'ENOENT' ? false : null
    }
}

/** Borra el candado si nadie lo tiene; con dueño vivo Windows no deja y no pasa nada. */
exports.borrar = function(ruta){
    try {
        fs.unlinkSync(ruta)
    } catch(_e){
        // Ocupado o inexistente.
    }
}

/**
 * Candado para un juego que va a nacer: se pasa `fd` como descriptor extra del spawn y, hecho
 * el spawn, se llama a soltar(). El juego se queda con su copia hasta que termina.
 *
 * @returns {{ruta: string, fd: number}|null}
 */
exports.paraJuego = function(carpeta, id){
    if(!exports.disponible){
        // Mac y Linux: ni carpeta ni fichero; todo sigue como antes.
        return null
    }
    try {
        fs.mkdirSync(carpeta, { recursive: true })
    } catch(_e){
        return null
    }
    const ruta = path.join(carpeta, 'juego-' + id + '.lock')
    const fd = exports.abrir(ruta)
    return fd == null ? null : { ruta, fd }
}

/** stdio del spawn del juego: las tres tuberías de siempre y, si hay candado, el descriptor. */
exports.stdio = function(candado){
    return candado == null ? 'pipe' : ['pipe', 'pipe', 'pipe', candado.fd]
}

/** Cierra la copia del padre (la del juego sigue abierta). */
exports.soltar = function(candado){
    if(candado != null){
        exports.cerrar(candado.fd)
    }
}
