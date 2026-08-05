/**
 * Initialize UI functions which depend on internal modules.
 * Loaded after core UI functions are initialized in uicore.js.
 */
// Requirements
const path          = require('path')
const { Type }      = require('helios-distribution-types')

const AuthManager   = require('./assets/js/authmanager')
const ConfigManager = require('./assets/js/configmanager')
const { DistroAPI } = require('./assets/js/distromanager')

let rscShouldLoad = false
let fatalStartupError = false

// Mapping of each view to their container IDs.
const VIEWS = {
    landing: '#landingContainer',
    loginOptions: '#loginOptionsContainer',
    login: '#loginContainer',
    settings: '#settingsContainer',
    welcome: '#welcomeContainer',
    waiting: '#waitingContainer'
}

// The currently shown view container.
let currentView

/**
 * Switch launcher views.
 * 
 * @param {string} current The ID of the current view container. 
 * @param {*} next The ID of the next view container.
 * @param {*} currentFadeTime Optional. The fade out time for the current view.
 * @param {*} nextFadeTime Optional. The fade in time for the next view.
 * @param {*} onCurrentFade Optional. Callback function to execute when the current
 * view fades out.
 * @param {*} onNextFade Optional. Callback function to execute when the next view
 * fades in.
 */
function switchView(current, next, currentFadeTime = 500, nextFadeTime = 500, onCurrentFade = () => {}, onNextFade = () => {}){
    currentView = next

    // Los seis contenedores son hermanos en flujo normal con height:100%, así que
    // si dos quedan visibles a la vez se APILAN: el primero del DOM ocupa toda la
    // ventana y el otro cae un viewport por debajo, fuera de la vista. Pasaba al
    // pulsar dos botones seguidos (el de salida sigue siendo clicable mientras se
    // desvanece), y el jugador se quedaba mirando una pantalla sin un solo botón.
    // Por eso no nos fiamos de que 'current' sea lo que de verdad se ve: se cortan
    // todos los fundidos a medias y se ocultan todos los contenedores menos el
    // destino. Así la transición es idempotente y no depende del orden de llegada.
    const cerrar = () => {
        for(const v of Object.values(VIEWS)){
            if(v !== next){
                $(v).stop(true, false).hide()
            }
        }
    }

    $(`${current}`).stop(true, false).fadeOut(currentFadeTime, async () => {
        // Un fallo en el callback no puede impedir que aparezca la pantalla
        // siguiente: el contenedor de salida ya está oculto, así que sin este
        // try/catch el launcher se quedaba con TODO oculto y sin salida.
        try {
            await onCurrentFade()
        } catch(err) {
            console.error('[switchView] falló onCurrentFade', err)
        }
        cerrar()
        $(`${next}`).stop(true, false).fadeIn(nextFadeTime, async () => {
            try {
                await onNextFade()
            } catch(err) {
                console.error('[switchView] falló onNextFade', err)
            }
        })
    })
}

/**
 * Get the currently shown view container.
 * 
 * @returns {string} The currently shown view container.
 */
function getCurrentView(){
    return currentView
}

let mainUIStarted = false

async function showMainUI(data){
    mainUIStarted = true

    if(!isDev){
        loggerAutoUpdater.info('Initializing..')
        ipcRenderer.send('autoUpdateAction', 'initAutoUpdater', ConfigManager.getAllowPrerelease())
    }

    await prepareSettings(true)
    updateSelectedServer(data.getServerById(ConfigManager.getSelectedServer()))
    refreshServerStatus()

    // Antes había 1,75 s de esperas fijas (setTimeout 750 + fadeIn 1000 de jQuery)
    // que no hacían ningún trabajo útil y encima solapaban el fundido con el
    // spinner girando. Ahora se muestra en cuanto está listo, con transición CSS.
    document.getElementById('frameBar').style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
    document.body.style.backgroundImage = `url('assets/images/backgrounds/${document.body.getAttribute('bkid')}.jpg')`
    $('#main').show()

    const isLoggedIn = Object.keys(ConfigManager.getAuthAccounts()).length > 0

    // If this is enabled in a development environment we'll get ratelimited.
    // The relaunch frequency is usually far too high.
    if(!isDev && isLoggedIn){
        validateSelectedAccount()
    }

    if(ConfigManager.isFirstLaunch()){
        currentView = VIEWS.welcome
    } else if(isLoggedIn){
        currentView = VIEWS.landing
    } else {
        loginOptionsCancelEnabled(false)
        loginOptionsViewOnLoginSuccess = VIEWS.landing
        loginOptionsViewOnLoginCancel = VIEWS.loginOptions
        currentView = VIEWS.loginOptions
    }
    const vistaInicial = document.querySelector(currentView)
    vistaInicial.style.display = 'block'
    vistaInicial.classList.add('sc-view-in')

    // Primer arranque: en vez de asignarle PRO en silencio, se le pregunta qué
    // versión quiere. La elección queda guardada y no se vuelve a preguntar.
    if(currentView === VIEWS.landing && !ConfigManager.getPerfilElegido()){
        setTimeout(() => {
            if(typeof toggleServerSelection === 'function'){
                toggleServerSelection(true, true)
            }
        }, 700)
    }

    // Detener el giro ANTES de ocultar, para dejar de animar cuanto antes.
    $('#loadSpinnerImage').removeClass('rotating')
    const loading = document.getElementById('loadingContainer')
    loading.setAttribute('hidden-fade', '')
    setTimeout(() => { loading.style.display = 'none' }, 320)

    // Disable tabbing to the news container.
    initNews().then(() => {
        $('#newsContainer *').attr('tabindex', '-1')
    })
}

function showFatalStartupError(){
    setTimeout(() => {
        $('#loadingContainer').fadeOut(250, () => {
            document.getElementById('overlayContainer').style.background = 'none'
            setOverlayContent(
                Lang.queryJS('uibinder.startup.fatalErrorTitle'),
                Lang.queryJS('uibinder.startup.fatalErrorMessage'),
                // Reintentar es lo primero que hay que ofrecer: la causa mas
                // habitual es un corte pasajero de conexion, y antes la unica
                // salida era cerrar el launcher y volver a abrirlo a mano.
                Lang.queryJS('uibinder.startup.retryButton'),
                Lang.queryJS('uibinder.startup.closeButton')
            )
            setOverlayHandler(() => {
                remote.getCurrentWindow().reload()
            })
            setDismissHandler(() => {
                remote.getCurrentWindow().close()
            })
            toggleOverlay(true, true)
        })
    }, 750)
}

/**
 * Common functions to perform after refreshing the distro index.
 * 
 * @param {Object} data The distro index object.
 */
function onDistroRefresh(data){
    updateSelectedServer(data.getServerById(ConfigManager.getSelectedServer()))
    refreshServerStatus()
    initNews()
    syncModConfigurations(data)
    ensureJavaSettings(data)
}

/**
 * Sync the mod configurations with the distro index.
 * 
 * @param {Object} data The distro index object.
 */
function syncModConfigurations(data){

    const syncedCfgs = []

    for(let serv of data.servers){

        const id = serv.rawServer.id
        const mdls = serv.modules
        const cfg = ConfigManager.getModConfiguration(id)

        if(cfg != null){

            const modsOld = cfg.mods
            const mods = {}

            for(let mdl of mdls){
                const type = mdl.rawModule.type

                if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
                    if(!mdl.getRequired().value){
                        const mdlID = mdl.getVersionlessMavenIdentifier()
                        if(modsOld[mdlID] == null){
                            mods[mdlID] = scanOptionalSubModules(mdl.subModules, mdl)
                        } else {
                            mods[mdlID] = mergeModConfiguration(modsOld[mdlID], scanOptionalSubModules(mdl.subModules, mdl), false)
                        }
                    } else {
                        if(mdl.subModules.length > 0){
                            const mdlID = mdl.getVersionlessMavenIdentifier()
                            const v = scanOptionalSubModules(mdl.subModules, mdl)
                            if(typeof v === 'object'){
                                if(modsOld[mdlID] == null){
                                    mods[mdlID] = v
                                } else {
                                    mods[mdlID] = mergeModConfiguration(modsOld[mdlID], v, true)
                                }
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({
                id,
                mods
            })

        } else {

            const mods = {}

            for(let mdl of mdls){
                const type = mdl.rawModule.type
                if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
                    if(!mdl.getRequired().value){
                        mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
                    } else {
                        if(mdl.subModules.length > 0){
                            const v = scanOptionalSubModules(mdl.subModules, mdl)
                            if(typeof v === 'object'){
                                mods[mdl.getVersionlessMavenIdentifier()] = v
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({
                id,
                mods
            })

        }
    }

    ConfigManager.setModConfigurations(syncedCfgs)
    ConfigManager.save()
}

/**
 * Ensure java configurations are present for the available servers.
 * 
 * @param {Object} data The distro index object.
 */
function ensureJavaSettings(data) {

    // Nothing too fancy for now.
    for(const serv of data.servers){
        ConfigManager.ensureJavaConfig(serv.rawServer.id, serv.effectiveJavaOptions, serv.rawServer.javaOptions?.ram)
    }

    ConfigManager.save()
}

/**
 * Recursively scan for optional sub modules. If none are found,
 * this function returns a boolean. If optional sub modules do exist,
 * a recursive configuration object is returned.
 * 
 * @returns {boolean | Object} The resolved mod configuration.
 */
function scanOptionalSubModules(mdls, origin){
    if(mdls != null){
        const mods = {}

        for(let mdl of mdls){
            const type = mdl.rawModule.type
            // Optional types.
            if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
                // It is optional.
                if(!mdl.getRequired().value){
                    mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
                } else {
                    if(mdl.hasSubModules()){
                        const v = scanOptionalSubModules(mdl.subModules, mdl)
                        if(typeof v === 'object'){
                            mods[mdl.getVersionlessMavenIdentifier()] = v
                        }
                    }
                }
            }
        }

        if(Object.keys(mods).length > 0){
            const ret = {
                mods
            }
            if(!origin.getRequired().value){
                ret.value = origin.getRequired().def
            }
            return ret
        }
    }
    return origin.getRequired().def
}

/**
 * Recursively merge an old configuration into a new configuration.
 * 
 * @param {boolean | Object} o The old configuration value.
 * @param {boolean | Object} n The new configuration value.
 * @param {boolean} nReq If the new value is a required mod.
 * 
 * @returns {boolean | Object} The merged configuration.
 */
function mergeModConfiguration(o, n, nReq = false){
    if(typeof o === 'boolean'){
        if(typeof n === 'boolean') return o
        else if(typeof n === 'object'){
            if(!nReq){
                n.value = o
            }
            return n
        }
    } else if(typeof o === 'object'){
        if(typeof n === 'boolean') return typeof o.value !== 'undefined' ? o.value : true
        else if(typeof n === 'object'){
            if(!nReq){
                n.value = typeof o.value !== 'undefined' ? o.value : true
            }

            const newMods = Object.keys(n.mods)
            for(let i=0; i<newMods.length; i++){

                const mod = newMods[i]
                if(o.mods[mod] != null){
                    n.mods[mod] = mergeModConfiguration(o.mods[mod], n.mods[mod])
                }
            }

            return n
        }
    }
    // If for some reason we haven't been able to merge,
    // wipe the old value and use the new one. Just to be safe
    return n
}

async function validateSelectedAccount(){
    const selectedAcc = ConfigManager.getSelectedAccount()
    if(selectedAcc != null){
        const val = await AuthManager.validateSelected()
        if(!val){
            ConfigManager.removeAuthAccount(selectedAcc.uuid)
            ConfigManager.save()
            const accLen = Object.keys(ConfigManager.getAuthAccounts()).length
            setOverlayContent(
                Lang.queryJS('uibinder.validateAccount.failedMessageTitle'),
                accLen > 0
                    ? Lang.queryJS('uibinder.validateAccount.failedMessage', { 'account': selectedAcc.displayName })
                    : Lang.queryJS('uibinder.validateAccount.failedMessageSelectAnotherAccount', { 'account': selectedAcc.displayName }),
                Lang.queryJS('uibinder.validateAccount.loginButton'),
                Lang.queryJS('uibinder.validateAccount.selectAnotherAccountButton')
            )
            setOverlayHandler(() => {

                const isMicrosoft = selectedAcc.type === 'microsoft'

                if(isMicrosoft) {
                    // Empty for now
                } else {
                    // Mojang
                    // For convenience, pre-populate the username of the account.
                    document.getElementById('loginUsername').value = selectedAcc.username
                    validateEmail(selectedAcc.username)
                }
                
                loginOptionsViewOnLoginSuccess = getCurrentView()
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions

                if(accLen > 0) {
                    loginOptionsViewOnCancel = getCurrentView()
                    loginOptionsViewCancelHandler = () => {
                        if(isMicrosoft) {
                            ConfigManager.addMicrosoftAuthAccount(
                                selectedAcc.uuid,
                                selectedAcc.accessToken,
                                selectedAcc.username,
                                selectedAcc.expiresAt,
                                selectedAcc.microsoft.access_token,
                                selectedAcc.microsoft.refresh_token,
                                selectedAcc.microsoft.expires_at
                            )
                        } else {
                            ConfigManager.addMojangAuthAccount(selectedAcc.uuid, selectedAcc.accessToken, selectedAcc.username, selectedAcc.displayName)
                        }
                        ConfigManager.save()
                        validateSelectedAccount()
                    }
                    loginOptionsCancelEnabled(true)
                } else {
                    loginOptionsCancelEnabled(false)
                }
                toggleOverlay(false)
                switchView(getCurrentView(), VIEWS.loginOptions)
            })
            setDismissHandler(() => {
                if(accLen > 1){
                    prepareAccountSelectionList()
                    $('#overlayContent').fadeOut(250, () => {
                        bindOverlayKeys(true, 'accountSelectContent', true)
                        $('#accountSelectContent').fadeIn(250)
                    })
                } else {
                    const accountsObj = ConfigManager.getAuthAccounts()
                    const accounts = Array.from(Object.keys(accountsObj), v => accountsObj[v])
                    // This function validates the account switch.
                    setSelectedAccount(accounts[0].uuid)
                    toggleOverlay(false)
                }
            })
            toggleOverlay(true, accLen > 0)
        } else {
            return true
        }
    } else {
        return true
    }
}

/**
 * Temporary function to update the selected account along
 * with the relevent UI elements.
 * 
 * @param {string} uuid The UUID of the account.
 */
function setSelectedAccount(uuid){
    const authAcc = ConfigManager.setSelectedAccount(uuid)
    ConfigManager.save()
    updateSelectedAccount(authAcc)
    validateSelectedAccount()
}

// Synchronous Listener
document.addEventListener('readystatechange', async () => {

    if (document.readyState === 'interactive' || document.readyState === 'complete'){
        if(rscShouldLoad){
            rscShouldLoad = false
            if(!fatalStartupError){
                const data = await DistroAPI.getDistribution()
                await showMainUI(data)
            } else {
                showFatalStartupError()
            }
        } 
    }

}, false)

// Actions that must be performed after the distribution index is downloaded.
ipcRenderer.on('distributionIndexDone', async (event, res) => {
    if(res) {
        const data = await DistroAPI.getDistribution()
        syncModConfigurations(data)
        ensureJavaSettings(data)
        if(document.readyState === 'interactive' || document.readyState === 'complete'){
            await showMainUI(data)
        } else {
            rscShouldLoad = true
        }
    } else {
        fatalStartupError = true
        if(document.readyState === 'interactive' || document.readyState === 'complete'){
            showFatalStartupError()
        } else {
            rscShouldLoad = true
        }
    }
})

// Rescate anti-carrera: si la distribución cargó tan rápido (caché local) que el
// evento 'distributionIndexDone' se emitió ANTES de registrar el listener de arriba,
// el evento se pierde y el launcher se queda en la pantalla de carga para siempre.
// Comprobamos tras unos segundos y arrancamos manualmente si nadie lo hizo.
setTimeout(async () => {
    if(!mainUIStarted && !fatalStartupError && !rscShouldLoad){
        console.log('[UIBinder] Evento de distribución perdido por carrera — arrancando manualmente.')
        try {
            const data = await DistroAPI.getDistribution()
            // Volver a mirarlo: mientras se esperaba la distribución, el evento
            // de verdad ha podido llegar y arrancar la interfaz. Sin esta
            // segunda comprobación showMainUI corría dos veces en cualquier
            // arranque que pasara de 3 s, y las vistas quedaban descuadradas.
            if(mainUIStarted || fatalStartupError){
                return
            }
            if(data != null){
                syncModConfigurations(data)
                ensureJavaSettings(data)
                if(document.readyState === 'interactive' || document.readyState === 'complete'){
                    await showMainUI(data)
                } else {
                    rscShouldLoad = true
                }
            } else {
                fatalStartupError = true
                showFatalStartupError()
            }
        } catch(err) {
            console.error('[UIBinder] Rescate falló:', err)
            fatalStartupError = true
            showFatalStartupError()
        }
    }
}, 3000)

// Util for development
async function devModeToggle() {
    DistroAPI.toggleDevMode(true)
    const data = await DistroAPI.refreshDistributionOrFallback()
    ensureJavaSettings(data)
    updateSelectedServer(data.servers[0])
    syncModConfigurations(data)
}
