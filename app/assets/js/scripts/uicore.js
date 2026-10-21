/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, shell, webFrame} = require('electron')
const remote                         = require('@electron/remote')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Display warning when devtools window is opened.
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log('%cThe console is dark and full of terrors.', 'color: white; -webkit-text-stroke: 4px #a02d2a; font-size: 60px; font-weight: bold')
    console.log('%cIf you\'ve been told to paste something here, you\'re being scammed.', 'font-size: 16px')
    console.log('%cUnless you know exactly what you\'re doing, close this window.', 'font-size: 16px')
})

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Initialize auto updates in production environments.
let updateCheckListener
let scLastUpdatePct = -1
const SC_UPDATE_CADA = 5 * 60 * 1000
const SC_UPDATE_FOCO_MIN = 60 * 1000
let scUltimaBusquedaUpdate = 0
let scUpdateFocoPuesto = false

function scBuscarActualizacion(){
    scUltimaBusquedaUpdate = Date.now()
    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
}
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        // 1.16.0: aviso central que bloquea JUGAR hasta actualizar (scpuerta.js).
        if(typeof scPuerta === 'function'){
            scPuerta(arg, info)
        }
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)

                if(process.platform === 'darwin'){
                    info.darwindownload = `https://github.com/dscalzi/HeliosLauncher/releases/download/v${info.version}/Helios-Launcher-setup-${info.version}${process.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`
                }
                // El aviso a la vista es la puerta (scpuerta.js), que ya se ha pintado
                // arriba. El sello del logo de Helios que se encendía aquí era un
                // segundo aviso para lo mismo, con el diseño viejo.
                populateSettingsUpdateInformation(info)
                break
            case 'download-progress': {
                // Progreso real de la descarga en la insignia y en el botón de
                // Ajustes → Actualizaciones (la puerta pinta el suyo).
                const pct = Math.max(0, Math.min(100, Math.round(info != null ? info.percent : 0)))
                // electron-updater emite este evento por cada trozo descargado:
                // sin este filtro se repintaría la interfaz cientos de veces.
                if(pct === scLastUpdatePct){
                    break
                }
                scLastUpdatePct = pct
                settingsUpdateButtonStatus(`${Lang.queryJS('uicore.autoUpdate.downloadingProgress')} ${pct}%`, true)
                scInsigniaVersion('descargando', `${Lang.queryJS('uicore.autoUpdate.downloadingProgress')} ${pct}%`)
                break
            }
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    if(!isDev){
                        scInstalarAhora(info != null ? info.version : '')
                    }
                })
                // La cuenta atrás y la instalación sola cuando nadie lo usa las lleva la
                // puerta: aquí solo la insignia de abajo (1.16.11).
                scInsigniaLista(info != null ? info.version : '')
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                scInsigniaAlDia()
                break
            case 'ready':
                scComprobarActualizacionEnCurso()
                // Un 'ready' repetido no debe sumar otro intervalo de comprobación.
                // Cada 5 minutos y al volver a la ventana: con 30 minutos, quien tenía
                // el launcher abierto seguía viendo "Estás al día" media hora después
                // de publicar una versión (Felix, 18-10). Solo pide el latest.yml de
                // GitHub (unos cientos de bytes); descargar, solo si hay versión nueva.
                clearInterval(updateCheckListener)
                updateCheckListener = setInterval(scBuscarActualizacion, SC_UPDATE_CADA)
                if(!scUpdateFocoPuesto){
                    scUpdateFocoPuesto = true
                    window.addEventListener('focus', () => {
                        if(Date.now() - scUltimaBusquedaUpdate > SC_UPDATE_FOCO_MIN){
                            scBuscarActualizacion()
                        }
                    })
                }
                scBuscarActualizacion()
                break
            case 'realerror':
                if(info != null && info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                    loggerAutoUpdater.info('No suitable releases found.')
                } else if(info != null && info.code === 'ERR_XML_MISSED_ELEMENT'){
                    loggerAutoUpdater.info('No releases found.')
                } else {
                    // Siempre al registro, con código y mensaje en texto: antes un error sin
                    // código (o con el Error mal serializado) no dejaba ni una línea.
                    loggerAutoUpdater.error(`Fallo de actualización [${(info && info.code) || 'sin código'}]: ${String((info && info.message) || info).slice(0, 1500)}`)
                }
                // Sin esto, si la descarga fallaba el botón se quedaba bloqueado
                // en "Descargando X%" para siempre.
                scInsigniaAlDia()
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'), false, () => {
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                    settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                })
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

/**
 * Send a notification to the main process changing the value of
 * allowPrerelease. If we are running a prerelease version, then
 * this will always be set to true, regardless of the current value
 * of val.
 * 
 * @param {boolean} val The new allow prerelease value.
 */
function changeAllowPrerelease(val){
    ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

/**
 * Insignia de versión junto al logo. Muestra si estás al día y, cuando hay
 * actualización, permite instalarla ahí mismo sin entrar en Ajustes.
 *
 * @param {'aldia'|'buscando'|'descargando'|'lista'} estado
 * @param {string} texto Texto visible.
 * @param {Function} alPulsar Acción al hacer clic, o null.
 */
function scInsigniaVersion(estado, texto, alPulsar = null){
    const badge = document.getElementById('sc_version_badge')
    const span = document.getElementById('sc_version_text')
    if(badge == null || span == null){
        return
    }
    badge.setAttribute('estado', estado)
    span.innerHTML = texto
    badge.onclick = alPulsar
    badge.disabled = alPulsar == null
}

/** Estado normal: versión instalada y todo al día. */
function scInsigniaAlDia(){
    scInsigniaVersion(
        'aldia',
        `v${remote.app.getVersion()} ${Lang.queryJS('uicore.autoUpdate.insigniaAlDia')}`,
        () => {
            scInsigniaVersion('buscando', Lang.queryJS('uicore.autoUpdate.insigniaBuscando'))
            ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
        }
    )
}

/**
 * Hay actualización descargada. La insignia instala con la misma comprobación que
 * el botón de la puerta (nunca con Minecraft abierto); antes abría un tercer diálogo
 * de confirmación con el diseño viejo.
 */
function scInsigniaLista(version){
    scInsigniaVersion(
        'lista',
        Lang.queryJS('uicore.autoUpdate.insigniaLista').replace('{v}', version || ''),
        () => {
            if(typeof scPuertaInstalar === 'function'){
                scPuertaInstalar()
            } else {
                scInstalarAhora(version)
            }
        }
    )
}

/**
 * ¿Hay juego abierto? Pasiva (último resultado conocido, sin esperar) salvo con
 * `confirmar`, que hace la comprobación completa en segundo plano y la espera.
 */
function scJuegoEnMarcha(confirmar = false){
    if(typeof proc !== 'undefined' && proc != null){
        return confirmar ? Promise.resolve(true) : true
    }
    // También el juego lanzado antes de reabrir el launcher: `proc` solo vive en
    // memoria y, sin esto, reabrir el launcher en mitad de una partida instalaba la
    // actualización y el instalador cerraba el juego. Ver scjuegoabierto.js.
    try {
        const J = require('./assets/js/scjuegoabierto')
        if(confirmar){
            return J.juegoPrevioAbiertoAsync().then(pid => pid != null).catch(() => false)
        }
        return J.juegoPrevioAbierto() != null
    } catch(e){
        return confirmar ? Promise.resolve(false) : false
    }
}

function scOcupado(){
    if(scJuegoEnMarcha()){
        return true // el juego está abierto
    }
    // La barra de progreso visible significa que hay descarga o arranque en curso.
    const detalles = document.getElementById('launch_details')
    if(detalles != null && detalles.style.display !== 'none' && detalles.style.display !== ''){
        return true
    }
    return false
}

// Marca en disco mientras se instala una actualización. Si alguien reabre el launcher
// viejo antes de que el instalador acabe, ve "Terminando de actualizar…" y no puede
// jugar (el instalador lo cerraría a los pocos segundos, con el juego ya abierto).
function scRutaMarcaActualizando(){
    return require('path').join(remote.app.getPath('userData'), 'sc-actualizando.json')
}

function scInstalarAhora(version){
    try {
        require('fs').writeFileSync(scRutaMarcaActualizando(), JSON.stringify({ version: version || '', ts: Date.now() }))
    } catch(e) { /* sin marca: solo se pierde el aviso de reapertura */ }
    // En Ajustes, RAM, Java y demás solo se guardan al pulsar "Listo", y la puerta
    // tapa ese botón: sin esto, el reinicio (a mano o por la cuenta atrás) los perdía.
    if(typeof getCurrentView === 'function' && typeof VIEWS !== 'undefined'
        && getCurrentView() === VIEWS.settings && typeof fullSettingsSave === 'function'){
        try {
            fullSettingsSave()
        } catch(e){
            loggerAutoUpdater.warn('No se pudieron guardar los ajustes antes de actualizar', e)
        }
    }
    // "Actualizando…" sale en la misma puerta, no en otro diálogo encima (1.16.11).
    if(typeof scPuertaPinta === 'function'){
        scPuertaPinta('instalando', { version, desde: Date.now() })
    }
    // Un instante para que se pinte el aviso antes de que la ventana se cierre.
    setTimeout(() => ipcRenderer.send('autoUpdateAction', 'installUpdateNow'), 400)
}

/** Al arrancar: ¿hay una instalación a medias de una versión más nueva que esta? */
function scComprobarActualizacionEnCurso(){
    let marca = null
    try {
        marca = JSON.parse(require('fs').readFileSync(scRutaMarcaActualizando(), 'utf8'))
    } catch(e) {
        return
    }
    const actual = remote.app.getVersion()
    const reciente = marca != null && typeof marca.ts === 'number' && Date.now() - marca.ts < 3 * 60 * 1000
    const masNueva = marca != null && marca.version && marca.version !== actual
    if(!reciente || !masNueva){
        // Recién actualizado a esta versión: lo que ha tardado desde pulsar el botón
        // hasta abrirse de nuevo es la estimación de la barra de la próxima vez.
        if(reciente && marca.version === actual && typeof scPuertaGuardaDuracion === 'function'){
            scPuertaGuardaDuracion(Date.now() - marca.ts)
        }
        // Ya está instalada (o el intento es viejo y falló): se borra y arranque normal.
        try { require('fs').unlinkSync(scRutaMarcaActualizando()) } catch(e) { /* nada */ }
        return
    }
    if(typeof scPuertaPinta === 'function'){
        scPuertaPinta('terminando', { version: marca.version, desde: marca.ts })
    }
    // Si el instalador falló y no llega a cerrar este launcher, no se queda bloqueado:
    // a los 3 minutos de empezar se quita el aviso y se sigue con esta versión.
    setTimeout(() => {
        try { require('fs').unlinkSync(scRutaMarcaActualizando()) } catch(e) { /* nada */ }
        if(typeof scPuertaPinta === 'function'){
            scPuertaPinta('oculta')
        }
        ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
    }, Math.max(1000, marca.ts + 3 * 60 * 1000 - Date.now()))
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive'){
        loggerUICore.info('UICore Initializing..')

        // Insignia de version junto al logo: por defecto, al dia.
        if(typeof scInsigniaAlDia === 'function'){
            scInsigniaAlDia()
        }

        // Bind close button.
        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.close()
            })
        })

        // Bind restore down button.
        Array.from(document.getElementsByClassName('fRb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                if(window.isMaximized()){
                    window.unmaximize()
                } else {
                    window.maximize()
                }
                document.activeElement.blur()
            })
        })

        // Bind minimize button.
        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.minimize()
                document.activeElement.blur()
            })
        })

        // Remove focus from social media buttons once they're clicked.
        Array.from(document.getElementsByClassName('sc2Link')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    }

}, false)

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    // Solo https: openExternal le pasa la URL al sistema, y un enlace http (o con
    // otro esquema colado en una noticia) no debe salir de aquí.
    if(/^https:\/\//i.test(this.href)){
        shell.openExternal(this.href)
    } else {
        loggerUICore.warn('Enlace no https ignorado:', this.href)
    }
})

/**
 * Opens DevTools window if you hold (ctrl + shift + i).
 * This will crash the program if you are using multiple
 * DevTools, for example the chrome debugger in VS Code. 
 */
document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey){
        let window = remote.getCurrentWindow()
        window.toggleDevTools()
    }
})