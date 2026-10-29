/**
 * El vigilante: proceso Node mínimo (el propio exe del launcher con ELECTRON_RUN_AS_NODE=1)
 * que es el PADRE de Minecraft. Plan y revisión de Codex: docs/PLAN-VIGILANTE.md.
 *
 * Por qué existe: con el juego cargado el launcher se cierra entero (~520 MB → ~25 MB). Si el
 * padre del juego fuera el renderer, al cerrarse se romperían las tuberías de stdout/stderr y
 * nadie sabría el código de salida, que es lo que usa el diagnóstico de crasheos. Este proceso
 * sigue vivo, drena la salida, guarda las últimas líneas, lleva Discord y, al cerrarse el
 * juego, deja el resultado en disco y vuelve a abrir el launcher si se cerró por el juego.
 *
 * Solo Node: ni Electron ni jQuery ni helios-core (no hay ventana ni logger del launcher).
 * Todo lo que necesita le llega por IPC en el mensaje `lanzar`.
 */
const child_process = require('child_process')
const fs            = require('fs')
const path          = require('path')

// Últimas líneas guardadas para el diagnóstico (igual que scSalidaError en landing.js).
const MAX_LINEAS = 200
// Mensajes de salida pendientes de enviar al launcher: lo que sobre se descarta, solo es
// para la barra de hitos. El drenaje de la tubería nunca espera al IPC.
const MAX_COLA_IPC = 500
// Espera del acuse `consumido` antes de dar el resultado por no entregado.
const ESPERA_ACUSE_MS = 5000
const MAX_LOG_BYTES = 1024 * 1024

let opciones = null
let juego = null
let lineas = []
let juegoArranco = false
let saliendoPorJuego = false
let enviosPendientes = 0
let rpc = null
let rpcActividad = null
let rutaVivo = null
let rutaLog = null

function log(texto){
    if(rutaLog == null){
        return
    }
    try {
        try {
            if(fs.statSync(rutaLog).size > MAX_LOG_BYTES){
                fs.renameSync(rutaLog, rutaLog + '.1')
            }
        } catch(_e){
            // Aún no existe.
        }
        fs.appendFileSync(rutaLog, new Date().toISOString() + ' [' + process.pid + '] ' + texto + '\n')
    } catch(_e){
        // Sin log no se para nada.
    }
}

function regex(r){
    return r == null ? null : new RegExp(r.source, r.flags)
}

function errorPlano(e){
    if(e == null){
        return null
    }
    return { message: String(e.message || e), code: e.code, errno: e.errno, syscall: e.syscall, path: e.path, stack: e.stack }
}

/** Envío al launcher que jamás lanza: si se cae el IPC, el vigilante sigue. */
function enviar(msg, critico = false){
    if(!process.connected){
        return false
    }
    if(!critico && enviosPendientes >= MAX_COLA_IPC){
        return false
    }
    try {
        enviosPendientes++
        process.send(msg, (err) => {
            enviosPendientes--
            if(err && critico){
                log('Fallo al enviar ' + msg.tipo + ': ' + err.message)
            }
        })
        return true
    } catch(e){
        enviosPendientes--
        log('Excepción al enviar ' + msg.tipo + ': ' + e.message)
        return false
    }
}

function escribirAtomico(ruta, datos){
    const tmp = ruta + '.tmp-' + process.pid
    fs.writeFileSync(tmp, JSON.stringify(datos))
    fs.renameSync(tmp, ruta)
}

function anotarLinea(texto){
    lineas.push(texto)
    if(lineas.length > MAX_LINEAS){
        lineas = lineas.slice(-MAX_LINEAS)
    }
}

function iniciarDiscord(){
    const d = opciones.discord
    if(d == null){
        return
    }
    try {
        // Ruta absoluta dentro del app.asar: en modo Node Electron sigue leyendo el asar.
        const { Client } = require(path.join(opciones.raizApp, 'node_modules', 'discord-rpc-patch'))
        rpc = new Client({ transport: 'ipc' })
        rpcActividad = Object.assign({}, d.actividad, { startTimestamp: Date.now(), instance: false })
        rpc.on('ready', () => {
            try { rpc.setActivity(rpcActividad) } catch(_e){ /* Discord cerrado */ }
        })
        rpc.login({ clientId: d.clientId }).catch(e => log('Discord RPC no disponible: ' + e.message))
    } catch(e){
        log('No se pudo iniciar Discord RPC: ' + e.message)
        rpc = null
    }
}

function discordDetalles(texto){
    if(rpc == null || rpcActividad == null || texto == null || rpcActividad.details === texto){
        return
    }
    rpcActividad.details = texto
    try { rpc.setActivity(rpcActividad) } catch(_e){ /* Discord cerrado */ }
}

function cerrarDiscord(){
    if(rpc == null){
        return
    }
    try {
        rpc.clearActivity()
        rpc.destroy()
    } catch(_e){
        // Discord ya cerrado.
    }
    rpc = null
}

/** Borra la marca de ScJuegoAbierto si sigue siendo la de este juego (como su borrar()). */
function borrarMarcaJuego(pid){
    try {
        const ruta = path.join(opciones.instancias, 'sc-juego.pid')
        const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
        if(d.pid === pid){
            fs.rmSync(ruta, { force: true })
        }
    } catch(_e){
        // Sin marca o ilegible.
    }
}

function viveProceso(pid){
    try {
        process.kill(pid, 0)
        return true
    } catch(e){
        return e.code === 'EPERM'
    }
}

/**
 * Reabre el launcher cuando el que se cerró por el juego ya no existe: si aún se está cerrando,
 * el bloqueo de instancia única le mandaría la apertura a él y se perdería.
 */
function relanzarLauncher(hecho){
    const desde = Date.now()
    const esperar = () => {
        if(Number.isInteger(opciones.pidLauncher) && viveProceso(opciones.pidLauncher) && Date.now() - desde < 30000){
            setTimeout(esperar, 250)
            return
        }
        abrirLauncher()
        hecho()
    }
    esperar()
}

function abrirLauncher(){
    try {
        // Sin ELECTRON_RUN_AS_NODE: con ella el exe arrancaría otra vez en modo Node y no abriría nada.
        const env = Object.assign({}, process.env)
        delete env.ELECTRON_RUN_AS_NODE
        const args = opciones.argsLauncher.concat(['--tras-juego'])
        const hijo = child_process.spawn(opciones.exeLauncher, args, { detached: true, stdio: 'ignore', env, windowsHide: false })
        hijo.on('error', e => log('No se pudo relanzar el launcher: ' + e.message))
        hijo.unref()
        log('Launcher relanzado')
    } catch(e){
        log('No se pudo relanzar el launcher: ' + e.message)
    }
}

function terminar(){
    try {
        if(rutaVivo != null){
            fs.rmSync(rutaVivo, { force: true })
        }
    } catch(_e){
        // Nada.
    }
    // Dar tiempo a que salgan el log y el último envío.
    setTimeout(() => process.exit(0), 200)
}

function alCerrarJuego(code, signal){
    const pid = juego.pid
    log('Juego cerrado code=' + code + ' signal=' + signal)
    cerrarDiscord()
    borrarMarcaJuego(pid)
    if(opciones.tempNativePath){
        fs.rm(opciones.tempNativePath, { recursive: true, force: true }, () => {})
    }
    const resultado = {
        runId: opciones.runId,
        pid,
        code,
        signal,
        servidorId: opciones.servidorId,
        perfil: opciones.perfil,
        inicioPartida: opciones.inicioPartida,
        juegoArranco,
        fin: Date.now(),
        salida: lineas.join('\n')
    }
    const ruta = path.join(opciones.carpeta, 'resultado-' + opciones.runId + '.json')
    try {
        escribirAtomico(ruta, resultado)
    } catch(e){
        log('No se pudo guardar el resultado: ' + e.message)
    }

    let entregado = false
    const sinAcuse = () => {
        if(entregado){
            return
        }
        entregado = true
        if(saliendoPorJuego){
            relanzarLauncher(terminar)
        } else {
            terminar()
        }
    }
    // Comprometida la salida, el launcher se va a cerrar aunque procese el cierre: su
    // `consumido` no vale y el resultado espera al launcher reabierto (revisión de Codex).
    if(saliendoPorJuego){
        sinAcuse()
        return
    }
    process.on('message', (m) => {
        if(m && m.tipo === 'consumido' && m.runId === opciones.runId && !entregado){
            entregado = true
            // El launcher ya lo procesó y lo borró; por si acaso.
            try { fs.rmSync(ruta, { force: true }) } catch(_e){ /* nada */ }
            terminar()
        }
    })
    process.on('disconnect', sinAcuse)
    if(!enviar({ tipo: 'cierre', resultado }, true)){
        sinAcuse()
        return
    }
    setTimeout(sinAcuse, ESPERA_ACUSE_MS)
}

function lanzar(m){
    opciones = m
    opciones.carpeta = path.join(opciones.instancias, 'sc-vigilante')
    fs.mkdirSync(opciones.carpeta, { recursive: true })
    rutaLog = path.join(opciones.carpeta, 'vigilante.log')
    rutaVivo = path.join(opciones.carpeta, 'vivo-' + opciones.runId + '.json')
    // «lanzando» ANTES del spawn y el pid de Java justo después: si este proceso muere entre
    // medias, el launcher sabe por esta marca si puede haber un Java vivo (y no lanza otro).
    escribirAtomico(rutaVivo, { pid: process.pid, runId: opciones.runId, desde: Date.now(), fase: 'lanzando' })
    log('Lanzando juego (runId ' + opciones.runId + ')')

    const reConectando = regex(opciones.reConectando)
    const reServidor = regex(opciones.reServidorUnido)
    const reJuego = regex(opciones.reJuegoUnido)

    try {
        juego = child_process.spawn(opciones.exe, opciones.args, {
            cwd: opciones.cwd,
            env: opciones.env,
            detached: true,
            windowsHide: false
        })
    } catch(e){
        log('spawn lanzó: ' + e.message)
        enviar({ tipo: 'error', origen: 'java', error: errorPlano(e) }, true)
        terminar()
        return
    }

    juego.on('error', (e) => {
        log('Error del proceso del juego: ' + e.message)
        enviar({ tipo: 'error', origen: 'java', error: errorPlano(e) }, true)
        // Sin pid no hubo juego y no habrá 'close'.
        if(juego.pid == null){
            terminar()
        }
    })

    if(juego.pid == null){
        // El 'error' llega en el siguiente tick.
        return
    }
    try {
        escribirAtomico(rutaVivo, { pid: process.pid, runId: opciones.runId, desde: Date.now(), fase: 'lanzado', javaPid: juego.pid })
    } catch(e){
        // Sin esta marca el launcher no daría por seguro un respaldo: prefiere no lanzar otro.
        log('No se pudo anotar el pid de Java: ' + e.message)
    }
    // Sin unref(): el juego es justo lo que debe mantener vivo a este proceso.
    enviar({ tipo: 'lanzado', pid: juego.pid }, true)
    iniciarDiscord()

    const leer = (canal) => (data) => {
        const texto = String(data)
        texto.trim().split('\n').forEach(l => anotarLinea(l))
        if(canal === 'stdout'){
            if(reConectando != null && reConectando.test(texto)){
                juegoArranco = true
            }
            if(reServidor != null && reServidor.test(texto)){
                discordDetalles(opciones.discord && opciones.discord.textos.unido)
            } else if(reJuego != null && reJuego.test(texto)){
                discordDetalles(opciones.discord && opciones.discord.textos.uniendose)
            }
        }
        enviar({ tipo: canal, data: texto })
    }
    juego.stdout.setEncoding('utf8')
    juego.stderr.setEncoding('utf8')
    juego.stdout.on('data', leer('stdout'))
    juego.stderr.on('data', leer('stderr'))
    juego.on('exit', (code, signal) => enviar({ tipo: 'exit', code, signal }, true))
    juego.on('close', alCerrarJuego)
}

process.on('message', (m) => {
    if(m == null || typeof m !== 'object'){
        return
    }
    if(m.tipo === 'lanzar' && opciones == null){
        try {
            lanzar(m.opciones)
        } catch(e){
            log('Fallo al lanzar: ' + e.message)
            enviar({ tipo: 'error', origen: 'vigilante', error: errorPlano(e) }, true)
            terminar()
        }
    } else if(m.tipo === 'cargado'){
        // La decisión de carga es del renderer (hito o temporizador): una sola fuente.
        juegoArranco = true
        discordDetalles(opciones && opciones.discord && opciones.discord.textos.cargando)
        enviar({ tipo: 'cargado-ok' }, true)
    } else if(m.tipo === 'saliendo-por-juego'){
        saliendoPorJuego = true
        log('El launcher se cierra por el juego')
        enviar({ tipo: 'saliendo-ok' }, true)
    }
})

// Que se vaya el launcher no es motivo para irse: el juego sigue y hay que leerlo. Pero sin
// encargo (el launcher murió antes de mandarlo) no hay nada que vigilar.
process.on('disconnect', () => {
    log('Launcher desconectado')
    if(opciones == null){
        process.exit(0)
    }
})
setTimeout(() => {
    if(opciones == null){
        process.exit(0)
    }
}, 30000).unref()
process.on('uncaughtException', (e) => log('Excepción no controlada: ' + (e && e.stack)))
process.on('unhandledRejection', (e) => log('Promesa rechazada: ' + (e && e.stack)))
