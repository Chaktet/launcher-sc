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
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
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
                // Aviso inmediato: antes el sello solo se encendía al terminar
                // la descarga completa (update-downloaded) y parecía que no había update.
                showUpdateUI(info, false)

                populateSettingsUpdateInformation(info)
                break
            case 'download-progress': {
                // Progreso real de la descarga, tanto en la píldora del logo
                // como en el botón de Ajustes → Actualizaciones.
                const pct = Math.max(0, Math.min(100, Math.round(info != null ? info.percent : 0)))
                // electron-updater emite este evento por cada trozo descargado:
                // sin este filtro se repintaría la interfaz cientos de veces.
                if(pct === scLastUpdatePct){
                    break
                }
                scLastUpdatePct = pct
                const tooltip = document.getElementById('updateAvailableTooltip')
                if(tooltip != null && document.getElementById('image_seal_container').hasAttribute('update')){
                    tooltip.innerHTML = `${Lang.queryJS('uicore.autoUpdate.downloadingProgress')} ${pct}%`
                }
                settingsUpdateButtonStatus(`${Lang.queryJS('uicore.autoUpdate.downloadingProgress')} ${pct}%`, true)
                scInsigniaVersion('descargando', `${Lang.queryJS('uicore.autoUpdate.downloadingProgress')} ${pct}%`)
                break
            }
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    if(!isDev){
                        ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
                    }
                })
                showUpdateUI(info, true)
                scInsigniaLista(info != null ? info.version : '')
                scAutoInstalarSiProcede(info)
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                scInsigniaAlDia()
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                // Sin esto, si la descarga fallaba el botón se quedaba bloqueado
                // en "Descargando X%" para siempre.
                document.getElementById('image_seal_container').removeAttribute('update')
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

/** Hay actualización descargada: se ofrece instalar con una confirmación. */
function scInsigniaLista(version){
    scInsigniaVersion(
        'lista',
        Lang.queryJS('uicore.autoUpdate.insigniaLista').replace('{v}', version || ''),
        () => {
            setOverlayContent(
                Lang.queryJS('uicore.autoUpdate.instalarTitulo'),
                Lang.queryJS('uicore.autoUpdate.instalarDesc'),
                Lang.queryJS('uicore.autoUpdate.instalarConfirmar'),
                Lang.queryJS('uicore.autoUpdate.instalarCancelar')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
                ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            })
            setDismissHandler(() => toggleOverlay(false))
            toggleOverlay(true, true)
        }
    )
}

/**
 * Instala la actualización sola cuando no molesta a nadie.
 *
 * El instalador público está congelado en una versión concreta para que Windows
 * le vaya cogiendo confianza, así que quien acaba de instalar arranca con una
 * versión antigua. En vez de obligarle a pulsar nada, si el launcher está
 * ocioso se actualiza y se reinicia solo.
 *
 * NO se hace si el jugador está haciendo algo: con el juego abierto, fuera de la
 * pantalla principal, o con una descarga en marcha.
 *
 * Ojo con lo de la descarga: 'proc' no existe hasta DESPUÉS de bajar y verificar
 * los 300 MB del pack, así que mirarlo a él solo daba por ocioso un launcher que
 * llevaba diez minutos descargando, y se reiniciaba a media faena.
 */
function scOcupado(){
    if(typeof proc !== 'undefined' && proc != null){
        return true // el juego está abierto
    }
    // La barra de progreso visible significa que hay descarga o arranque en curso.
    const detalles = document.getElementById('launch_details')
    if(detalles != null && detalles.style.display !== 'none' && detalles.style.display !== ''){
        return true
    }
    return false
}

function scAutoInstalarSiProcede(info){
    const enAjustes = typeof getCurrentView === 'function' && typeof VIEWS !== 'undefined'
        && getCurrentView() !== VIEWS.landing
    if(scOcupado() || enAjustes){
        return // se queda la insignia; la instala cuando el jugador quiera
    }

    let restantes = 5
    const pinta = () => scInsigniaVersion(
        'lista',
        Lang.queryJS('uicore.autoUpdate.insigniaAutoInstalando').replace('{s}', restantes)
    )
    pinta()

    const cuenta = setInterval(() => {
        restantes--
        if(scOcupado()){
            // Le ha dado a JUGAR mientras contaba: se cancela y no se toca nada.
            clearInterval(cuenta)
            scInsigniaLista(info != null ? info.version : '')
            return
        }
        if(restantes <= 0){
            clearInterval(cuenta)
            ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            return
        }
        pinta()
    }, 1000)
}

function showUpdateUI(info, downloaded = false){
    const sealContainer = document.getElementById('image_seal_container')
    sealContainer.setAttribute('update', true)
    // La píldora refleja el estado real: descargando vs lista para instalar.
    const tooltip = document.getElementById('updateAvailableTooltip')
    if(tooltip != null){
        tooltip.innerHTML = downloaded ? Lang.queryJS('uicore.autoUpdate.tooltipReady') : Lang.queryJS('uicore.autoUpdate.tooltipDownloading')
    }
    sealContainer.onclick = async () => {
        if(getCurrentView() === VIEWS.settings){
            settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
            return
        }
        // Sin prepareSettings() el guardado de "Listo" petaba con estado sin
        // inicializar y el botón parecía no responder.
        await prepareSettings()
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
        })
    }
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
        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    } else if(document.readyState === 'complete'){

        //266.01
        //170.8
        //53.21
        // Bind progress bar length to length of bot wrapper
        //const targetWidth = document.getElementById("launch_content").getBoundingClientRect().width
        //const targetWidth2 = document.getElementById("server_selection").getBoundingClientRect().width
        //const targetWidth3 = document.getElementById("launch_button").getBoundingClientRect().width

        document.getElementById('launch_details').style.maxWidth = 266.01
        document.getElementById('launch_progress').style.width = 170.8
        document.getElementById('launch_details_right').style.maxWidth = 170.8
        document.getElementById('launch_progress_label').style.width = 53.21
        
    }

}, false)

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    shell.openExternal(this.href)
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