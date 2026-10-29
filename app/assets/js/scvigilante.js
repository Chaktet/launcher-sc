/**
 * Lado del launcher del vigilante (scvigilanteproceso.js). Plan: docs/PLAN-VIGILANTE.md.
 *
 * lanzar() arranca el vigilante, que lanza Minecraft como hijo suyo, y devuelve un `juego`
 * con lo que landing.js usa del ChildProcess de antes (stdout/stderr, exit/close/error).
 * Con el juego cargado el launcher se cierra entero; al cerrarse el juego el vigilante deja el
 * resultado en disco y reclamarResultados() lo recoge en el siguiente arranque.
 *
 * Sin nada de Electron arriba: carpetaDe() y hayVigilanteVivo() los usa también index.js.
 */
const child_process = require('child_process')
const crypto        = require('crypto')
const EventEmitter  = require('events')
const fs            = require('fs')
const path          = require('path')

// Sin pid de Java en este tiempo se mata el árbol del vigilante y se lanza directo.
const ESPERA_LANZADO_MS = 15000
const ESPERA_RESPUESTA_MS = 3000
// Resultados y marcas que nadie recogió (launcher desinstalado y reinstalado, PC apagado...).
const MAX_EDAD_RESULTADO_MS = 7 * 24 * 3600 * 1000

function carpetaDe(instancias){
    return path.join(instancias, 'sc-vigilante')
}
exports.carpetaDe = carpetaDe

function vive(pid){
    try {
        process.kill(pid, 0)
        return true
    } catch(e){
        return e.code === 'EPERM'
    }
}

/**
 * ¿Hay un vigilante vivo con su juego? Lo pregunta index.js antes de instalar una
 * actualización: el instalador NSIS mata todos los «SC Launcher.exe», vigilante incluido.
 */
exports.hayVigilanteVivo = function(instancias){
    if(instancias == null){
        return false
    }
    try {
        for(const f of fs.readdirSync(carpetaDe(instancias))){
            if(!/^vivo-[0-9a-f]+\.json$/.test(f)){
                continue
            }
            try {
                const d = JSON.parse(fs.readFileSync(path.join(carpetaDe(instancias), f), 'utf8'))
                if(Number.isInteger(d.pid) && vive(d.pid)){
                    return true
                }
            } catch(_e){
                // Marca a medio escribir: la siguiente vuelta la verá bien.
            }
        }
    } catch(_e){
        // Sin carpeta: nunca hubo vigilante.
    }
    return false
}

function errorDe(plano){
    const e = new Error(plano && plano.message ? plano.message : 'Error del vigilante')
    if(plano != null){
        for(const k of ['code', 'errno', 'syscall', 'path']){
            if(plano[k] != null){
                e[k] = plano[k]
            }
        }
        if(plano.stack){
            e.stack = plano.stack
        }
    }
    return e
}

function regexPlana(r){
    return r == null ? null : { source: r.source, flags: r.flags }
}

/**
 * Mata el vigilante y todo lo que haya lanzado (un Java incluido).
 * @returns {Promise<boolean>} true solo si consta que el vigilante murió y taskkill no falló
 * (con /T mata el árbol entero); con false NO se puede lanzar directo: habría dos Minecraft.
 */
function matarArbol(hijo){
    return new Promise((resolve) => {
        if(hijo.exitCode != null || hijo.signalCode != null){
            resolve(true)
            return
        }
        let muerto = false
        let killOk = null
        const decidir = () => {
            if(muerto && killOk != null){
                clearTimeout(fin)
                resolve(killOk)
            }
        }
        const fin = setTimeout(() => resolve(false), 10000)
        hijo.once('exit', () => {
            muerto = true
            decidir()
        })
        child_process.execFile('taskkill', ['/T', '/F', '/PID', String(hijo.pid)], { windowsHide: true }, (err) => {
            // Si el vigilante murió solo entre medias, taskkill no lo encuentra (128): no queda árbol.
            killOk = err == null || err.code === 128
            decidir()
        })
    })
}

/**
 * Lanza Minecraft a través del vigilante.
 *
 * @returns {Promise<EventEmitter>} El juego, ya con pid. Rechaza con `err.sinVigilante = true`
 * si el vigilante no funciona (lanzar directo es seguro: no quedó ningún Java), o con el error
 * de Java (`err.errorJava = true`) si fue Java el que no arrancó.
 */
exports.lanzar = function(o){
    const { app } = require('@electron/remote')
    const runId = crypto.randomBytes(8).toString('hex')
    const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' })
    fs.mkdirSync(carpetaDe(o.instancias), { recursive: true })

    let hijo
    try {
        hijo = child_process.fork(path.join(__dirname, 'scvigilanteproceso.js'), [], {
            execPath: process.execPath,
            // Un cwd real: dentro del app.asar no se puede.
            cwd: o.instancias,
            env,
            detached: true,
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            windowsHide: true
        })
    } catch(e){
        e.sinVigilante = true
        return Promise.reject(e)
    }
    hijo.unref()

    const juego = new EventEmitter()
    juego.runId = runId
    juego.pid = null
    juego.vigilante = true
    juego.stdout = new EventEmitter()
    juego.stderr = new EventEmitter()
    juego.stdout.setEncoding = () => {}
    juego.stderr.setEncoding = () => {}
    let cerrado = false

    const enviar = (msg) => {
        try {
            if(hijo.connected){
                hijo.send(msg, () => {})
                return true
            }
        } catch(_e){
            // Vigilante caído: lo cuenta 'exit'.
        }
        return false
    }
    const esperar = (tipo) => new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            hijo.removeListener('message', oir)
            reject(new Error('El vigilante no respondió a ' + tipo))
        }, ESPERA_RESPUESTA_MS)
        const oir = (m) => {
            if(m && m.tipo === tipo){
                clearTimeout(t)
                hijo.removeListener('message', oir)
                resolve()
            }
        }
        hijo.on('message', oir)
    })

    /** La partida cargó (decisión del renderer): el vigilante lo anota antes de que nos vayamos. */
    juego.marcarCargado = () => {
        const p = esperar('cargado-ok')
        enviar({ tipo: 'cargado' })
        return p
    }
    /** El launcher se cierra por el juego: al terminar, el vigilante lo volverá a abrir. */
    juego.saliendoPorJuego = () => {
        const p = esperar('saliendo-ok')
        enviar({ tipo: 'saliendo-por-juego' })
        return p
    }
    /** Resultado procesado en vivo: el vigilante ya no tiene que relanzar nada. */
    juego.consumido = () => enviar({ tipo: 'consumido', runId })

    return new Promise((resolve, reject) => {
        let resuelto = false
        const sinVigilante = (motivo) => {
            if(resuelto){
                return
            }
            resuelto = true
            matarArbol(hijo).then((seguro) => {
                const e = new Error('Vigilante no disponible: ' + motivo + (seguro ? '' : ' (y no se pudo confirmar que muriera)'))
                // Sin confirmar la muerte del árbol no hay respaldo: podría quedar un Java vivo.
                e.sinVigilante = seguro
                reject(e)
            })
        }
        const tLanzado = setTimeout(() => sinVigilante('sin respuesta en ' + ESPERA_LANZADO_MS + ' ms'), ESPERA_LANZADO_MS)

        hijo.on('error', (e) => {
            clearTimeout(tLanzado)
            sinVigilante(e.message)
        })
        hijo.on('exit', (code) => {
            clearTimeout(tLanzado)
            if(!resuelto){
                sinVigilante('terminó con código ' + code)
            } else if(!cerrado){
                // Vigilante caído con el juego quizá vivo: ya no hay quien avise del cierre.
                juego.emit('perdido')
            }
        })
        hijo.on('message', (m) => {
            if(m == null || typeof m !== 'object'){
                return
            }
            switch(m.tipo){
                case 'lanzado':
                    clearTimeout(tLanzado)
                    if(resuelto){
                        return
                    }
                    resuelto = true
                    juego.pid = m.pid
                    resolve(juego)
                    break
                case 'error':
                    if(!resuelto && m.origen !== 'java'){
                        // Fallo del propio vigilante antes del spawn (disco lleno...): respaldo.
                        clearTimeout(tLanzado)
                        sinVigilante(m.error && m.error.message)
                    } else if(!resuelto){
                        clearTimeout(tLanzado)
                        resuelto = true
                        const e = errorDe(m.error)
                        e.errorJava = true
                        reject(e)
                    } else {
                        juego.emit('error', errorDe(m.error))
                    }
                    break
                case 'stdout':
                case 'stderr':
                    juego[m.tipo].emit('data', m.data)
                    break
                case 'exit':
                    juego.emit('exit', m.code, m.signal)
                    break
                case 'cierre':
                    cerrado = true
                    juego.emit('close', m.resultado.code, m.resultado.signal, m.resultado)
                    break
            }
        })

        enviar({ tipo: 'lanzar', opciones: {
            runId,
            exe: o.exe,
            args: o.args,
            cwd: o.cwd,
            env: o.env,
            tempNativePath: o.tempNativePath,
            instancias: o.instancias,
            servidorId: o.servidorId,
            perfil: o.perfil,
            inicioPartida: o.inicioPartida,
            exeLauncher: process.execPath,
            // Proceso principal: el vigilante espera a que muera antes de reabrir (si no, el bloqueo
            // de instancia única mandaría la apertura a un launcher que se está cerrando).
            pidLauncher: require('@electron/remote').process.pid,
            // En desarrollo el exe es electron.exe y necesita la carpeta de la app.
            argsLauncher: app.isPackaged ? [] : [app.getAppPath()],
            raizApp: app.getAppPath(),
            discord: o.discord,
            reConectando: regexPlana(o.reConectando),
            reServidorUnido: regexPlana(o.reServidorUnido),
            reJuegoUnido: regexPlana(o.reJuegoUnido)
        } })
    })
}

/*
 * Reclamar un resultado (una partida = un runId), revisión de Codex 29-10:
 *   resultado-<runId>.json  --rename-->  resultado-<runId>.json.procesando-<pid>  (lo tiene ESA instancia)
 *   y al terminar el diagnóstico           hecho-<runId>                          (marca de consumido)
 * El renombrado es atómico: solo una instancia gana. La marca «hecho» distingue «ya lo procesó
 * otro» de «nunca llegó a escribirse». Una reclamación de una instancia que murió a medias (su
 * pid ya no vive) se recupera en el siguiente arranque, así el aviso no se pierde.
 */
const RE_PROCESANDO = /^resultado-([0-9a-f]+)\.json\.procesando-(\d+)$/

function rutaResultado(instancias, runId){
    return path.join(carpetaDe(instancias), 'resultado-' + runId + '.json')
}

function rutaHecho(instancias, runId){
    return path.join(carpetaDe(instancias), 'hecho-' + runId)
}

function hayReclamacion(instancias, runId){
    try {
        return fs.readdirSync(carpetaDe(instancias)).some(f => {
            const m = RE_PROCESANDO.exec(f)
            return m != null && m[1] === runId
        })
    } catch(_e){
        return false
    }
}

/**
 * Resultados de partidas que terminaron sin el launcher delante, ya reclamados por esta
 * instancia. Hay que cerrar cada uno con terminarResultado() cuando su aviso se haya dado.
 *
 * @returns {Array<Object>} Resultados, del más antiguo al más nuevo.
 */
exports.reclamarResultados = function(instancias){
    const carpeta = carpetaDe(instancias)
    const ahora = Date.now()
    const salida = []
    let ficheros
    try {
        ficheros = fs.readdirSync(carpeta)
    } catch(_e){
        return salida
    }
    for(const f of ficheros){
        const ruta = path.join(carpeta, f)
        try {
            const edad = ahora - fs.statSync(ruta).mtimeMs
            if(/\.tmp-\d+$/.test(f) || /^hecho-[0-9a-f]+$/.test(f)){
                if(edad > MAX_EDAD_RESULTADO_MS){
                    fs.rmSync(ruta, { force: true })
                }
                continue
            }
            if(/^vivo-[0-9a-f]+\.json$/.test(f)){
                const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
                if(!Number.isInteger(d.pid) || !vive(d.pid)){
                    fs.rmSync(ruta, { force: true })
                }
                continue
            }
            let origen = null
            const m = RE_PROCESANDO.exec(f)
            if(m != null){
                // De una instancia que murió a medias: se recupera. Si sigue viva, es suya.
                if(Number(m[2]) === process.pid || vive(Number(m[2]))){
                    continue
                }
                origen = ruta
            } else if(/^resultado-[0-9a-f]+\.json$/.test(f)){
                origen = ruta
            } else {
                continue
            }
            if(edad > MAX_EDAD_RESULTADO_MS){
                fs.rmSync(ruta, { force: true })
                continue
            }
            const runId = /^resultado-([0-9a-f]+)\.json/.exec(f)[1]
            if(fs.existsSync(rutaHecho(instancias, runId))){
                fs.rmSync(ruta, { force: true })
                continue
            }
            const reclamado = rutaResultado(instancias, runId) + '.procesando-' + process.pid
            fs.renameSync(origen, reclamado)
            salida.push(JSON.parse(fs.readFileSync(reclamado, 'utf8')))
        } catch(_e){
            // Otra instancia lo reclamó primero, o está a medio escribir.
        }
    }
    return salida.sort((a, b) => (a.fin || 0) - (b.fin || 0))
}

/**
 * Reclama el resultado que acaba de llegar en vivo. false si otra instancia (un launcher
 * reabierto a mano) ya lo tiene o lo terminó: entonces lo explica ella.
 */
exports.reclamarUno = function(instancias, runId){
    if(fs.existsSync(rutaHecho(instancias, runId)) || hayReclamacion(instancias, runId)){
        return false
    }
    try {
        fs.renameSync(rutaResultado(instancias, runId), rutaResultado(instancias, runId) + '.procesando-' + process.pid)
        return true
    } catch(e){
        // Sin fichero, sin reclamación y sin «hecho»: el vigilante no pudo escribirlo (disco lleno).
        // Se vuelve a mirar por si otra instancia lo cogió en este mismo instante.
        return e.code === 'ENOENT' && !hayReclamacion(instancias, runId) && !fs.existsSync(rutaHecho(instancias, runId))
    }
}

/** El aviso de esta partida ya se dio: se cierra la reclamación y no vuelve a salir. */
exports.terminarResultado = function(instancias, runId){
    try {
        fs.writeFileSync(rutaHecho(instancias, runId), '')
    } catch(_e){
        // Sin marca, la reclamación de abajo se borra igual.
    }
    try {
        fs.rmSync(rutaResultado(instancias, runId) + '.procesando-' + process.pid, { force: true })
    } catch(_e){
        // Nada.
    }
}
