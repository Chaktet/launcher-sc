// Requirements
const os     = require('os')
const semver = require('semver')

const DropinModUtil  = require('./assets/js/dropinmodutil')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./assets/js/ipcconstants')

const settingsState = {
    invalid: new Set()
}

function bindSettingsSelect(){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]

        selectedDiv.onclick = (e) => {
            e.stopPropagation()
            closeSettingsSelect(e.target)
            e.target.nextElementSibling.toggleAttribute('hidden')
            e.target.classList.toggle('select-arrow-active')
        }
    }
}

function closeSettingsSelect(el){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]
        const optionsDiv = ele.getElementsByClassName('settingsSelectOptions')[0]

        if(!(selectedDiv === el)) {
            selectedDiv.classList.remove('select-arrow-active')
            optionsDiv.setAttribute('hidden', '')
        }
    }
}

/* If the user clicks anywhere outside the select box,
then close all select boxes: */
document.addEventListener('click', closeSettingsSelect)

bindSettingsSelect()


function bindFileSelectors(){
    for(let ele of document.getElementsByClassName('settingsFileSelButton')){
        
        ele.onclick = async e => {
            const isJavaExecSel = ele.id === 'settingsJavaExecSel'
            const directoryDialog = ele.hasAttribute('dialogDirectory') && ele.getAttribute('dialogDirectory') == 'true'
            const properties = directoryDialog ? ['openDirectory', 'createDirectory'] : ['openFile']

            const options = {
                properties
            }

            if(ele.hasAttribute('dialogTitle')) {
                options.title = ele.getAttribute('dialogTitle')
            }

            if(isJavaExecSel && process.platform === 'win32') {
                options.filters = [
                    { name: Lang.queryJS('settings.fileSelectors.executables'), extensions: ['exe'] },
                    { name: Lang.queryJS('settings.fileSelectors.allFiles'), extensions: ['*'] }
                ]
            }

            const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)
            if(!res.canceled) {
                ele.previousElementSibling.value = res.filePaths[0]
                if(isJavaExecSel) {
                    await populateJavaExecDetails(ele.previousElementSibling.value)
                }
            }
        }
    }
}

bindFileSelectors()


/**
 * General Settings Functions
 */

/**
  * Bind value validators to the settings UI elements. These will
  * validate against the criteria defined in the ConfigManager (if
  * any). If the value is invalid, the UI will reflect this and saving
  * will be disabled until the value is corrected. This is an automated
  * process. More complex UI may need to be bound separately.
  */
function initSettingsValidators(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const vFn = ConfigManager['validate' + v.getAttribute('cValue')]
        if(typeof vFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    v.addEventListener('keyup', (e) => {
                        const v = e.target
                        if(!vFn(v.value)){
                            settingsState.invalid.add(v.id)
                            v.setAttribute('error', '')
                            settingsSaveDisabled(true)
                        } else {
                            if(v.hasAttribute('error')){
                                v.removeAttribute('error')
                                settingsState.invalid.delete(v.id)
                                if(settingsState.invalid.size === 0){
                                    settingsSaveDisabled(false)
                                }
                            }
                        }
                    })
                }
            }
        }

    })
}

/**
 * Load configuration values onto the UI. This is an automated process.
 */
async function initSettingsValues(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')

    for(const v of sEls) {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const gFn = ConfigManager['get' + cVal]
        const gFnOpts = []
        if(serverDependent) {
            gFnOpts.push(ConfigManager.getSelectedServer())
        }
        if(typeof gFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    // Special Conditions
                    if(cVal === 'JavaExecutable'){
                        v.value = gFn.apply(null, gFnOpts)
                        await populateJavaExecDetails(v.value)
                    } else if (cVal === 'DataDirectory'){
                        v.value = gFn.apply(null, gFnOpts)
                    } else if(cVal === 'JVMOptions'){
                        v.value = gFn.apply(null, gFnOpts).join(' ')
                    } else {
                        v.value = gFn.apply(null, gFnOpts)
                    }
                } else if(v.type === 'checkbox'){
                    v.checked = gFn.apply(null, gFnOpts)
                }
            } else if(v.tagName === 'DIV'){
                if(v.classList.contains('rangeSlider')){
                    // Special Conditions
                    if(cVal === 'MinRAM' || cVal === 'MaxRAM'){
                        let val = gFn.apply(null, gFnOpts)
                        if(val.endsWith('M')){
                            val = Number(val.substring(0, val.length-1))/1024
                        } else {
                            val = Number.parseFloat(val)
                        }

                        v.setAttribute('value', val)
                    } else {
                        v.setAttribute('value', Number.parseFloat(gFn.apply(null, gFnOpts)))
                    }
                }
            }
        }
    }

}

/**
 * Save the settings values.
 */
function saveSettingsValues(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const sFn = ConfigManager['set' + cVal]
        const sFnOpts = []
        if(serverDependent) {
            sFnOpts.push(ConfigManager.getSelectedServer())
        }
        if(typeof sFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    // Special Conditions
                    if(cVal === 'JVMOptions'){
                        if(!v.value.trim()) {
                            sFnOpts.push([])
                            sFn.apply(null, sFnOpts)
                        } else {
                            sFnOpts.push(v.value.trim().split(/\s+/))
                            sFn.apply(null, sFnOpts)
                        }
                    } else {
                        sFnOpts.push(v.value)
                        sFn.apply(null, sFnOpts)
                    }
                } else if(v.type === 'checkbox'){
                    sFnOpts.push(v.checked)
                    sFn.apply(null, sFnOpts)
                    // Special Conditions
                    if(cVal === 'AllowPrerelease'){
                        changeAllowPrerelease(v.checked)
                    }
                }
            } else if(v.tagName === 'DIV'){
                if(v.classList.contains('rangeSlider')){
                    // Special Conditions
                    if(cVal === 'MinRAM' || cVal === 'MaxRAM'){
                        let val = Number(v.getAttribute('value'))
                        if(val%1 > 0){
                            val = val*1024 + 'M'
                        } else {
                            val = val + 'G'
                        }

                        sFnOpts.push(val)
                        sFn.apply(null, sFnOpts)
                    } else {
                        sFnOpts.push(v.getAttribute('value'))
                        sFn.apply(null, sFnOpts)
                    }
                }
            }
        }
    })
}

let selectedSettingsTab = 'settingsTabAccount'

/**
 * Modify the settings container UI when the scroll threshold reaches
 * a certain poin.
 * 
 * @param {UIEvent} e The scroll event.
 */
function settingsTabScrollListener(e){
    if(e.target.scrollTop > Number.parseFloat(getComputedStyle(e.target.firstElementChild).marginTop)){
        document.getElementById('settingsContainer').setAttribute('scrolled', '')
    } else {
        document.getElementById('settingsContainer').removeAttribute('scrolled')
    }
}

/**
 * Bind functionality for the settings navigation items.
 */
function setupSettingsTabs(){
    Array.from(document.getElementsByClassName('settingsNavItem')).map((val) => {
        if(val.hasAttribute('rSc')){
            val.onclick = () => {
                settingsNavItemListener(val)
            }
        }
    })
}

/**
 * Settings nav item onclick lisener. Function is exposed so that
 * other UI elements can quickly toggle to a certain tab from other views.
 * 
 * @param {Element} ele The nav item which has been clicked.
 * @param {boolean} fade Optional. True to fade transition.
 */
function settingsNavItemListener(ele, fade = true){
    if(ele.hasAttribute('selected')){
        return
    }
    const navItems = document.getElementsByClassName('settingsNavItem')
    for(let i=0; i<navItems.length; i++){
        if(navItems[i].hasAttribute('selected')){
            navItems[i].removeAttribute('selected')
        }
    }
    ele.setAttribute('selected', '')
    let prevTab = selectedSettingsTab
    selectedSettingsTab = ele.getAttribute('rSc')

    document.getElementById(prevTab).onscroll = null
    document.getElementById(selectedSettingsTab).onscroll = settingsTabScrollListener

    if(fade){
        $(`#${prevTab}`).fadeOut(250, () => {
            $(`#${selectedSettingsTab}`).fadeIn({
                duration: 250,
                start: () => {
                    settingsTabScrollListener({
                        target: document.getElementById(selectedSettingsTab)
                    })
                }
            })
        })
    } else {
        $(`#${prevTab}`).hide(0, () => {
            $(`#${selectedSettingsTab}`).show({
                duration: 0,
                start: () => {
                    settingsTabScrollListener({
                        target: document.getElementById(selectedSettingsTab)
                    })
                }
            })
        })
    }
}

const settingsNavDone = document.getElementById('settingsNavDone')

/**
 * Set if the settings save (done) button is disabled.
 * 
 * @param {boolean} v True to disable, false to enable.
 */
function settingsSaveDisabled(v){
    settingsNavDone.disabled = v
}

function fullSettingsSave() {
    saveSettingsValues()
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
    // The landing shows the memory the game will use.
    if(typeof window.scRefrescarPistaPerfil === 'function'){
        window.scRefrescarPistaPerfil()
    }
    // saveShaderpackSettings() eliminado: escribía shaderPack=OFF en el formato de
    // OptiFine cada vez que se pulsaba "Listo", peleándose con la pestaña Shaders.
}

/* Closes the settings view and saves all data. */
settingsNavDone.onclick = () => {
    fullSettingsSave()
    switchView(getCurrentView(), VIEWS.landing)
}

/* Abre la carpeta de registros de la instancia seleccionada, con latest.log
   resaltado, para que el jugador pueda adjuntarlo en un ticket de soporte. */
document.getElementById('settingsNavViewLogs').onclick = () => {
    const nodeFs = require('fs')
    const nodePath = require('path')
    const instDir = nodePath.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '')
    const latestLog = nodePath.join(instDir, 'logs', 'latest.log')
    if(nodeFs.existsSync(latestLog)){
        shell.showItemInFolder(latestLog)
    } else if(nodeFs.existsSync(instDir)){
        shell.openPath(instDir)
    } else {
        shell.openPath(ConfigManager.getDataDirectory())
    }
}

/* Registro del propio launcher. Es lo que hay que pedir cuando lo que falla es
   el launcher y no el juego: cuelgues, errores de login, actualizaciones. */
document.getElementById('settingsNavViewLauncherLogs').onclick = () => {
    const nodeFs = require('fs')
    const Registro = require('./assets/js/registro')
    if(nodeFs.existsSync(Registro.rutaFichero)){
        shell.showItemInFolder(Registro.rutaFichero)
    } else {
        shell.openPath(ConfigManager.getLauncherDirectory())
    }
}

/**
 * Account Management Tab
 */

const msftLoginLogger = LoggerUtil.getLogger('Microsoft Login')
const msftLogoutLogger = LoggerUtil.getLogger('Microsoft Logout')

// Bind the add mojang account button.
document.getElementById('settingsAddMojangAccount').onclick = (e) => {
    switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
        loginViewOnCancel = VIEWS.settings
        loginViewOnSuccess = VIEWS.settings
        loginCancelEnabled(true)
    })
}

// Bind the add microsoft account button.
document.getElementById('settingsAddMicrosoftAccount').onclick = (e) => {
    scVistaVueltaEspera = VIEWS.settings
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(MSFT_OPCODE.OPEN_LOGIN, VIEWS.settings, VIEWS.settings)
    })
}

/**
 * Salida de emergencia de la pantalla de espera.
 *
 * Esa pantalla solo tenía un spinner: la única forma de salir era que el proceso
 * principal respondiera al cerrarse la ventana de Microsoft. Si esa ventana se
 * abría detrás del launcher, en el otro monitor, o el jugador volvía con alt+tab
 * sin cerrarla, se quedaba encerrado ahí sin un solo botón que pulsar.
 */
let scVistaVueltaEspera = VIEWS.loginOptions

/**
 * Le pone un tiempo límite a una promesa que no lo trae de fábrica.
 *
 * Una petición HTTP cortada devuelve error enseguida, pero una COLGADA (el
 * servidor acepta la conexión y nunca contesta, típico de wifis de colegio,
 * portales cautivos y algunos antivirus con inspección SSL) no devuelve nunca.
 * Sin esto, la pantalla de espera era definitiva.
 */
function scConTiempoLimite(promesa, ms, queEs){
    let temporizador
    const limite = new Promise((_, rechazar) => {
        temporizador = setTimeout(() => {
            rechazar({
                title: Lang.queryJS('settings.msftLogin.tiempoAgotadoTitulo'),
                desc: Lang.queryJS('settings.msftLogin.tiempoAgotadoTexto')
            })
        }, ms)
    })
    return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador))
}

document.getElementById('waitingCancelButton').onclick = () => {
    // Cerrar la ventana dispara su evento 'close', que ya devuelve al launcher a
    // la pantalla anterior. Se prefiere ese camino para no tener dos salidas.
    ipcRenderer.send(MSFT_OPCODE.CANCEL)
    // Red de seguridad: si la ventana ya no existía, nadie va a responder.
    setTimeout(() => {
        if(getCurrentView() === VIEWS.waiting){
            switchView(VIEWS.waiting, scVistaVueltaEspera)
        }
    }, 1500)
}

// Bind reply for Microsoft Login.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGIN, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {

        const viewOnClose = arguments_[2]
        console.log(arguments_)
        switchView(getCurrentView(), viewOnClose, 500, 500, () => {

            if(arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLoginLogger.info('Login cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogin.errorTitle'),
                Lang.queryJS('settings.msftLogin.errorMessage'),
                Lang.queryJS('settings.msftLogin.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if(arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        const queryMap = arguments_[1]
        const viewOnClose = arguments_[2]

        // Error from request to Microsoft.
        if (Object.prototype.hasOwnProperty.call(queryMap, 'error')) {
            switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                // TODO Dont know what these errors are. Just show them I guess.
                // This is probably if you messed up the app registration with Azure.      
                let error = queryMap.error // Error might be 'access_denied' ?
                let errorDesc = queryMap.error_description
                // Al registro, no solo a la consola: si no, el jugador no tiene
                // nada que adjuntar cuando abre un ticket por no poder entrar.
                msftLoginLogger.error(`Microsoft devolvió un error en el login: ${error} — ${errorDesc}`)
                msftLoginLogger.error(`Parámetros completos: ${JSON.stringify(queryMap)}`)
                setOverlayContent(
                    error,
                    errorDesc,
                    Lang.queryJS('settings.msftLogin.okButton')
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true)

            })
        } else {

            msftLoginLogger.info('Acquired authCode, proceeding with authentication.')

            const authCode = queryMap.code
            // El intercambio de tokens (Microsoft → Xbox → XSTS → Minecraft) son
            // cuatro peticiones encadenadas sin ningún tiempo límite. Una conexión
            // COLGADA (no cortada: colgada) dejaba la pantalla de espera puesta
            // para siempre. Con esto el jugador recibe un error y vuelve atrás.
            scConTiempoLimite(AuthManager.addMicrosoftAccount(authCode), 60000, 'login de Microsoft').then(value => {
                updateSelectedAccount(value)
                switchView(getCurrentView(), viewOnClose, 500, 500, async () => {
                    await prepareSettings()
                })
            })
                .catch((displayableError) => {

                    let actualDisplayableError
                    if(isDisplayableError(displayableError)) {
                        msftLoginLogger.error('Error while logging in.', displayableError)
                        actualDisplayableError = displayableError
                    } else {
                        // Uh oh.
                        msftLoginLogger.error('Unhandled error during login.', displayableError)
                        actualDisplayableError = Lang.queryJS('login.error.unknown')
                    }

                    switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                        setOverlayContent(actualDisplayableError.title, actualDisplayableError.desc, Lang.queryJS('login.tryAgain'))
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        toggleOverlay(true)
                    })
                })
        }
    }
})

/**
 * Bind functionality for the account selection buttons. If another account
 * is selected, the UI of the previously selected account will be updated.
 */
function bindAuthAccountSelect(){
    Array.from(document.getElementsByClassName('settingsAuthAccountSelect')).map((val) => {
        val.onclick = (e) => {
            if(val.hasAttribute('selected')){
                return
            }
            const selectBtns = document.getElementsByClassName('settingsAuthAccountSelect')
            for(let i=0; i<selectBtns.length; i++){
                if(selectBtns[i].hasAttribute('selected')){
                    selectBtns[i].removeAttribute('selected')
                    selectBtns[i].innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
                }
            }
            val.setAttribute('selected', '')
            val.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
            setSelectedAccount(val.closest('.settingsAuthAccount').getAttribute('uuid'))
        }
    })
}

/**
 * Bind functionality for the log out button. If the logged out account was
 * the selected account, another account will be selected and the UI will
 * be updated accordingly.
 */
function bindAuthAccountLogOut(){
    Array.from(document.getElementsByClassName('settingsAuthAccountLogOut')).map((val) => {
        val.onclick = (e) => {
            let isLastAccount = false
            if(Object.keys(ConfigManager.getAuthAccounts()).length === 1){
                isLastAccount = true
                setOverlayContent(
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningTitle'),
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningMessage'),
                    Lang.queryJS('settings.authAccountLogout.confirmButton'),
                    Lang.queryJS('settings.authAccountLogout.cancelButton')
                )
                setOverlayHandler(() => {
                    processLogOut(val, isLastAccount)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true, true)
            } else {
                processLogOut(val, isLastAccount)
            }
            
        }
    })
}

let msAccDomElementCache
/**
 * Process a log out.
 * 
 * @param {Element} val The log out button element.
 * @param {boolean} isLastAccount If this logout is on the last added account.
 */
function processLogOut(val, isLastAccount){
    const parent = val.closest('.settingsAuthAccount')
    const uuid = parent.getAttribute('uuid')
    const prevSelAcc = ConfigManager.getSelectedAccount()
    const targetAcc = ConfigManager.getAuthAccount(uuid)
    if(targetAcc.type === 'microsoft') {
        msAccDomElementCache = parent
        scVistaVueltaEspera = VIEWS.settings
        switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
            ipcRenderer.send(MSFT_OPCODE.OPEN_LOGOUT, uuid, isLastAccount)
        })
    } else {
        // Las cuentas no premium son locales: no hay token que invalidar. El upstream
        // llamaba a removeMojangAccount, que exige un 204 de authserver.mojang.com (ya
        // retirado), así que fallaba siempre y la cuenta reaparecía al reabrir.
        Promise.resolve().then(() => {
            ConfigManager.removeAuthAccount(uuid)
            ConfigManager.save()
        }).then(() => {
            if(!isLastAccount && uuid === prevSelAcc.uuid){
                const selAcc = ConfigManager.getSelectedAccount()
                refreshAuthAccountSelected(selAcc.uuid)
                updateSelectedAccount(selAcc)
                validateSelectedAccount()
            }
            if(isLastAccount) {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.settings
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                switchView(getCurrentView(), VIEWS.loginOptions)
            }
        }).catch(err => {
            console.error('No se pudo quitar la cuenta no premium', err)
        })
        $(parent).fadeOut(250, () => {
            parent.remove()
        })
    }
}

// Bind reply for Microsoft Logout.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGOUT, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {

            if(arguments_.length > 1 && arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLogoutLogger.info('Logout cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogout.errorTitle'),
                Lang.queryJS('settings.msftLogout.errorMessage'),
                Lang.queryJS('settings.msftLogout.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if(arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        
        const uuid = arguments_[1]
        const isLastAccount = arguments_[2]
        const prevSelAcc = ConfigManager.getSelectedAccount()

        msftLogoutLogger.info('Logout Successful. uuid:', uuid)
        
        AuthManager.removeMicrosoftAccount(uuid)
            .then(() => {
                if(!isLastAccount && uuid === prevSelAcc.uuid){
                    const selAcc = ConfigManager.getSelectedAccount()
                    refreshAuthAccountSelected(selAcc.uuid)
                    updateSelectedAccount(selAcc)
                    validateSelectedAccount()
                }
                if(isLastAccount) {
                    loginOptionsCancelEnabled(false)
                    loginOptionsViewOnLoginSuccess = VIEWS.settings
                    loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                    switchView(getCurrentView(), VIEWS.loginOptions)
                }
                if(msAccDomElementCache) {
                    msAccDomElementCache.remove()
                    msAccDomElementCache = null
                }
            })
            .finally(() => {
                if(!isLastAccount) {
                    switchView(getCurrentView(), VIEWS.settings, 500, 500)
                }
            })

    }
})

/**
 * Refreshes the status of the selected account on the auth account
 * elements.
 * 
 * @param {string} uuid The UUID of the new selected account.
 */
function refreshAuthAccountSelected(uuid){
    Array.from(document.getElementsByClassName('settingsAuthAccount')).map((val) => {
        const selBtn = val.getElementsByClassName('settingsAuthAccountSelect')[0]
        if(uuid === val.getAttribute('uuid')){
            selBtn.setAttribute('selected', '')
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
        } else {
            if(selBtn.hasAttribute('selected')){
                selBtn.removeAttribute('selected')
            }
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
        }
    })
}

const settingsCurrentMicrosoftAccounts = document.getElementById('settingsCurrentMicrosoftAccounts')
const settingsCurrentMojangAccounts = document.getElementById('settingsCurrentMojangAccounts')

/**
 * Add auth account elements for each one stored in the authentication database.
 */
function populateAuthAccounts(){
    const authAccounts = ConfigManager.getAuthAccounts()
    const authKeys = Object.keys(authAccounts)
    if(authKeys.length === 0){
        return
    }
    const selectedUUID = ConfigManager.getSelectedAccount().uuid

    let microsoftAuthAccountStr = ''
    let mojangAuthAccountStr = ''

    authKeys.forEach((val) => {
        const acc = authAccounts[val]

        const accHtml = `<div class="settingsAuthAccount" uuid="${acc.uuid}">
            <div class="settingsAuthAccountLeft">
                <img class="settingsAuthAccountImage" alt="${acc.displayName}" src="https://minotar.net/armor/body/${encodeURIComponent(String(acc.uuid).replace(/-/g, ''))}/60.png">
            </div>
            <div class="settingsAuthAccountRight">
                <div class="settingsAuthAccountDetails">
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.username')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.displayName}</div>
                    </div>
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.uuid')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.uuid}</div>
                    </div>
                </div>
                <div class="settingsAuthAccountActions">
                    <button class="settingsAuthAccountSelect" ${selectedUUID === acc.uuid ? 'selected>' + Lang.queryJS('settings.authAccountPopulate.selectedAccount') : '>' + Lang.queryJS('settings.authAccountPopulate.selectAccount')}</button>
                    <div class="settingsAuthAccountWrapper">
                        <button class="settingsAuthAccountLogOut">${Lang.queryJS('settings.authAccountPopulate.logout')}</button>
                    </div>
                </div>
            </div>
        </div>`

        if(acc.type === 'microsoft') {
            microsoftAuthAccountStr += accHtml
        } else {
            mojangAuthAccountStr += accHtml
        }

    })

    settingsCurrentMicrosoftAccounts.innerHTML = microsoftAuthAccountStr
    settingsCurrentMojangAccounts.innerHTML = mojangAuthAccountStr
}

/**
 * Prepare the accounts tab for display.
 */
function prepareAccountsTab() {
    populateAuthAccounts()
    bindAuthAccountSelect()
    bindAuthAccountLogOut()
}

/**
 * Minecraft Tab
 */

/**
  * Disable decimals, negative signs, and scientific notation.
  */
document.getElementById('settingsGameWidth').addEventListener('keydown', (e) => {
    if(/^[-.eE]$/.test(e.key)){
        e.preventDefault()
    }
})
document.getElementById('settingsGameHeight').addEventListener('keydown', (e) => {
    if(/^[-.eE]$/.test(e.key)){
        e.preventDefault()
    }
})

/**
 * Mods Tab
 */

const settingsModsContainer = document.getElementById('settingsModsContainer')

/**
 * Resolve and update the mods on the UI.
 */
async function resolveModsForUI(){
    const serv = ConfigManager.getSelectedServer()

    const distro = await DistroAPI.getDistribution()
    const servConf = ConfigManager.getModConfiguration(serv)

    const modStr = parseModulesForUI(distro.getServerById(serv).modules, false, servConf.mods)

    document.getElementById('settingsReqModsContent').innerHTML = modStr.reqMods
    document.getElementById('settingsOptModsContent').innerHTML = modStr.optMods
}

/**
 * Recursively build the mod UI elements.
 * 
 * @param {Object[]} mdls An array of modules to parse.
 * @param {boolean} submodules Whether or not we are parsing submodules.
 * @param {Object} servConf The server configuration object for this module level.
 */
function parseModulesForUI(mdls, submodules, servConf){

    let reqMods = ''
    let optMods = ''

    for(const mdl of mdls){

        if(mdl.rawModule.type === Type.ForgeMod || mdl.rawModule.type === Type.LiteMod || mdl.rawModule.type === Type.LiteLoader || mdl.rawModule.type === Type.FabricMod){

            if(mdl.getRequired().value){

                reqMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${submodules ? 'Sub' : ''}Mod" enabled>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch" reqmod>
                            <input type="checkbox" checked>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, servConf[mdl.getVersionlessMavenIdentifier()])).join('')}
                    </div>` : ''}
                </div>`

            } else {

                const conf = servConf[mdl.getVersionlessMavenIdentifier()]
                const val = typeof conf === 'object' ? conf.value : conf

                optMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${submodules ? 'Sub' : ''}Mod" ${val ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${mdl.getVersionlessMavenIdentifier()}" ${val ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, conf.mods)).join('')}
                    </div>` : ''}
                </div>`

            }
        }
    }

    return {
        reqMods,
        optMods
    }

}

/**
 * Bind functionality to mod config toggle switches. Switching the value
 * will also switch the status color on the left of the mod UI.
 */
function bindModsToggleSwitch(){
    const sEls = settingsModsContainer.querySelectorAll('[formod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onchange = () => {
            if(v.checked) {
                document.getElementById(v.getAttribute('formod')).setAttribute('enabled', '')
            } else {
                document.getElementById(v.getAttribute('formod')).removeAttribute('enabled')
            }
        }
    })
}


/**
 * Save the mod configuration based on the UI values.
 */
function saveModConfiguration(){
    const serv = ConfigManager.getSelectedServer()
    const modConf = ConfigManager.getModConfiguration(serv)
    modConf.mods = _saveModConfiguration(modConf.mods)
    ConfigManager.setModConfiguration(serv, modConf)
}

/**
 * Recursively save mod config with submods.
 * 
 * @param {Object} modConf Mod config object to save.
 */
function _saveModConfiguration(modConf){
    for(let m of Object.entries(modConf)){
        const tSwitch = settingsModsContainer.querySelectorAll(`[formod='${m[0]}']`)
        if(!tSwitch[0].hasAttribute('dropin')){
            if(typeof m[1] === 'boolean'){
                modConf[m[0]] = tSwitch[0].checked
            } else {
                if(m[1] != null){
                    if(tSwitch.length > 0){
                        modConf[m[0]].value = tSwitch[0].checked
                    }
                    modConf[m[0]].mods = _saveModConfiguration(modConf[m[0]].mods)
                }
            }
        }
    }
    return modConf
}

// Drop-in mod elements.

let CACHE_SETTINGS_MODS_DIR
let CACHE_DROPIN_MODS

/**
 * Resolve any located drop-in mods for this server and
 * populate the results onto the UI.
 */
async function resolveDropinModsForUI(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    CACHE_SETTINGS_MODS_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, 'mods')
    CACHE_DROPIN_MODS = DropinModUtil.scanForDropinMods(CACHE_SETTINGS_MODS_DIR, serv.rawServer.minecraftVersion)

    let dropinMods = ''

    for(dropin of CACHE_DROPIN_MODS){
        dropinMods += `<div id="${dropin.fullName}" class="settingsBaseMod settingsDropinMod" ${!dropin.disabled ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${dropin.name}</span>
                                <div class="settingsDropinRemoveWrapper">
                                    <button class="settingsDropinRemoveButton" remmod="${dropin.fullName}">${Lang.queryJS('settings.dropinMods.removeButton')}</button>
                                </div>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${dropin.fullName}" dropin ${!dropin.disabled ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                </div>`
    }

    document.getElementById('settingsDropinModsContent').innerHTML = dropinMods
}

/**
 * Bind the remove button for each loaded drop-in mod.
 */
function bindDropinModsRemoveButton(){
    const sEls = settingsModsContainer.querySelectorAll('[remmod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onclick = async () => {
            const fullName = v.getAttribute('remmod')
            const res = await DropinModUtil.deleteDropinMod(CACHE_SETTINGS_MODS_DIR, fullName)
            if(res){
                document.getElementById(fullName).remove()
            } else {
                setOverlayContent(
                    Lang.queryJS('settings.dropinMods.deleteFailedTitle', { fullName }),
                    Lang.queryJS('settings.dropinMods.deleteFailedMessage'),
                    Lang.queryJS('settings.dropinMods.okButton')
                )
                setOverlayHandler(null)
                toggleOverlay(true)
            }
        }
    })
}

/**
 * Bind functionality to the file system button for the selected
 * server configuration.
 */
function bindDropinModFileSystemButton(){
    const fsBtn = document.getElementById('settingsDropinFileSystemButton')
    fsBtn.onclick = () => {
        DropinModUtil.validateDir(CACHE_SETTINGS_MODS_DIR)
        shell.openPath(CACHE_SETTINGS_MODS_DIR)
    }
    fsBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        fsBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    fsBtn.ondragover = e => {
        e.preventDefault()
    }
    fsBtn.ondragleave = e => {
        fsBtn.removeAttribute('drag')
    }

    fsBtn.ondrop = async e => {
        fsBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addDropinMods(e.dataTransfer.files, CACHE_SETTINGS_MODS_DIR)
        await reloadDropinMods()
    }
}

/**
 * Save drop-in mod states. Enabling and disabling is just a matter
 * of adding/removing the .disabled extension.
 */
function saveDropinModConfiguration(){
    for(dropin of CACHE_DROPIN_MODS){
        const dropinUI = document.getElementById(dropin.fullName)
        if(dropinUI != null){
            const dropinUIEnabled = dropinUI.hasAttribute('enabled')
            if(DropinModUtil.isDropinModEnabled(dropin.fullName) != dropinUIEnabled){
                DropinModUtil.toggleDropinMod(CACHE_SETTINGS_MODS_DIR, dropin.fullName, dropinUIEnabled).catch(err => {
                    if(!isOverlayVisible()){
                        setOverlayContent(
                            Lang.queryJS('settings.dropinMods.failedToggleTitle'),
                            err.message,
                            Lang.queryJS('settings.dropinMods.okButton')
                        )
                        setOverlayHandler(null)
                        toggleOverlay(true)
                    }
                })
            }
        }
    }
}

// Refresh the drop-in mods when F5 is pressed.
// Only active on the mods tab.
document.addEventListener('keydown', async (e) => {
    if(getCurrentView() !== VIEWS.settings || e.key !== 'F5'){
        return
    }
    if(selectedSettingsTab === 'settingsTabMods'){
        await reloadDropinMods()
    } else if(selectedSettingsTab === 'settingsTabShaders'){
        populateShadersTab()
    } else if(selectedSettingsTab === 'settingsTabResourcepacks'){
        await populateResourcepacksTab()
    }
})

async function reloadDropinMods(){
    await resolveDropinModsForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindModsToggleSwitch()
}

// Shaderpack

let CACHE_SETTINGS_INSTANCE_DIR
let CACHE_SHADERPACKS
let CACHE_SELECTED_SHADERPACK

/**
 * Load shaderpack information.
 */
async function resolveShaderpacksForUI(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    CACHE_SETTINGS_INSTANCE_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id)
    CACHE_SHADERPACKS = DropinModUtil.scanForShaderpacks(CACHE_SETTINGS_INSTANCE_DIR)
    CACHE_SELECTED_SHADERPACK = DropinModUtil.getEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR)

    setShadersOptions(CACHE_SHADERPACKS, CACHE_SELECTED_SHADERPACK)
}

function setShadersOptions(arr, selected){
    const cont = document.getElementById('settingsShadersOptions')
    cont.innerHTML = ''
    for(let opt of arr) {
        const d = document.createElement('DIV')
        d.innerHTML = opt.name
        d.setAttribute('value', opt.fullName)
        if(opt.fullName === selected) {
            d.setAttribute('selected', '')
            document.getElementById('settingsShadersSelected').innerHTML = opt.name
        }
        d.addEventListener('click', function(e) {
            this.parentNode.previousElementSibling.innerHTML = this.innerHTML
            for(let sib of this.parentNode.children){
                sib.removeAttribute('selected')
            }
            this.setAttribute('selected', '')
            closeSettingsSelect()
        })
        cont.appendChild(d)
    }
}

function saveShaderpackSettings(){
    let sel = 'OFF'
    for(let opt of document.getElementById('settingsShadersOptions').childNodes){
        if(opt.hasAttribute('selected')){
            sel = opt.getAttribute('value')
        }
    }
    DropinModUtil.setEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR, sel)
}

function bindShaderpackButton() {
    const spBtn = document.getElementById('settingsShaderpackButton')
    spBtn.onclick = () => {
        const p = path.join(CACHE_SETTINGS_INSTANCE_DIR, 'shaderpacks')
        DropinModUtil.validateDir(p)
        shell.openPath(p)
    }
    spBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        spBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    spBtn.ondragover = e => {
        e.preventDefault()
    }
    spBtn.ondragleave = e => {
        spBtn.removeAttribute('drag')
    }

    spBtn.ondrop = async e => {
        spBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addShaderpacks(e.dataTransfer.files, CACHE_SETTINGS_INSTANCE_DIR)
        saveShaderpackSettings()
        await resolveShaderpacksForUI()
    }
}

// Server status bar functions.

/**
 * Load the currently selected server information onto the mods tab.
 */
async function loadSelectedServerOnModsTab(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    for(const el of document.getElementsByClassName('settingsSelServContent')) {
        el.innerHTML = `
            <img class="serverListingImg" src="${serv.rawServer.icon}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${serv.rawServer.name}</span>
                <span class="serverListingDescription">${serv.rawServer.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${serv.rawServer.minecraftVersion}</div>
                    <div class="serverListingRevision">${serv.rawServer.version}</div>
                    ${serv.rawServer.mainServer ? `<div class="serverListingStarWrapper">
                        <svg id="Layer_1" viewBox="0 0 107.45 104.74" width="20px" height="20px">
                            <defs>
                                <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-miterlimit:10;}</style>
                            </defs>
                            <path class="cls-1" d="M100.93,65.54C89,62,68.18,55.65,63.54,52.13c2.7-5.23,18.8-19.2,28-27.55C81.36,31.74,63.74,43.87,58.09,45.3c-2.41-5.37-3.61-26.52-4.37-39-.77,12.46-2,33.64-4.36,39-5.7-1.46-23.3-13.57-33.49-20.72,9.26,8.37,25.39,22.36,28,27.55C39.21,55.68,18.47,62,6.52,65.55c12.32-2,33.63-6.06,39.34-4.9-.16,5.87-8.41,26.16-13.11,37.69,6.1-10.89,16.52-30.16,21-33.9,4.5,3.79,14.93,23.09,21,34C70,86.84,61.73,66.48,61.59,60.65,67.36,59.49,88.64,63.52,100.93,65.54Z"/>
                            <circle class="cls-2" cx="53.73" cy="53.9" r="38"/>
                        </svg>
                        <span class="serverListingStarTooltip">${Lang.queryJS('settings.serverListing.mainServer')}</span>
                    </div>` : ''}
                </div>
            </div>
        `
    }
}

// Bind functionality to the server switch button.
Array.from(document.getElementsByClassName('settingsSwitchServerButton')).forEach(el => {
    el.addEventListener('click', async e => {
        e.target.blur()
        await toggleServerSelection(true)
    })
})

/**
 * Save mod configuration for the current selected server.
 */
function saveAllModConfigurations(){
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
}

/**
 * Function to refresh the current tab whenever the selected
 * server is changed.
 */
function animateSettingsTabRefresh(){
    $(`#${selectedSettingsTab}`).fadeOut(500, async () => {
        await prepareSettings()
        $(`#${selectedSettingsTab}`).fadeIn(500)
    })
}

/**
 * Prepare the Mods tab for display.
 */
async function prepareModsTab(first){
    await resolveModsForUI()
    await resolveDropinModsForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindModsToggleSwitch()
    await loadSelectedServerOnModsTab()
}

/**
 * Java Tab
 */

// DOM Cache
const settingsMaxRAMRange     = document.getElementById('settingsMaxRAMRange')
const settingsMinRAMRange     = document.getElementById('settingsMinRAMRange')
const settingsMaxRAMLabel     = document.getElementById('settingsMaxRAMLabel')
const settingsMinRAMLabel     = document.getElementById('settingsMinRAMLabel')
const settingsMemoryTotal     = document.getElementById('settingsMemoryTotal')
const settingsMemoryAvail     = document.getElementById('settingsMemoryAvail')
const settingsJavaExecDetails = document.getElementById('settingsJavaExecDetails')
const settingsJavaReqDesc     = document.getElementById('settingsJavaReqDesc')
const settingsJvmOptsLink     = document.getElementById('settingsJvmOptsLink')

// Bind on change event for min memory container.
settingsMinRAMRange.onchange = (e) => {

    // Current range values
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    // Get reference to range bar.
    const bar = e.target.getElementsByClassName('rangeSliderBar')[0]
    // Calculate effective total memory.
    const max = os.totalmem()/1073741824

    // Change range bar color based on the selected value.
    if(sMinV >= max/2){
        bar.style.background = '#e86060'
    } else if(sMinV >= max/4) {
        bar.style.background = '#e8e18b'
    } else {
        bar.style.background = null
    }

    // Increase maximum memory if the minimum exceeds its value.
    if(sMaxV < sMinV){
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(settingsMaxRAMRange, sMinV,
            ((sMinV-sliderMeta.min)/sliderMeta.step)*sliderMeta.inc)
        settingsMaxRAMLabel.innerHTML = sMinV.toFixed(1) + 'G'
    }

    // Update label
    settingsMinRAMLabel.innerHTML = sMinV.toFixed(1) + 'G'
}

// Bind on change event for max memory container.
settingsMaxRAMRange.onchange = (e) => {
    // Current range values
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    // Get reference to range bar.
    const bar = e.target.getElementsByClassName('rangeSliderBar')[0]
    // Calculate effective total memory.
    const max = os.totalmem()/1073741824

    // Change range bar color based on the selected value.
    if(sMaxV >= max/2){
        bar.style.background = '#e86060'
    } else if(sMaxV >= max/4) {
        bar.style.background = '#e8e18b'
    } else {
        bar.style.background = null
    }

    // Decrease the minimum memory if the maximum value is less.
    if(sMaxV < sMinV){
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(settingsMinRAMRange, sMaxV,
            ((sMaxV-sliderMeta.min)/sliderMeta.step)*sliderMeta.inc)
        settingsMinRAMLabel.innerHTML = sMaxV.toFixed(1) + 'G'
    }
    settingsMaxRAMLabel.innerHTML = sMaxV.toFixed(1) + 'G'
}

/**
 * Calculate common values for a ranged slider.
 * 
 * @param {Element} v The range slider to calculate against. 
 * @returns {Object} An object with meta values for the provided ranged slider.
 */
function calculateRangeSliderMeta(v){
    const val = {
        max: Number(v.getAttribute('max')),
        min: Number(v.getAttribute('min')),
        step: Number(v.getAttribute('step')),
    }
    val.ticks = (val.max-val.min)/val.step
    val.inc = 100/val.ticks
    return val
}

/**
 * Binds functionality to the ranged sliders. They're more than
 * just divs now :').
 */
function bindRangeSlider(){
    Array.from(document.getElementsByClassName('rangeSlider')).map((v) => {

        // Reference the track (thumb).
        const track = v.getElementsByClassName('rangeSliderTrack')[0]

        // Set the initial slider value.
        const value = v.getAttribute('value')
        const sliderMeta = calculateRangeSliderMeta(v)

        updateRangedSlider(v, value, ((value-sliderMeta.min)/sliderMeta.step)*sliderMeta.inc)

        // The magic happens when we click on the track.
        track.onmousedown = (e) => {

            // Stop moving the track on mouse up.
            document.onmouseup = (e) => {
                document.onmousemove = null
                document.onmouseup = null
            }

            // Move slider according to the mouse position.
            document.onmousemove = (e) => {

                // Distancia desde el inicio de la barra. Rediseño v5: con offsetLeft se medía
                // contra el panel (que ya no está pegado al borde de la ventana) y el tirador
                // saltaba al empezar a arrastrar. El tirador va centrado sobre su posición.
                const rect = v.getBoundingClientRect()
                const diff = e.clientX - rect.left

                // Don't move the track off the bar.
                if(diff >= 0 && diff <= rect.width){

                    // Convert the difference to a percentage.
                    const perc = (diff/rect.width)*100
                    // Calculate the percentage of the closest notch.
                    const notch = Number(perc/sliderMeta.inc).toFixed(0)*sliderMeta.inc

                    // If we're close to that notch, stick to it.
                    if(Math.abs(perc-notch) < sliderMeta.inc/2){
                        updateRangedSlider(v, sliderMeta.min+(sliderMeta.step*(notch/sliderMeta.inc)), notch)
                    }
                }
            }
        }
    }) 
}

/**
 * Update a ranged slider's value and position.
 * 
 * @param {Element} element The ranged slider to update.
 * @param {string | number} value The new value for the ranged slider.
 * @param {number} notch The notch that the slider should now be at.
 */
function updateRangedSlider(element, value, notch){
    const oldVal = element.getAttribute('value')
    const bar = element.getElementsByClassName('rangeSliderBar')[0]
    const track = element.getElementsByClassName('rangeSliderTrack')[0]
    
    element.setAttribute('value', value)

    if(notch < 0){
        notch = 0
    } else if(notch > 100) {
        notch = 100
    }

    const event = new MouseEvent('change', {
        target: element,
        type: 'change',
        bubbles: false,
        cancelable: true
    })

    let cancelled = !element.dispatchEvent(event)

    if(!cancelled){
        track.style.left = notch + '%'
        bar.style.width = notch + '%'
    } else {
        element.setAttribute('value', oldVal)
    }
}

/**
 * Display the total and available RAM.
 */
function populateMemoryStatus(){
    settingsMemoryTotal.innerHTML = Number((os.totalmem()-1073741824)/1073741824).toFixed(1) + 'G'
    settingsMemoryAvail.innerHTML = Number(os.freemem()/1073741824).toFixed(1) + 'G'
}

/**
 * Validate the provided executable path and display the data on
 * the UI.
 * 
 * @param {string} execPath The executable path to populate against.
 */
async function populateJavaExecDetails(execPath){
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    const details = await validateSelectedJvm(ensureJavaDirIsRoot(execPath), server.effectiveJavaOptions.supported)

    if(details != null) {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.selectedJava', { version: details.semverStr, vendor: details.vendor })
    } else {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.invalidSelection')
    }
}

function populateJavaReqDesc(server) {
    settingsJavaReqDesc.innerHTML = Lang.queryJS('settings.java.requiresJava', { major: server.effectiveJavaOptions.suggestedMajor })
}

function populateJvmOptsLink(server) {
    const major = server.effectiveJavaOptions.suggestedMajor
    settingsJvmOptsLink.innerHTML = Lang.queryJS('settings.java.availableOptions', { major: major })
    if(major >= 12) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/en/java/javase/${major}/docs/specs/man/java.html#extra-options-for-java`
    }
    else if(major >= 11) {
        settingsJvmOptsLink.href = 'https://docs.oracle.com/en/java/javase/11/tools/java.html#GUID-3B1CE181-CD30-4178-9602-230B800D4FAE'
    }
    else if(major >= 9) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/tools/java.htm`
    }
    else {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/docs/technotes/tools/${process.platform === 'win32' ? 'windows' : 'unix'}/java.html`
    }
}

function bindMinMaxRam(server) {
    // Store maximum memory values.
    const SETTINGS_MAX_MEMORY = ConfigManager.getAbsoluteMaxRAM(server.rawServer.javaOptions?.ram)
    const SETTINGS_MIN_MEMORY = ConfigManager.getAbsoluteMinRAM(server.rawServer.javaOptions?.ram)

    // Set the max and min values for the ranged sliders.
    settingsMaxRAMRange.setAttribute('max', SETTINGS_MAX_MEMORY)
    settingsMaxRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
    settingsMinRAMRange.setAttribute('max', SETTINGS_MAX_MEMORY)
    settingsMinRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
}

/**
 * Prepare the Java tab for display.
 */
async function prepareJavaTab(){
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    bindMinMaxRam(server)
    bindRangeSlider(server)
    populateMemoryStatus()
    populateJavaReqDesc(server)
    populateJvmOptsLink(server)
    scSincronizarRamAuto(server)
}

/**
 * Automatic RAM (1.9.0): with the toggle on, the sliders are locked and show
 * the value the launcher will use (recalculated at every launch, see
 * landing.js scAplicarRendimiento). Turning it off keeps that value as the
 * starting point for the manual sliders.
 */
function scSincronizarRamAuto(server){
    const toggle = document.getElementById('settingsRamAuto')
    const desc = document.getElementById('settingsRamAutoDesc')
    const auto = toggle.checked
    for(const s of [settingsMaxRAMRange, settingsMinRAMRange]){
        s.toggleAttribute('disabled', auto)
    }
    if(auto){
        const gb = ScRendimiento.ramAutomatica(server.rawServer.javaOptions?.ram)
        for(const [slider, label] of [[settingsMaxRAMRange, settingsMaxRAMLabel], [settingsMinRAMRange, settingsMinRAMLabel]]){
            const meta = calculateRangeSliderMeta(slider)
            const v = Math.min(meta.max, Math.max(meta.min, gb))
            updateRangedSlider(slider, v, ((v - meta.min) / meta.step) * meta.inc)
            label.innerHTML = v.toFixed(1) + 'G'
        }
        desc.textContent = Lang.queryEJS('settings.sc2.ramAutoDesc') + ' ' +
            Lang.queryJS('settings.sc2.ramAutoValue', { gb: ScRendimiento.formatoGb(gb) })
    } else {
        desc.textContent = Lang.queryEJS('settings.sc2.ramAutoDesc')
    }
}
document.getElementById('settingsRamAuto').addEventListener('change', async () => {
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    scSincronizarRamAuto(server)
})

/**
 * One-click graphics presets (1.9.0). Written to options.txt right away when
 * the game is closed; with the game open (it rewrites options.txt on exit)
 * or before the first launch, the choice waits and landing.js applies it just
 * before the next launch.
 */
function scMarcarCalidad(){
    const actual = ConfigManager.getCalidadPendiente(ConfigManager.getSelectedServer()) || ConfigManager.getCalidad(ConfigManager.getSelectedServer())
    for(const b of document.querySelectorAll('.settingsCalidad')){
        const sel = b.dataset.nivel === actual
        b.toggleAttribute('selected', sel)
        b.setAttribute('aria-checked', sel ? 'true' : 'false')
    }
}
for(const boton of document.querySelectorAll('.settingsCalidad')){
    boton.addEventListener('click', async () => {
        const id = ConfigManager.getSelectedServer()
        const nivel = boton.dataset.nivel
        const nombre = boton.querySelector('span').textContent
        const estado = document.getElementById('settingsCalidadEstado')
        ConfigManager.setCalidad(id, nivel)
        try {
            let aplicada = false
            // Confirmed check: right after reopening the launcher the cached answer can
            // still say "closed" while Minecraft is running (it rewrites options.txt).
            if(!(await sc$juegoAbiertoConfirmado())){
                aplicada = ScRendimiento.aplicarCalidad(require('path').join(ConfigManager.getInstanceDirectory(), id), nivel)
            }
            ConfigManager.setCalidadPendiente(id, aplicada ? null : nivel)
            estado.textContent = Lang.queryJS(aplicada ? 'settings.sc2.qualityApplied' : 'settings.sc2.qualityPending', { nivel: nombre })
        } catch(e){
            console.warn('No se pudo aplicar la calidad', e)
            ConfigManager.setCalidadPendiente(id, nivel)
            estado.textContent = Lang.queryJS('settings.sc2.qualityError')
        }
        ConfigManager.save()
        scMarcarCalidad()
    })
}

/**
 * About Tab
 */

const settingsTabAbout             = document.getElementById('settingsTabAbout')
const settingsAboutChangelogTitle  = settingsTabAbout.getElementsByClassName('settingsChangelogTitle')[0]
const settingsAboutChangelogText   = settingsTabAbout.getElementsByClassName('settingsChangelogText')[0]
const settingsAboutChangelogButton = settingsTabAbout.getElementsByClassName('settingsChangelogButton')[0]

// Bind the devtools toggle button.
document.getElementById('settingsAboutDevToolsButton').onclick = (e) => {
    let window = remote.getCurrentWindow()
    window.toggleDevTools()
}

/**
 * Return whether or not the provided version is a prerelease.
 * 
 * @param {string} version The semver version to test.
 * @returns {boolean} True if the version is a prerelease, otherwise false.
 */
function isPrerelease(version){
    const preRelComp = semver.prerelease(version)
    return preRelComp != null && preRelComp.length > 0
}

/**
 * Utility method to display version information on the
 * About and Update settings tabs.
 * 
 * @param {string} version The semver version to display.
 * @param {Element} valueElement The value element.
 * @param {Element} titleElement The title element.
 * @param {Element} checkElement The check mark element.
 */
function populateVersionInformation(version, valueElement, titleElement, checkElement){
    valueElement.innerHTML = version
    if(isPrerelease(version)){
        titleElement.innerHTML = Lang.queryJS('settings.about.preReleaseTitle')
        titleElement.style.color = '#ff886d'
        checkElement.style.background = '#ff886d'
    } else {
        titleElement.innerHTML = Lang.queryJS('settings.about.stableReleaseTitle')
        titleElement.style.color = null
        checkElement.style.background = null
    }
}

/**
 * Retrieve the version information and display it on the UI.
 */
function populateAboutVersionInformation(){
    populateVersionInformation(remote.app.getVersion(), document.getElementById('settingsAboutCurrentVersionValue'), document.getElementById('settingsAboutCurrentVersionTitle'), document.getElementById('settingsAboutCurrentVersionCheck'))
}

/**
 * Fetches the GitHub atom release feed and parses it for the release notes
 * of the current version. This value is displayed on the UI.
 */
function populateReleaseNotes(){
    $.ajax({
        url: 'https://github.com/Chaktet/launcher-sc/releases.atom',
        success: (data) => {
            const version = 'v' + remote.app.getVersion()
            const entries = $(data).find('entry')

            // Versión instalada desplegada + historial de versiones anteriores plegado.
            let historyHtml = ''
            for(let i=0; i<entries.length; i++){
                const entry = $(entries[i])
                let id = entry.find('id').text()
                id = id.substring(id.lastIndexOf('/')+1)
                if(id !== version){
                    historyHtml += `<details class="sc-relnote"><summary>${entry.find('title').text()}</summary><div class="sc-relnote-body">${entry.find('content').text()}</div></details>`
                }
            }
            if(historyHtml.length > 0){
                document.getElementById('settingsAboutHistory').innerHTML = historyHtml
                document.getElementById('settingsAboutHistoryCont').style.display = 'block'
            }

            for(let i=0; i<entries.length; i++){
                const entry = $(entries[i])
                let id = entry.find('id').text()
                id = id.substring(id.lastIndexOf('/')+1)

                if(id === version){
                    settingsAboutChangelogTitle.innerHTML = entry.find('title').text()
                    settingsAboutChangelogText.innerHTML = entry.find('content').text()
                    settingsAboutChangelogButton.href = entry.find('link').attr('href')
                }
            }

        },
        timeout: 2500
    }).catch(err => {
        settingsAboutChangelogText.innerHTML = Lang.queryJS('settings.about.releaseNotesFailed')
    })
}

/**
 * Prepare account tab for display.
 */
function prepareAboutTab(){
    populateAboutVersionInformation()
    populateReleaseNotes()
}

/**
 * Update Tab
 */

const settingsTabUpdate            = document.getElementById('settingsTabUpdate')
const settingsUpdateTitle          = document.getElementById('settingsUpdateTitle')
const settingsUpdateVersionCheck   = document.getElementById('settingsUpdateVersionCheck')
const settingsUpdateVersionTitle   = document.getElementById('settingsUpdateVersionTitle')
const settingsUpdateVersionValue   = document.getElementById('settingsUpdateVersionValue')
const settingsUpdateChangelogTitle = settingsTabUpdate.getElementsByClassName('settingsChangelogTitle')[0]
const settingsUpdateChangelogText  = settingsTabUpdate.getElementsByClassName('settingsChangelogText')[0]
const settingsUpdateChangelogCont  = settingsTabUpdate.getElementsByClassName('settingsChangelogContainer')[0]
const settingsUpdateActionButton   = document.getElementById('settingsUpdateActionButton')

/**
 * Update the properties of the update action button.
 * 
 * @param {string} text The new button text.
 * @param {boolean} disabled Optional. Disable or enable the button
 * @param {function} handler Optional. New button event handler.
 */
function settingsUpdateButtonStatus(text, disabled = false, handler = null){
    settingsUpdateActionButton.innerHTML = text
    settingsUpdateActionButton.disabled = disabled
    if(handler != null){
        settingsUpdateActionButton.onclick = handler
    }
}

/**
 * Populate the update tab with relevant information.
 * 
 * @param {Object} data The update data.
 */
function populateSettingsUpdateInformation(data){
    if(data != null){
        settingsUpdateTitle.innerHTML = isPrerelease(data.version) ? Lang.queryJS('settings.updates.newPreReleaseTitle') : Lang.queryJS('settings.updates.newReleaseTitle')
        // Sin nombre ni notas en la release salía "undefined" dos veces: el título
        // cae a la versión y, sin notas, el bloque de novedades no se enseña.
        const notas = typeof data.releaseNotes === 'string' ? data.releaseNotes : ''
        settingsUpdateChangelogCont.style.display = notas ? null : 'none'
        settingsUpdateChangelogTitle.innerHTML = sc$escapeHtml(data.releaseName || ('SC Launcher ' + (data.version || '')))
        settingsUpdateChangelogText.innerHTML = notas
        populateVersionInformation(data.version, settingsUpdateVersionValue, settingsUpdateVersionTitle, settingsUpdateVersionCheck)
        
        if(process.platform === 'darwin'){
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadButton'), false, () => {
                shell.openExternal(data.darwindownload)
            })
        } else {
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadingButton'), true)
        }
    } else {
        settingsUpdateTitle.innerHTML = Lang.queryJS('settings.updates.latestVersionTitle')
        settingsUpdateChangelogCont.style.display = 'none'
        populateVersionInformation(remote.app.getVersion(), settingsUpdateVersionValue, settingsUpdateVersionTitle, settingsUpdateVersionCheck)
        settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkForUpdatesButton'), false, () => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkingForUpdatesButton'), true)
            }
        })
    }
}

/**
 * Prepare update tab for display.
 * 
 * @param {Object} data The update data.
 */
function prepareUpdateTab(data = null){
    populateSettingsUpdateInformation(data)
}

/**
 * Settings preparation functions.
 */

/**
  * Prepare the entire settings UI.
  * 
  * @param {boolean} first Whether or not it is the first load.
  */
/**
 * Shaders Tab (Iris)
 * Gestión de shaderpacks de la instancia seleccionada: activar uno, ninguno,
 * o importar zips propios. El estado vive en config/iris.properties.
 */
function sc$shadersDirs(){
    const nodePath = require('path')
    const inst = nodePath.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '')
    return {
        packs: nodePath.join(inst, 'shaderpacks'),
        irisCfg: nodePath.join(inst, 'config', 'iris.properties')
    }
}

function sc$escapeHtml(s){
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function sc$readActiveShader(){
    const nodeFs = require('fs')
    const d = sc$shadersDirs()
    try {
        if(nodeFs.existsSync(d.irisCfg)){
            const txt = nodeFs.readFileSync(d.irisCfg, 'utf8')
            const enabled = /^enableShaders\s*=\s*true/m.test(txt)
            const m = txt.match(/^shaderPack\s*=\s*(.*)$/m)
            if(enabled && m != null && m[1].trim().length > 0){
                return m[1].trim()
            }
        }
    } catch(e){
        console.warn('No se pudo leer iris.properties', e)
    }
    return null
}

function sc$writeActiveShader(packName){
    const nodeFs = require('fs')
    const nodePath = require('path')
    const d = sc$shadersDirs()
    nodeFs.mkdirSync(nodePath.dirname(d.irisCfg), { recursive: true })
    let lines = []
    if(nodeFs.existsSync(d.irisCfg)){
        lines = nodeFs.readFileSync(d.irisCfg, 'utf8').split(/\r?\n/)
            .filter(l => !/^enableShaders\s*=/.test(l) && !/^shaderPack\s*=/.test(l))
            .filter(l => l.trim().length > 0)
    }
    lines.push('enableShaders=' + (packName != null))
    lines.push('shaderPack=' + (packName != null ? packName : ''))
    nodeFs.writeFileSync(d.irisCfg, lines.join('\n') + '\n')
}

function sc$shaderDisplayName(f){
    return f.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function sc$shaderRow(packName, selected){
    const label = packName == null ? Lang.queryJS('settings.shadersNone') : sc$shaderDisplayName(packName)
    const sub = packName == null ? Lang.queryJS('settings.shadersNoneDesc') : packName
    return `<div class="settingsShaderRow" packname="${packName == null ? '' : sc$escapeHtml(packName)}"${selected ? ' selected' : ''}>
        <div class="settingsShaderRadio"></div>
        <div class="settingsShaderMeta">
            <div class="settingsShaderName">${sc$escapeHtml(label)}</div>
            <div class="settingsShaderFile">${sc$escapeHtml(sub)}</div>
        </div>
        ${selected ? `<div class="settingsShaderActive">${Lang.queryJS('settings.shadersActive')}</div>` : ''}
    </div>`
}

function populateShadersTab(){
    const nodeFs = require('fs')
    const d = sc$shadersDirs()
    const isLite = (ConfigManager.getSelectedServer() || '').toLowerCase().includes('lite')
    document.getElementById('settingsShadersNotice').style.display = isLite ? 'block' : 'none'
    let packs = []
    try {
        if(nodeFs.existsSync(d.packs)){
            packs = nodeFs.readdirSync(d.packs).filter(f => f.toLowerCase().endsWith('.zip')).sort()
        }
    } catch(e){
        packs = []
    }
    const active = sc$readActiveShader()
    const list = document.getElementById('settingsShadersList')
    let html = sc$shaderRow(null, active == null)
    for(const p of packs){
        html += sc$shaderRow(p, p === active)
    }
    list.innerHTML = html
    Array.from(list.getElementsByClassName('settingsShaderRow')).forEach(row => {
        row.onclick = () => {
            const val = row.getAttribute('packname')
            sc$writeActiveShader(val === '' ? null : val)
            populateShadersTab()
        }
    })
}

document.getElementById('settingsShadersImport').onclick = async () => {
    const nodeFs = require('fs')
    const nodePath = require('path')
    const d = sc$shadersDirs()
    const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
        title: Lang.queryJS('settings.shadersImportTitle'),
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Shader pack (.zip)', extensions: ['zip'] }]
    })
    if(res.canceled || res.filePaths.length === 0){
        return
    }
    nodeFs.mkdirSync(d.packs, { recursive: true })
    for(const fp of res.filePaths){
        nodeFs.copyFileSync(fp, nodePath.join(d.packs, nodePath.basename(fp)))
    }
    populateShadersTab()
}

/**
 * Resourcepacks Tab
 * Activa/desactiva, importa o quita paquetes de recursos. El estado vive en la
 * línea resourcePacks de options.txt (el último de la lista manda), así que el
 * pack oficial se mantiene siempre con la máxima prioridad.
 */
const SC_PACK_OFICIAL = 'SC-Pack.zip'

function sc$rpDirs(){
    const nodePath = require('path')
    const inst = nodePath.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '')
    return {
        packs: nodePath.join(inst, 'resourcepacks'),
        options: nodePath.join(inst, 'options.txt')
    }
}

function sc$readOptionsPacks(){
    const nodeFs = require('fs')
    const d = sc$rpDirs()
    const res = { base: ['vanilla', 'fabric'], enabled: [] }
    try {
        if(nodeFs.existsSync(d.options)){
            const line = nodeFs.readFileSync(d.options, 'utf8').split(/\r?\n/).find(l => l.startsWith('resourcePacks:'))
            if(line != null){
                const arr = JSON.parse(line.substring('resourcePacks:'.length))
                res.base = arr.filter(e => !e.startsWith('file/'))
                res.enabled = arr.filter(e => e.startsWith('file/')).map(e => e.substring(5))
            }
        }
    } catch(e){
        console.warn('No se pudo leer resourcePacks de options.txt', e)
    }
    return res
}

function sc$writeOptionsPacks(base, enabled){
    const nodeFs = require('fs')
    const d = sc$rpDirs()
    const value = 'resourcePacks:' + JSON.stringify([...base, ...enabled.map(f => 'file/' + f)])
    const raw = nodeFs.existsSync(d.options) ? nodeFs.readFileSync(d.options, 'utf8') : ''
    // Respetar el fin de línea original (Windows suele usar CRLF) y no dejar
    // líneas en blanco ni perder el salto final.
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    const lines = raw.length > 0 ? raw.split(/\r?\n/) : []
    while(lines.length > 0 && lines[lines.length - 1].trim() === ''){
        lines.pop()
    }
    const idx = lines.findIndex(l => l.startsWith('resourcePacks:'))
    if(idx >= 0){
        lines[idx] = value
    } else {
        lines.push(value)
    }
    nodeFs.writeFileSync(d.options, lines.join(eol) + eol)
}

/* Minecraft reescribe options.txt al cerrarse, así que cualquier cambio hecho
   con el juego abierto se perdería. */
function sc$juegoAbierto(){
    if(typeof proc !== 'undefined' && proc != null){
        return true
    }
    // También el que se lanzó en una sesión anterior del launcher y sigue abierto:
    // `proc` solo existe en memoria. Ver scjuegoabierto.js. Esta versión es la PASIVA
    // (último resultado conocido, sin esperar): vale para avisos de la interfaz y para
    // el arranque, que acaba de hacer la comprobación completa.
    return require('./assets/js/scjuegoabierto').juegoPrevioAbierto() != null
}

/** Comprobación completa y fresca, sin bloquear la interfaz: antes de escribir options.txt. */
async function sc$juegoAbiertoConfirmado(){
    if(typeof proc !== 'undefined' && proc != null){
        return true
    }
    return (await require('./assets/js/scjuegoabierto').juegoPrevioAbiertoAsync()) != null
}

async function sc$officialPackNames(){
    const nodePath = require('path')
    const out = new Set()
    try {
        const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        for(const mdl of serv.modules){
            const p = mdl.getPath()
            if(p != null && p.replace(/\\/g, '/').includes('/resourcepacks/') && p.toLowerCase().endsWith('.zip')){
                out.add(nodePath.basename(p))
            }
        }
    } catch(e){
        console.warn('No se pudo leer la lista de packs oficiales', e)
    }
    return out
}

function sc$togglePack(packName, activar){
    const { base, enabled } = sc$readOptionsPacks()
    let lista = enabled.filter(p => p !== packName)
    if(activar){
        // El pack oficial conserva siempre la prioridad más alta (va el último).
        const posOficial = lista.indexOf(SC_PACK_OFICIAL)
        if(packName !== SC_PACK_OFICIAL && posOficial >= 0){
            lista.splice(posOficial, 0, packName)
        } else {
            lista.push(packName)
        }
    }
    sc$writeOptionsPacks(base, lista)
    sc$apuntarDecision(packName, activar)
}

/**
 * Paquetes que algunos mods traen DENTRO de su jar. Minecraft los ofrece en la
 * lista de disponibles pero no los activa solo, así que el mod queda cargado y
 * sin efecto: es lo que pasaba con Punchy, que mete sus animaciones en primera
 * persona en punchy:punchy y sin activarlo no se ve ninguna.
 *
 * Van por mod para no activarle el paquete a quien tenga el mod desactivado, y
 * solo en los perfiles donde ese mod existe (Punchy está en PRO, no en LITE).
 */
const SC_PACKS_INTERNOS = [
    { pack: 'punchy:punchy', mod: 'punchy' }
]

/**
 * Los activa una única vez. options.txt no se sobrescribe en instalaciones ya
 * existentes, así que a los nuevos les llega en la distribución y a los de
 * siempre hay que llegar desde aquí. El marcador evita volver a activarlo a
 * quien lo quite a propósito.
 */
function scActivarPacksInternosDeMods(){
    if(sc$juegoAbierto()){
        return
    }
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        const serv = ConfigManager.getSelectedServer()
        if(!serv){
            return
        }
        const d = sc$rpDirs()
        if(!nodeFs.existsSync(d.options)){
            return // instalación nueva: ya le llega activado desde la distribución
        }
        const modCfg = ConfigManager.getModConfiguration(serv)
        const mods = (modCfg && modCfg.mods) || {}
        const marcador = nodePath.join(nodePath.dirname(d.options), '.sc-packs-internos.json')
        let yaHechos = []
        if(nodeFs.existsSync(marcador)){
            yaHechos = JSON.parse(nodeFs.readFileSync(marcador, 'utf8'))
        }
        let cambios = false
        for(const { pack, mod } of SC_PACKS_INTERNOS){
            if(yaHechos.includes(pack)){
                continue
            }
            // El mod tiene que estar en este perfil y activado por el jugador.
            const clave = Object.keys(mods).find(k => k.split(':')[1] === mod)
            if(clave == null){
                continue
            }
            const v = mods[clave]
            const activo = (typeof v === 'boolean') ? v : (v != null && v.value !== false)
            if(!activo){
                continue
            }
            if(!sc$readOptionsPacks().enabled.includes(pack)){
                sc$togglePack(pack, true)
            }
            yaHechos.push(pack)
            cambios = true
        }
        if(cambios){
            nodeFs.writeFileSync(marcador, JSON.stringify(yaHechos))
        }
    } catch(e){
        console.warn('No se pudieron activar los paquetes internos de los mods', e)
    }
}

/**
 * Activa una sola vez los paquetes oficiales nuevos que llegan con una
 * actualización del servidor. options.txt no se sobrescribe en instalaciones
 * ya existentes, así que sin esto el jugador se descargaría el paquete pero no
 * lo vería. Se apunta lo ya aplicado para no volver a activar lo que el jugador
 * haya desactivado a propósito.
 */
async function sc$activarPacksOficialesNuevos(oficiales){
    if(await sc$juegoAbiertoConfirmado()){
        return
    }
    const nodeFs = require('fs')
    const nodePath = require('path')
    const d = sc$rpDirs()
    const marcador = nodePath.join(nodePath.dirname(d.options), '.sc-packs-auto.json')
    try {
        let yaAplicados = []
        if(nodeFs.existsSync(marcador)){
            yaAplicados = JSON.parse(nodeFs.readFileSync(marcador, 'utf8'))
        }
        const activos = sc$readOptionsPacks().enabled
        let cambios = false
        for(const p of oficiales){
            if(yaAplicados.includes(p) || activos.includes(p)){
                if(!yaAplicados.includes(p)){
                    yaAplicados.push(p)
                    cambios = true
                }
                continue
            }
            if(nodeFs.existsSync(nodePath.join(d.packs, p))){
                sc$togglePack(p, true)
                yaAplicados.push(p)
                cambios = true
            }
        }
        if(cambios){
            nodeFs.writeFileSync(marcador, JSON.stringify(yaAplicados))
        }
    } catch(e){
        console.warn('No se pudieron activar los paquetes oficiales nuevos', e)
    }
}

/**
 * Lo que el JUGADOR ha apagado a propósito. Va en un fichero aparte del
 * marcador de automáticos para no cambiarle el formato a ese.
 */
function sc$rutaApagados(){
    const nodePath = require('path')
    return nodePath.join(nodePath.dirname(sc$rpDirs().options), '.sc-packs-apagados.json')
}

function sc$leerApagados(){
    const nodeFs = require('fs')
    try {
        const r = sc$rutaApagados()
        return nodeFs.existsSync(r) ? JSON.parse(nodeFs.readFileSync(r, 'utf8')) : []
    } catch(e){
        console.warn('No se pudo leer la lista de paquetes apagados', e)
        return []
    }
}

function sc$apuntarDecision(packName, activar){
    try {
        const lista = sc$leerApagados()
        const i = lista.indexOf(packName)
        if(activar && i >= 0){
            lista.splice(i, 1)
        } else if(!activar && i < 0){
            lista.push(packName)
        } else {
            return
        }
        require('fs').writeFileSync(sc$rutaApagados(), JSON.stringify(lista))
    } catch(e){
        console.warn('No se pudo apuntar la decisión sobre el paquete', e)
    }
}

/**
 * Repone los paquetes que borró el JUEGO, no el jugador.
 *
 * Cuando un mod no sabe leer algo del pack, Minecraft escribe "Caught error
 * loading resourcepacks, removing all selected resourcepacks" y deja
 * options.txt SIN NINGÚN paquete. El jugador se queda sin texturas y no vuelven
 * solas: sc$activarPacksOficialesNuevos ya dio el pack por aplicado y no lo
 * enciende dos veces. Pasó el 2026-09-16 con la 3.2.17, por tres modelos de
 * Cobblemon con UV por cara (ver SC-16 en docs/ERRORES.md).
 *
 * Se actúa SOLO si la lista quedó completamente vacía, que es la firma de ese
 * borrado: apagar un pack suelto desde el juego no dispara nada. Y nunca se
 * enciende uno que el jugador apagara a propósito desde Ajustes.
 *
 * @returns {Promise<boolean>} true si ha repuesto algo.
 */
async function sc$repararPacksBorradosPorElJuego(){
    if(await sc$juegoAbiertoConfirmado()){
        return false
    }
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        const d = sc$rpDirs()
        // Sin options.txt no se toca NADA: escribirlo aquí crearía un fichero con
        // solo la línea de paquetes, y como va sin hash en la distribución ya no
        // se instalaría el de verdad. El jugador perdería teclas, vídeo y la
        // lista de servidores.
        if(!nodeFs.existsSync(d.options)){
            return false
        }
        if(sc$readOptionsPacks().enabled.length > 0){
            return false
        }
        const apagados = sc$leerApagados()
        const oficiales = await sc$officialPackNames()
        const reponer = [...oficiales].filter(p => !apagados.includes(p)
            && nodeFs.existsSync(nodePath.join(d.packs, p)))
        if(reponer.length === 0){
            return false
        }
        for(const p of reponer){
            sc$togglePack(p, true)
        }
        console.log('Paquetes repuestos tras el borrado del juego: ' + reponer.join(', '))
        return true
    } catch(e){
        console.warn('No se pudieron reponer los paquetes borrados por el juego', e)
        return false
    }
}

/**
 * El SC-Pack siempre activo y el último de la lista (el que manda), antes de
 * cada partida (Felix, 19-10-2026). sc$repararPacksBorradosPorElJuego solo
 * actúa cuando la lista queda vacía y respeta lo apagado desde Ajustes; esto
 * cubre lo demás: el jugador que lo apagó, o el juego que lo quitó junto a
 * otros (pasó con Lithium + MoreCulling al montar modelos).
 *
 * Síncrona y con sc$juegoAbierto() pasivo, como scActivarPacksInternosDeMods:
 * va justo antes de pb.build().
 */
function sc$asegurarPackOficial(){
    if(sc$juegoAbierto()){
        return
    }
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        if(!ConfigManager.getSelectedServer()){
            return
        }
        const d = sc$rpDirs()
        // Sin options.txt no se crea uno a medias (ver sc$repararPacksBorradosPorElJuego),
        // ni se apunta un pack que aún no se ha descargado.
        if(!nodeFs.existsSync(d.options) || !nodeFs.existsSync(nodePath.join(d.packs, SC_PACK_OFICIAL))){
            return
        }
        const { base, enabled } = sc$readOptionsPacks()
        if(enabled[enabled.length - 1] === SC_PACK_OFICIAL){
            return
        }
        // Una lista vaciada por el juego tampoco trae vanilla ni fabric.
        sc$writeOptionsPacks(base.length > 0 ? base : ['vanilla', 'fabric'],
            [...enabled.filter(p => p !== SC_PACK_OFICIAL), SC_PACK_OFICIAL])
        sc$apuntarDecision(SC_PACK_OFICIAL, true)
        console.log('SC-Pack reactivado antes de la partida')
    } catch(e){
        console.warn('No se pudo asegurar el SC-Pack', e)
    }
}

async function populateResourcepacksTab(){
    const nodeFs = require('fs')
    const oficiales = await sc$officialPackNames()
    await sc$repararPacksBorradosPorElJuego()
    await sc$activarPacksOficialesNuevos(oficiales)
    const d = sc$rpDirs()
    let packs = []
    try {
        if(nodeFs.existsSync(d.packs)){
            packs = nodeFs.readdirSync(d.packs).filter(f => f.toLowerCase().endsWith('.zip')).sort((a, b) => a.localeCompare(b, 'es'))
        }
    } catch(e){
        packs = []
    }
    const activos = sc$readOptionsPacks().enabled
    const list = document.getElementById('settingsRpList')
    if(packs.length === 0){
        list.innerHTML = `<div class="settingsRpEmpty">${Lang.queryJS('settings.rpEmpty')}</div>`
        return
    }
    let html = ''
    for(const p of packs){
        const esOficial = oficiales.has(p)
        const activo = activos.includes(p)
        html += `<div class="settingsRpRow">
            <label class="toggleSwitch">
                <input type="checkbox" class="settingsRpToggle" packname="${sc$escapeHtml(p)}"${activo ? ' checked' : ''}>
                <span class="toggleSwitchSlider"></span>
            </label>
            <div class="settingsRpMeta">
                <div class="settingsRpName">${sc$escapeHtml(sc$shaderDisplayName(p))}${esOficial ? `<span class="settingsRpBadge">${Lang.queryJS('settings.rpOfficial')}</span>` : ''}</div>
                <div class="settingsRpFile">${sc$escapeHtml(p)}</div>
            </div>
            ${esOficial ? '' : `<button class="settingsRpDelete" packname="${sc$escapeHtml(p)}">${Lang.queryJS('settings.rpDelete')}</button>`}
        </div>`
    }
    list.innerHTML = html
    const bloqueado = await sc$juegoAbiertoConfirmado()
    document.getElementById('settingsRpGameNotice').style.display = bloqueado ? 'block' : 'none'
    Array.from(list.getElementsByClassName('settingsRpToggle')).forEach(inp => {
        // El SC-Pack no se apaga: sin él no hay menús, cosméticos ni skins del
        // servidor, y sc$asegurarPackOficial lo vuelve a encender en cada partida.
        if(inp.getAttribute('packname') === SC_PACK_OFICIAL){
            inp.checked = true
            inp.disabled = true
            inp.title = Lang.queryJS('settings.rpOfficialLocked')
            return
        }
        inp.disabled = bloqueado
        inp.onchange = async () => {
            // La pestaña pudo pintarse antes de abrir el juego: se confirma otra vez.
            if(await sc$juegoAbiertoConfirmado()){
                inp.checked = !inp.checked
                await populateResourcepacksTab()
                return
            }
            try {
                sc$togglePack(inp.getAttribute('packname'), inp.checked)
            } catch(e){
                console.warn('No se pudo guardar el cambio del paquete', e)
                inp.checked = !inp.checked // revertir: no se guardó nada
            }
        }
    })
    Array.from(list.getElementsByClassName('settingsRpDelete')).forEach(btn => {
        btn.disabled = bloqueado
        btn.onclick = () => {
            const nodePath = require('path')
            const p = btn.getAttribute('packname')
            setOverlayContent(
                Lang.queryJS('settings.rpDeleteTitle'),
                Lang.queryJS('settings.rpDeleteDesc').replace('{pack}', sc$shaderDisplayName(p)),
                Lang.queryJS('settings.rpDeleteConfirm'),
                Lang.queryJS('settings.rpDeleteCancel')
            )
            setOverlayHandler(async () => {
                toggleOverlay(false)
                // A la papelera (recuperable), igual que hace el launcher con los mods.
                const res = await ipcRenderer.invoke(SHELL_OPCODE.TRASH_ITEM, nodePath.join(d.packs, p))
                if(res.result && !(await sc$juegoAbiertoConfirmado())){
                    sc$togglePack(p, false)
                } else {
                    console.warn('No se pudo mover el paquete a la papelera', res.error)
                }
                await populateResourcepacksTab()
            })
            setDismissHandler(() => toggleOverlay(false))
            toggleOverlay(true, true)
        }
    })
}

document.getElementById('settingsRpImport').onclick = async () => {
    const nodeFs = require('fs')
    const nodePath = require('path')
    const d = sc$rpDirs()
    const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
        title: Lang.queryJS('settings.rpImportTitle'),
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Paquete de recursos (.zip)', extensions: ['zip'] }]
    })
    if(res.canceled || res.filePaths.length === 0){
        return
    }
    nodeFs.mkdirSync(d.packs, { recursive: true })
    // Con el juego abierto se copia el paquete pero no se toca options.txt: el juego
    // lo reescribiría al cerrarse. El jugador lo activa después.
    const activar = !(await sc$juegoAbiertoConfirmado())
    for(const fp of res.filePaths){
        const destino = nodePath.basename(fp)
        nodeFs.copyFileSync(fp, nodePath.join(d.packs, destino))
        if(activar){
            sc$togglePack(destino, true)
        }
    }
    await populateResourcepacksTab()
}

document.getElementById('settingsRpFolder').onclick = () => {
    const nodeFs = require('fs')
    const d = sc$rpDirs()
    nodeFs.mkdirSync(d.packs, { recursive: true })
    shell.openPath(d.packs)
}

/**
 * Panel oculto de estadísticas (solo para el staff): 5 clics en el logo de
 * "Acerca de" lo muestran. Lee stats.json generado cada 5 min en el servidor
 * de descargas a partir del log de accesos.
 */
let sc$statsClicks = 0
document.getElementById('settingsAboutLogo').addEventListener('click', async () => {
    if(++sc$statsClicks < 5){
        return
    }
    const panel = document.getElementById('settingsAboutStats')
    const grid = document.getElementById('settingsAboutStatsGrid')
    panel.style.display = 'block'
    grid.innerHTML = '…'
    try {
        const res = await fetch('https://descargas.servidorcobblemon.es/launcher/stats.json', { cache: 'no-store' })
        if(!res.ok){
            throw new Error('HTTP ' + res.status)
        }
        const s = await res.json()
        // Datos remotos: escapar siempre antes de inyectarlos como HTML.
        const fila = (label, val) => `<div class="sc-stat"><div class="sc-stat-num">${sc$escapeHtml(val)}</div><div class="sc-stat-label">${label}</div></div>`
        grid.innerHTML =
            fila(Lang.queryJS('settings.statsLaunchersHour'), s.launchers_ultimas_2h) +
            fila(Lang.queryJS('settings.statsLaunchersToday'), s.launchers_hoy) +
            fila(Lang.queryJS('settings.statsExeToday'), s.descargas_exe_hoy) +
            `<div class="sc-stat-updated">${Lang.queryJS('settings.statsUpdated')}: ${sc$escapeHtml(s.generado)}</div>`
    } catch(e){
        grid.innerHTML = `<span class="sc-stat-error">${Lang.queryJS('settings.statsError')}</span>`
    }
})

/* ---- Fondos del launcher (1.16.13) ----------------------------------------
 * Selector de Ajustes → Launcher, diseño v7 de Codex (diseno-v7-fondos). La regla
 * vive en scfondos.js: el más nuevo se pone solo cuando sale; aquí se vuelve a otro.
 */
const loggerFondos = LoggerUtil.getLogger('Fondos')
const scFondoEstados = new Map() // id → 'descargando' | 'error' (lo que no se deduce del disco)

function scTxtFondo(clave, datos){
    return Lang.queryJS('settings.fondos.' + clave, datos)
}

function scFechaFondo(fecha){
    const [y, m] = String(fecha).split('-').map(Number)
    const mes = (scTxtFondo('meses').split(',')[m - 1] || '')
    return (mes.charAt(0).toUpperCase() + mes.slice(1)) + ' de ' + y
}

function scPintarFondos(){
    const lista = document.getElementById('scFondoLista')
    if(lista == null){
        return
    }
    let ScFondos
    try {
        ScFondos = require('./assets/js/scfondos')
    } catch(e){
        loggerFondos.warn('Fondos no disponibles', e)
        return
    }
    const catalogo = ScFondos.catalogo().slice().reverse() // el más reciente primero
    const nuevoId = catalogo.length ? catalogo[0].id : null
    const usoId = document.body.getAttribute('data-sc-fondo') || ScFondos.efectivo().id
    document.getElementById('scFondoCantidad').textContent = catalogo.length === 1
        ? scTxtFondo('cantidadUno') : scTxtFondo('cantidadVarios', { n: catalogo.length })
    lista.textContent = ''
    const conRed = navigator.onLine !== false
    catalogo.forEach(f => {
        const listo = ScFondos.disponible(f)
        const estado = listo ? 'listo' : (scFondoEstados.get(f.id) || (conRed ? 'remoto' : 'sin-conexion'))
        const enUso = f.id === usoId
        const sufijo = f.id
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'scFondoTarjeta'
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', enUso ? 'true' : 'false')
        b.tabIndex = enUso ? 0 : -1
        b.title = f.nombre
        b.dataset.id = f.id
        b.dataset.estado = estado
        b.setAttribute('aria-labelledby', 'scFondoNombre-' + sufijo)
        b.setAttribute('aria-describedby', ['scFondoFecha-', 'scFondoEstado-'].map(p => p + sufijo).join(' ')
            + (f.id === nuevoId ? ' scFondoNuevo-' + sufijo : ''))
        if(estado === 'descargando' || estado === 'sin-conexion'){
            b.setAttribute('aria-disabled', 'true')
        }
        if(estado === 'descargando'){
            b.setAttribute('aria-busy', 'true')
        }

        const mini = document.createElement('span')
        mini.className = 'scFondoMiniatura'
        const alt = document.createElement('span')
        alt.className = 'scFondoAlternativa'
        alt.textContent = scTxtFondo('sinVista')
        const img = document.createElement('img')
        img.className = 'scFondoImagen'
        img.alt = ''
        img.width = 1920
        img.height = 1080
        img.loading = 'lazy'
        img.onerror = () => img.remove()
        img.src = ScFondos.miniatura(f)
        mini.append(alt, img)
        if(f.id === nuevoId){
            const n = document.createElement('span')
            n.id = 'scFondoNuevo-' + sufijo
            n.className = 'scFondoNuevo'
            n.textContent = scTxtFondo('nuevo')
            mini.append(n)
        }
        if(estado === 'descargando' || estado === 'sin-conexion'){
            const velo = document.createElement('span')
            velo.className = 'scFondoVelo'
            velo.setAttribute('aria-hidden', 'true')
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            svg.setAttribute('class', 'scFondoIcono')
            svg.setAttribute('viewBox', '0 0 24 24')
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            p.setAttribute('d', estado === 'descargando'
                ? 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'
                : 'M3 3l18 18M6 7.5a14 14 0 0 1 15 1M3 8.5l1-.6m4 4a8 8 0 0 1 3-.9m5.5 1a8 8 0 0 1 1.5.9M8.5 16a5 5 0 0 1 6.5-.2M12 20h.01')
            svg.append(p)
            velo.append(svg)
            mini.append(velo)
        }

        const datos = document.createElement('span')
        datos.className = 'scFondoDatos'
        const nombre = document.createElement('span')
        nombre.id = 'scFondoNombre-' + sufijo
        nombre.className = 'scFondoNombre'
        nombre.textContent = f.nombre
        const fecha = document.createElement('time')
        fecha.id = 'scFondoFecha-' + sufijo
        fecha.className = 'scFondoFecha'
        fecha.dateTime = String(f.fecha).slice(0, 7)
        fecha.textContent = scFechaFondo(f.fecha)
        const est = document.createElement('span')
        est.id = 'scFondoEstado-' + sufijo
        est.className = 'scFondoEstado'
        const texto = document.createElement('span')
        if(enUso){
            texto.className = 'scFondoEnUso'
            texto.textContent = scTxtFondo('enUso')
        } else {
            texto.className = 'scFondoDisponible'
            texto.textContent = scTxtFondo({ listo: 'elegir', remoto: 'descargarUsar', descargando: 'descargando',
                'sin-conexion': 'sinConexion', error: 'reintentar' }[estado])
        }
        est.append(texto)
        datos.append(nombre, fecha, est)
        b.append(mini, datos)
        b.addEventListener('click', () => scElegirFondo(f, estado, enUso))
        lista.append(b)
    })
}

function scElegirFondo(f, estado, enUso){
    if(enUso || estado === 'descargando' || estado === 'sin-conexion'){
        return
    }
    const anuncio = document.getElementById('scFondoAnuncio')
    if(estado !== 'listo'){
        scFondoEstados.set(f.id, 'descargando')
        scPintarFondos()
    }
    require('./assets/js/scfondos').elegir(f.id).then(puesto => {
        scFondoEstados.delete(f.id)
        if(puesto){
            anuncio.textContent = scTxtFondo('anuncioPuesto', { nombre: f.nombre })
        }
    }).catch(e => {
        loggerFondos.warn('No se pudo descargar el fondo', f.id, e)
        scFondoEstados.set(f.id, 'error')
        anuncio.textContent = scTxtFondo('anuncioError', { nombre: f.nombre })
    }).finally(() => {
        scPintarFondos()
        const sel = document.querySelector(`#scFondoLista .scFondoTarjeta[data-id="${CSS.escape(f.id)}"]`)
        if(sel){
            sel.focus({ preventScroll: true })
        }
    })
}

// Un fondo puesto por otra vía (el nuevo que llega solo, o al arrancar) repinta las
// tarjetas: si no, «En uso» se quedaba en el anterior y no se podía volver a él.
window.addEventListener('sc-fondo-cambiado', () => {
    if(document.getElementById('scFondoLista') != null){
        scPintarFondos()
    }
})

// Radiogroup: las flechas mueven el foco entre tarjetas (una sola parada de tabulación).
document.addEventListener('keydown', e => {
    const actual = e.target && e.target.closest ? e.target.closest('#scFondoLista .scFondoTarjeta') : null
    if(actual == null || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)){
        return
    }
    const todas = Array.from(document.querySelectorAll('#scFondoLista .scFondoTarjeta'))
    const i = todas.indexOf(actual)
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? todas.length - 1
        : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + todas.length) % todas.length
    e.preventDefault()
    todas.forEach((t, k) => { t.tabIndex = k === j ? 0 : -1 })
    todas[j].focus()
})

async function prepareSettings(first = false) {
    if(first){
        setupSettingsTabs()
        initSettingsValidators()
        prepareUpdateTab()
    } else {
        await prepareModsTab()
    }
    populateShadersTab()
    await populateResourcepacksTab()
    await initSettingsValues()
    prepareAccountsTab()
    await prepareJavaTab()
    prepareAboutTab()
    scPintarFondos()
    scMarcarCalidad()
    document.getElementById('settingsCalidadEstado').textContent = ''
}

// Prepare the settings UI on startup.
//prepareSettings(true)
