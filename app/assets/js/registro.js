/**
 * Registro del launcher en disco.
 *
 * El logger de helios-core solo escribe por consola, así que de un cuelgue o de
 * un fallo de login no quedaba ni rastro: el jugador no tenía nada que mandar y
 * cada reporte había que diagnosticarlo a ciegas. Aquí se le añade un fichero
 * a todos los logger y se recogen además los errores que nadie captura, que son
 * justo los que dejan la interfaz muerta.
 *
 * Este módulo tiene que cargarse ANTES que cualquier otro que pida un logger,
 * porque los módulos crean el suyo al ser importados y a esos ya no llegamos.
 */
const fs      = require('fs')
const path    = require('path')
const winston = require('winston')

const { LoggerUtil } = require('helios-core')

const CARPETA = path.join(require('@electron/remote').app.getPath('userData'), 'logs')
const FICHERO = path.join(CARPETA, 'launcher.log')

let transporte = null

function obtenerTransporte(){
    if(transporte != null){
        return transporte
    }
    try {
        fs.mkdirSync(CARPETA, { recursive: true })
        transporte = new winston.transports.File({
            filename: FICHERO,
            // De sobra para varias sesiones y sin llenarle el disco a nadie.
            maxsize: 2 * 1024 * 1024,
            maxFiles: 3,
            tailable: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                // Sin colores: los códigos ANSI en un fichero de texto son ruido
                // ilegible cuando el jugador lo abre con el bloc de notas.
                winston.format.uncolorize(),
                winston.format.printf(i => `[${i.timestamp}] [${i.level}] ${i.message}`)
            )
        })
    } catch(err) {
        console.error('No se pudo abrir el registro del launcher', err)
        transporte = false
    }
    return transporte
}

/**
 * Hace que cada logger nuevo escriba también a disco.
 */
function engancharLoggers(){
    if(LoggerUtil.__scParcheado){
        return
    }
    const original = LoggerUtil.getLogger.bind(LoggerUtil)
    LoggerUtil.getLogger = function(etiqueta){
        const logger = original(etiqueta)
        const t = obtenerTransporte()
        if(t){
            try {
                logger.add(t)
            } catch(err) {
                console.error('No se pudo enganchar el registro', err)
            }
        }
        return logger
    }
    LoggerUtil.__scParcheado = true
}

let sueltos = null

/**
 * Escribe una línea suelta, para lo que no pasa por un logger.
 *
 * Va por un logger de verdad y no llamando al transporte a pelo: winston espera
 * que el mensaje ya venga formateado en su símbolo interno, así que escribir
 * directo al transporte dejaba líneas "undefined" en el fichero.
 */
function apuntar(nivel, texto){
    const t = obtenerTransporte()
    if(!t){
        return
    }
    try {
        if(sueltos == null){
            sueltos = winston.createLogger({ transports: [t] })
        }
        sueltos.log(nivel, texto)
    } catch(_err) {
        // Si ni esto funciona, no vamos a montar un bucle de errores.
    }
}

function comoTexto(v){
    if(v instanceof Error){
        return `${v.message}\n${v.stack}`
    }
    if(typeof v === 'object' && v !== null){
        try {
            return JSON.stringify(v)
        } catch(_err) {
            return String(v)
        }
    }
    return String(v)
}

/**
 * Recoge lo que nadie captura. Las promesas rechazadas sin manejar son la causa
 * de la mitad de los bloqueos que hemos encontrado, y hasta ahora se perdían.
 */
function capturarErroresGlobales(){
    if(typeof window === 'undefined'){
        return
    }

    window.addEventListener('error', ev => {
        apuntar('error', `[sin capturar] ${ev.message} (${ev.filename}:${ev.lineno}:${ev.colno})`
            + (ev.error && ev.error.stack ? `\n${ev.error.stack}` : ''))
    })

    window.addEventListener('unhandledrejection', ev => {
        apuntar('error', `[promesa rechazada sin manejar] ${comoTexto(ev.reason)}`)
    })

    // console.error y console.warn del propio launcher: switchView, los
    // handlers del updater y la pestaña de paquetes avisan por ahí.
    for(const nivel of ['error', 'warn']){
        const orig = console[nivel].bind(console)
        console[nivel] = (...args) => {
            orig(...args)
            apuntar(nivel, args.map(comoTexto).join(' '))
        }
    }

    apuntar('info', '===== Sesión nueva del launcher =====')
}

exports.engancharLoggers = engancharLoggers
exports.capturarErroresGlobales = capturarErroresGlobales
exports.apuntar = apuntar
exports.rutaFichero = FICHERO
exports.rutaCarpeta = CARPETA
