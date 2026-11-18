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
const os            = require('os')
const path          = require('path')

const ScCandado    = require('./sccandado')

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

// Sin candado al que preguntar, solo se cree a una marca reciente.
const MAX_SIN_VERIFICAR_MS = 12 * 3600 * 1000

/**
 * ¿Sigue vivo el proceso nuestro (un vigilante, o un launcher) que dejó una marca?
 *
 * 1.17.22: antes bastaba con vive(pid), y EPERM contaba como vivo. Si el PC se apagaba o el
 * juego moría de golpe, la marca vivo-*.json se quedaba; tras reiniciar, Windows daba ese PID a
 * un servicio del sistema (EPERM) o a otro programa, y el launcher creía para siempre que había
 * una partida en curso: se negaba a instalar la actualización y muchos jugadores se quedaron en
 * «Actualizando el launcher… Casi listo» sin poder ni actualizar ni jugar (07-11-2026).
 *
 * 1.17.24: en Windows lo dice el candado del proceso (sccandado.js), no su PID. Antes se
 * preguntaba con `tasklist`; un programa que lista procesos a escondidas es lo que puntúan los
 * antivirus (Felix 17-11-2026).
 *
 * @param {number} pid PID anotado.
 * @param {number} desde Cuándo se anotó (ms).
 * @param {string|null} candado Ruta del candado de ese proceso, o null si no dejó ninguno.
 */
function esNuestro(pid, desde, candado){
    if(!Number.isInteger(pid) || pid <= 0){
        return false
    }
    if(candado != null){
        const o = ScCandado.ocupado(candado)
        if(o != null){
            return o
        }
    }
    try {
        // El vigilante corre con el mismo usuario que el launcher: EPERM nunca es nuestro.
        process.kill(pid, 0)
    } catch(_e){
        return false
    }
    if(process.platform !== 'win32'){
        return true
    }
    // Y nunca una marca anterior al último arranque del PC: su proceso no puede seguir vivo.
    return Number.isFinite(desde) && desde > Date.now() - os.uptime() * 1000
        && Date.now() - desde < MAX_SIN_VERIFICAR_MS
}
exports.esNuestro = esNuestro

function candadoVigilante(carpeta, runId){
    return path.join(carpeta, 'vivo-' + runId + '.lock')
}

/** ¿Vive el vigilante de la marca `d` (el contenido de un vivo-<runId>.json)? */
function vigilanteVivo(carpeta, d){
    return esNuestro(d.pid, d.desde, d.candado === true ? candadoVigilante(carpeta, d.runId) : null)
}

/*
 * Candado de ESTA instancia del launcher: quien reclama un resultado deja su PID en el nombre
 * del fichero, y otra instancia sabe por este candado si el reclamante sigue vivo.
 */
const candadosPropios = new Map()
// Identidad de esta instancia: al azar y no el PID, que Windows recicla (un launcher nuevo con el
// PID de uno que murió a medias se creería dueño de su reclamación; revisión de Codex 17-11).
const INSTANCIA = crypto.randomBytes(8).toString('hex')

function candadoLauncher(carpeta, id){
    return path.join(carpeta, 'launcher-' + id + '.lock')
}

/**
 * Sufijo de las reclamaciones de esta instancia: «<pid>-<instancia>» si tiene candado (y entonces
 * manda el candado), o solo «<pid>» si no se pudo abrir o no es Windows (manda el PID, como antes).
 */
function sufijoPropio(carpeta){
    if(!candadosPropios.has(carpeta)){
        // Se queda abierto hasta que este proceso muera. null si no se pudo (o no es Windows).
        candadosPropios.set(carpeta, ScCandado.abrir(candadoLauncher(carpeta, INSTANCIA)))
    }
    return candadosPropios.get(carpeta) != null ? process.pid + '-' + INSTANCIA : String(process.pid)
}

// Reclamación de un launcher sin candado en Windows: solo se respeta un rato.
const MAX_RECLAMACION_SIN_CANDADO_MS = 10 * 60 * 1000

/**
 * ¿Sigue vivo el launcher que reclamó un resultado hace `edad` ms?
 * Con `id` (reclamó teniendo candado) lo dice el candado y nada más: si ya no está ocupado, o ni
 * existe porque la limpieza se lo llevó, murió.
 */
function launcherVivo(carpeta, pid, id, edad){
    if(id != null){
        const o = ScCandado.ocupado(candadoLauncher(carpeta, id))
        if(o != null){
            return o
        }
    }
    return vive(pid) && (process.platform !== 'win32' || edad < MAX_RECLAMACION_SIN_CANDADO_MS)
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
            // Un juego con su candado ocupado cuenta aunque su vigilante haya muerto (o se lanzara
            // sin él): instalar la actualización con Minecraft abierto es justo lo que se evita.
            if(/^juego-[0-9a-f]+\.lock$/.test(f) && ScCandado.ocupado(path.join(carpetaDe(instancias), f)) === true){
                return true
            }
            if(!/^vivo-[0-9a-f]+\.json$/.test(f)){
                continue
            }
            try {
                const d = JSON.parse(fs.readFileSync(path.join(carpetaDe(instancias), f), 'utf8'))
                if(vigilanteVivo(carpetaDe(instancias), d)){
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
 * Termina un proceso sin lanzar nunca. En Windows process.kill() es TerminateProcess, lo mismo
 * que hacía `taskkill /F` hasta la 1.17.23 pero sin abrir otro programa para hacerlo.
 */
function matar(pid){
    try {
        process.kill(pid)
    } catch(_e){
        // Ya no existe.
    }
}

/**
 * Espera a que un candado quede libre (Windows suelta los ficheros de un proceso muerto unos
 * milisegundos después de que deje de existir). Devuelve el último ocupado(): true/false/null.
 */
async function esperarLibre(ruta, ms){
    const fin = Date.now() + ms
    let o = ScCandado.ocupado(ruta)
    while(o === true && Date.now() < fin){
        await new Promise(r => setTimeout(r, 100))
        o = ScCandado.ocupado(ruta)
    }
    return o
}

/**
 * ¿Consta que este intento no dejó ningún Java vivo? Lo dice la marca vivo-<runId>.json del
 * vigilante (scvigilanteproceso.js): sin marca, o no llegó al spawn o la borró al terminar
 * limpio; «lanzando» sin pid = pudo nacer un Java que nadie conoce; con su pid, se comprueba
 * (y si vive, se mata y se vuelve a comprobar).
 */
async function sinJavaVivo(rutaVivo){
    let d
    try {
        d = JSON.parse(fs.readFileSync(rutaVivo, 'utf8'))
    } catch(e){
        if(e.code !== 'ENOENT'){
            return false
        }
        // Sin marca. Si alguien la borró con el Java vivo (la limpieza, al ver muerto al vigilante),
        // el candado del juego de este intento lo delata.
        const m = /vivo-([0-9a-f]+)\.json$/.exec(rutaVivo)
        if(m == null || !ScCandado.disponible){
            return true
        }
        // Solo con un «libre» claro: si el candado no se deja consultar, no hay respaldo.
        return ScCandado.ocupado(path.join(path.dirname(rutaVivo), 'juego-' + m[1] + '.lock')) === false
    }
    if(typeof d.candadoJuego === 'string'){
        // Aquí el vigilante ya murió: el único que puede tener el candado del juego es Java. Lo dice
        // desde antes del spawn, así que también vale para la fase «lanzando» (sin pid anotado), y
        // solo se mata el pid si el candado prueba que ese Java sigue vivo: un pid ya reciclado
        // por otro programa no se toca (revisión de Codex 17-11).
        let o = await esperarLibre(d.candadoJuego, 1500)
        if(o === true && d.fase === 'lanzado' && Number.isInteger(d.javaPid)){
            matar(d.javaPid)
            o = await esperarLibre(d.candadoJuego, 3000)
        }
        if(o === false){
            fs.rmSync(rutaVivo, { force: true })
            ScCandado.borrar(d.candadoJuego)
            return true
        }
        if(o === true){
            return false
        }
        // null: no se pudo consultar el candado.
    }
    if(d.fase !== 'lanzado' || !Number.isInteger(d.javaPid)){
        return false
    }
    if(ScCandado.disponible){
        // Windows sin candado que confirme quién es ese pid: no se mata a ciegas (podría ser ya
        // de otro programa). Si el pid no existe, no hay Java; si existe, no hay respaldo.
        if(vive(d.javaPid)){
            return false
        }
        fs.rmSync(rutaVivo, { force: true })
        return true
    }
    if(vive(d.javaPid)){
        matar(d.javaPid)
        await new Promise(r => setTimeout(r, 500))
    }
    if(vive(d.javaPid)){
        return false
    }
    fs.rmSync(rutaVivo, { force: true })
    return true
}

// Solo para tools/prueba-candados.js.
exports._sinJavaVivo = sinJavaVivo

/**
 * Mata el vigilante y todo lo que haya lanzado (un Java incluido).
 * @returns {Promise<boolean>} true solo si consta que el vigilante murió Y que no queda ningún Java
 * de este intento (sinJavaVivo); con false NO se puede lanzar directo: habría dos Minecraft.
 */
function matarArbol(hijo, rutaVivo){
    return new Promise((resolve) => {
        const comprobar = () => sinJavaVivo(rutaVivo).then(resolve, () => resolve(false))
        if(hijo.exitCode != null || hijo.signalCode != null){
            comprobar()
            return
        }
        const fin = setTimeout(() => resolve(false), 10000)
        hijo.once('exit', () => {
            clearTimeout(fin)
            comprobar()
        })
        // Solo el vigilante: su Java, si llegó a nacer, lo mata sinJavaVivo() por el pid de la marca.
        // hijo.kill() y no su pid: actúa sobre el proceso que ChildProcess tiene agarrado, aunque
        // ya hubiera muerto y Windows le diera ese número a otro.
        try {
            hijo.kill()
        } catch(_e){
            // Ya no existe.
        }
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
            matarArbol(hijo, path.join(carpetaDe(o.instancias), 'vivo-' + runId + '.json')).then((seguro) => {

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
                    // Candado que heredó el juego (sccandado.js): lo anota ScJuegoAbierto.
                    juego.candado = typeof m.candado === 'string' ? m.candado : null
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
// El tercer grupo es la instancia (1.17.24, ver sufijoPropio); sin él, reclamación «solo PID».
const RE_PROCESANDO = /^resultado-([0-9a-f]+)\.json\.procesando-(\d+)(?:-([0-9a-f]{16}))?$/
// Solo nuestros candados: la limpieza no toca ningún otro .lock.
const RE_CANDADO = /^(?:vivo|juego|launcher)-[0-9a-f]+\.lock$/

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
    const sufijo = sufijoPropio(carpeta)
    for(const f of ficheros){
        const ruta = path.join(carpeta, f)
        try {
            if(/\.lock$/.test(f)){
                // Se limpian al final: launcherVivo() distingue «dejó candado y murió» de «no dejó».
                continue
            }
            const edad = ahora - fs.statSync(ruta).mtimeMs
            if(/\.tmp-\d+$/.test(f) || /^hecho-[0-9a-f]+$/.test(f)){
                if(edad > MAX_EDAD_RESULTADO_MS){
                    fs.rmSync(ruta, { force: true })
                }
                continue
            }
            if(/^vivo-[0-9a-f]+\.json$/.test(f)){
                const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
                // La marca huérfana se borra aunque su PID lo tenga ahora otro proceso (1.17.22).
                if(!vigilanteVivo(carpeta, d)){
                    fs.rmSync(ruta, { force: true })
                }
                continue
            }
            let origen = null
            const m = RE_PROCESANDO.exec(f)
            if(m != null){
                // De una instancia que murió a medias: se recupera. Si sigue viva, es suya.
                const mia = m[3] != null ? m[3] === INSTANCIA : (sufijo === m[2])
                if(mia || launcherVivo(carpeta, Number(m[2]), m[3] || null, edad)){
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
            const reclamado = rutaResultado(instancias, runId) + '.procesando-' + sufijo
            fs.renameSync(origen, reclamado)
            salida.push(JSON.parse(fs.readFileSync(reclamado, 'utf8')))
        } catch(_e){
            // Otra instancia lo reclamó primero, o está a medio escribir.
        }
    }
    // Candados sin dueño (su proceso murió): fuera. Los que tienen dueño Windows no los deja borrar.
    if(ScCandado.disponible){
        for(const f of ficheros){
            if(RE_CANDADO.test(f)){
                ScCandado.borrar(path.join(carpeta, f))
            }
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
        fs.renameSync(rutaResultado(instancias, runId), rutaResultado(instancias, runId) + '.procesando-' + sufijoPropio(carpetaDe(instancias)))
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
        fs.rmSync(rutaResultado(instancias, runId) + '.procesando-' + sufijoPropio(carpetaDe(instancias)), { force: true })
    } catch(_e){
        // Nada.
    }
}
