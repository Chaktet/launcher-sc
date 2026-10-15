/**
 * Update notices while the launcher is open (1.15.0).
 *
 * Three things can change while a player has the launcher open:
 * - the modpack (mods, resource pack, configs): checked here every 10 minutes
 *   against the remote distribution, without touching the loaded one;
 * - a new server release note (novedades.js calls scAvisoNovedad);
 * - a new launcher version (uicore.js calls scAvisoLauncher when it cannot
 *   offer the automatic install, e.g. the player is in Ajustes or downloading).
 *
 * Each one shows a notice over every view (landing and Ajustes) and, when the
 * window is not in front and the game is not running, a Windows notification.
 */
const SC_AVISO_MODPACK_CADA = 10 * 60 * 1000
const SC_AVISO_MODPACK_PLAZO = 15000

let scAvisoClave = null          // what the visible notice is about
let scModpackAvisado = null      // remote snapshot already announced
let scModpackRevisando = false
let scModpackGeneracion = 0      // bumped when JUGAR reloads the distribution or the profile changes
let scLauncherAvisado = null     // launcher version already announced (the updater repeats the event)

/* ---- Notice ------------------------------------------------------------------ */

function scAvisoCaja(){
    let caja = document.getElementById('scAvisoUpd')
    if(caja != null){
        return caja
    }
    caja = document.createElement('div')
    caja.id = 'scAvisoUpd'
    caja.className = 'sc2Frame'
    caja.setAttribute('role', 'status')
    caja.hidden = true
    const textos = document.createElement('div')
    textos.className = 'scAvisoTextos'
    for(const c of ['scAvisoKicker', 'scAvisoTitulo', 'scAvisoTexto']){
        const s = document.createElement('span')
        s.className = c
        textos.append(s)
    }
    const accion = document.createElement('button')
    accion.type = 'button'
    accion.className = 'sc2Btn sc2BtnSecondary scAvisoAccion'
    const cerrar = document.createElement('button')
    cerrar.type = 'button'
    cerrar.className = 'scAvisoCerrar'
    cerrar.setAttribute('aria-label', Lang.queryJS('landing.sc2.avisoCerrar'))
    cerrar.addEventListener('click', () => scCerrarAviso())
    caja.append(textos, accion, cerrar)
    document.body.append(caja)
    return caja
}

/** The player is looking at the launcher right now. */
function scVentanaAtendida(){
    // Ask Electron: minimized or in the tray, the page still reports focus and visibility.
    try {
        const w = require('@electron/remote').getCurrentWindow()
        return w.isVisible() && !w.isMinimized() && w.isFocused()
    } catch(_e){
        return !document.hidden && document.hasFocus()
    }
}

function scJugandoAhora(){
    return typeof scJuegoEnMarcha === 'function' && scJuegoEnMarcha()
}

/**
 * Shows a notice (replacing the previous one) and, when nobody is looking and the
 * game is closed, a Windows notification that brings the launcher to the front.
 */
function scMostrarAviso({ clave, kicker, titulo, texto, accion = null, alPulsar = null }){
    const caja = scAvisoCaja()
    caja.querySelector('.scAvisoKicker').textContent = kicker
    caja.querySelector('.scAvisoTitulo').textContent = titulo
    caja.querySelector('.scAvisoTexto').textContent = texto
    const boton = caja.querySelector('.scAvisoAccion')
    boton.hidden = accion == null
    boton.textContent = accion || ''
    boton.onclick = alPulsar == null ? null : () => alPulsar()
    caja.dataset.clave = clave
    scAvisoClave = clave
    caja.hidden = false

    if(scVentanaAtendida() || scJugandoAhora()){
        return
    }
    try {
        const n = new Notification(titulo, { body: texto, silent: false })
        n.onclick = () => ipcRenderer.send('sc-ventana-juego', 'mostrar')
        n.onerror = () => loggerLanding.warn('Windows no mostró el aviso de actualización')
    } catch(err){
        loggerLanding.warn('No se pudo mostrar el aviso de actualización', err)
    }
}

/** Hides the notice; with a key, only if it is still about that. */
function scCerrarAviso(clave){
    const caja = document.getElementById('scAvisoUpd')
    if(caja == null || (clave != null && scAvisoClave !== clave)){
        return
    }
    caja.hidden = true
    scAvisoClave = null
}

/** Back to the landing (from Ajustes too), then `despues`. */
function scIrALanding(despues){
    if(typeof getCurrentView === 'function' && typeof VIEWS !== 'undefined' && getCurrentView() !== VIEWS.landing){
        const hecho = document.getElementById('settingsNavDone')
        if(hecho != null && !hecho.disabled){
            hecho.click()
            setTimeout(despues, 700)
        }
        return
    }
    despues()
}

/* ---- Modpack ------------------------------------------------------------------- */

/** Remote distribution with a time limit; null if it does not answer. */
async function scDistroRemota(){
    let t
    const limite = new Promise(resolve => {
        t = setTimeout(() => resolve(null), SC_AVISO_MODPACK_PLAZO)
    })
    try {
        return await Promise.race([DistroAPI.pullRemote().then(r => r.data).catch(() => null), limite])
    } finally {
        clearTimeout(t)
    }
}

/**
 * Compares the selected profile in the remote distribution with the loaded one
 * (mod versions and file MD5s, not URLs: the direct route rewrites them). Only
 * reads: the loaded distribution and the disk copy are refreshed by JUGAR as usual.
 */
/** A download or launch is in progress (the progress bar is visible). */
function scDescargando(){
    const detalles = document.getElementById('launch_details')
    return detalles != null && detalles.style.display !== 'none' && detalles.style.display !== ''
}

async function scRevisarModpackRemoto(){
    // With the game open it still checks: the notice is there when the player comes back.
    if(scModpackRevisando || DistroAPI.isDevMode() || scDescargando()){
        return
    }
    const local = DistroAPI.distribution?.getServerById(ConfigManager.getSelectedServer())
    if(local == null){
        return
    }
    scModpackRevisando = true
    const generacion = scModpackGeneracion
    try {
        const raw = await scDistroRemota()
        // An answer that arrives after JUGAR reloaded the distribution (or a profile change, or
        // during a download) compares against something else: drop it.
        if(generacion !== scModpackGeneracion || scDescargando()){
            return
        }
        const remoto = Array.isArray(raw?.servers) ? raw.servers.find(s => s?.id === local.rawServer.id) : null
        // The selection or the loaded distribution may have changed while waiting.
        const actual = DistroAPI.distribution?.getServerById(ConfigManager.getSelectedServer())
        if(remoto == null || actual == null || actual.rawServer.id !== remoto.id){
            return
        }
        const antes = scFoto(actual)
        const ahora = scFoto({ rawServer: remoto })
        const clave = JSON.stringify([remoto.id, ahora.mods, ahora.ficheros])
        if(clave === scModpackAvisado){
            return
        }
        const { cambios, resumen } = scDiferencias(antes, ahora)
        if(cambios.length === 0){
            // Nothing pending for this profile (any more): an old notice goes away.
            scModpackAvisado = null
            scCerrarAviso('modpack')
            return
        }
        scModpackAvisado = clave
        scMostrarAviso({
            clave: 'modpack',
            kicker: Lang.queryJS('landing.sc2.avisoKickerModpack'),
            titulo: resumen || Lang.queryJS('landing.sc2.avisoModpackTitle'),
            texto: Lang.queryJS(scJugandoAhora() ? 'landing.sc2.avisoModpackJugando' : 'landing.sc2.avisoModpackText')
        })
    } catch(err){
        loggerLanding.debug('No se pudo comprobar si hay actualización del modpack', err)
    } finally {
        scModpackRevisando = false
    }
}

/** Called by landing.js after JUGAR refreshed the distribution: the notice is done. */
function scModpackAlDia(){
    scModpackGeneracion++
    scModpackAvisado = null
    scCerrarAviso('modpack')
}

/* ---- Release notes and launcher ---------------------------------------------- */

/** New server release notes arrived while the launcher was open (novedades.js). */
function scAvisoNovedad(nuevas){
    if(nuevas.length === 0){
        return
    }
    scMostrarAviso({
        clave: 'novedad',
        kicker: Lang.queryJS('landing.sc2.avisoKickerNovedad'),
        titulo: nuevas[0].titulo,
        texto: nuevas.length === 1 ? Lang.queryJS('landing.sc2.avisoNovedadText')
            : Lang.queryJS('landing.sc2.avisoNovedadMas', { n: nuevas.length - 1 }),
        accion: Lang.queryJS('landing.sc2.avisoVer'),
        alPulsar: () => {
            scCerrarAviso('novedad')
            scIrALanding(() => {
                if(typeof newsActive !== 'undefined' && newsActive){
                    scVerPestanaNovedades('servidor')
                    setTimeout(scNovServRefrescarVista, 0)
                } else {
                    scPestanaPedida = 'servidor'
                    document.getElementById('newsButton').click()
                }
            })
        }
    })
}

/** A new launcher version is downloaded but the automatic install could not be offered (uicore.js). */
function scAvisoLauncher(version){
    // Once per version: the updater emits update-downloaded again on every 30-minute check.
    if(version === scLauncherAvisado){
        return
    }
    scLauncherAvisado = version
    scMostrarAviso({
        clave: 'launcher',
        kicker: Lang.queryJS('landing.sc2.avisoKickerLauncher'),
        titulo: Lang.queryJS('landing.sc2.avisoLauncherTitle', { v: version || '' }),
        texto: Lang.queryJS('landing.sc2.avisoLauncherText'),
        accion: Lang.queryJS('landing.sc2.avisoInstalar'),
        alPulsar: () => {
            // Never in the middle of a game or a download: the installer closes the launcher.
            if(scJugandoAhora() || (typeof scOcupado === 'function' && scOcupado())){
                document.querySelector('#scAvisoUpd .scAvisoTexto').textContent = Lang.queryJS('landing.sc2.avisoLauncherOcupado')
                return
            }
            scCerrarAviso('launcher')
            scInstalarAhora(version)
        }
    })
}

/** The automatic install countdown started: tell a player who is not looking (uicore.js). */
function scAvisoLauncherCuentaAtras(version){
    if(scVentanaAtendida() || scJugandoAhora()){
        return
    }
    try {
        const n = new Notification(Lang.queryJS('landing.sc2.avisoAutoTitle', { v: version || '' }),
            { body: Lang.queryJS('landing.sc2.avisoAutoBody'), silent: false })
        n.onclick = () => ipcRenderer.send('sc-ventana-juego', 'mostrar')
    } catch(err){
        loggerLanding.warn('No se pudo avisar de la instalación automática', err)
    }
}

setInterval(scRevisarModpackRemoto, SC_AVISO_MODPACK_CADA)
// Another profile: its own notice, not the previous profile's (same trigger as novedades.js).
new MutationObserver(() => {
    scModpackAlDia()
    scRevisarModpackRemoto()
}).observe(document.getElementById('server_selection_button'), { childList: true, characterData: true, subtree: true })
