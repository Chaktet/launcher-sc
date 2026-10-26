const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, ipcMain, Menu, shell, Tray } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const fs                                = require('fs')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')
const scActualizaMac                    = require('./app/assets/js/scactualizamac')

// Setup Lang
LangLoader.setupLanguage()

// Los listeners del autoUpdater se registran UNA vez. initAutoUpdater se llama en
// cada carga de la interfaz (y "Reintentar" recarga la página): antes cada llamada
// añadía otra tanda y los eventos llegaban duplicados, con cuentas atrás e
// intervalos repetidos. Los eventos van siempre a la ventana de la última llamada.
let scUpdaterSender = null
let scUpdaterListeners = false
// 1.16.20: versión que el jugador saltó con "Jugar sin actualizar" (hasta cerrar el launcher). Antes la comprobación
// de cada 5 minutos la volvía a bajar (~100 MB), volvía a fallar y la puerta tapaba otra vez JUGAR: con el
// publisherName roto de la 1.16.16-1.16.18, "Jugar sin actualizar" duraba 5 minutos (21-10-2026).
let scVersionSaltada = null
let scDescargando = false
let scUltimoErrorUpdater = null

function scEnviarUpdate(...args){
    if(scUpdaterSender != null && !scUpdaterSender.isDestroyed()){
        scUpdaterSender.send('autoUpdateNotification', ...args)
    }
}

// Setup auto updater.
function initAutoUpdater(event, data) {

    scUpdaterSender = event.sender

    if(data){
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components (e.g. 0.12.1-alpha.1)
        // autoUpdater.allowPrerelease = true
    }
    
    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    } else {
        // Descarga en segundo plano y, si el jugador simplemente cierra el
        // launcher, la actualización se aplica sola sin pedirle nada.
        // La descarga la arranca 'update-available' (más abajo, 1.16.20): así una versión saltada no se vuelve a bajar.
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = true
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }
    if(scUpdaterListeners){
        return
    }
    scUpdaterListeners = true
    autoUpdater.on('update-available', (info) => {
        if(info != null && scVersionSaltada != null && String(info.version) === scVersionSaltada){
            scEnviarUpdate('update-skipped', info)
            return
        }
        scEnviarUpdate('update-available', info)
        if(process.platform !== 'darwin' && !isDev && !scDescargando){
            scDescargando = true
            // Promise.resolve().then: un error síncrono de downloadUpdate (revisión de Codex: ERR_UPDATER_NO_CHECKSUM)
            // dejaba scDescargando en true y no se volvía a bajar nada. Lo normal es que el fallo llegue ya como
            // evento 'error' (-> realerror); si no llegó, se avisa aquí.
            Promise.resolve().then(() => autoUpdater.downloadUpdate())
                .catch(err => {
                    if(err !== scUltimoErrorUpdater){
                        scEnviarUpdate('realerror', { message: String(err && err.message || err), code: err && err.code || null })
                    }
                })
                .finally(() => { scDescargando = false })
        }
        // Mac: electron-updater no puede instalar sin firma de Apple; lo hace scactualizamac.js con
        // los mismos avisos que en Windows. Si el .app no se puede sustituir, la puerta pide hacerlo a mano.
        if(process.platform === 'darwin' && !isDev && !scDescargando){
            if(!scActualizaMac.sePuedeInstalar()){
                scEnviarUpdate('mac-manual', info)
                return
            }
            scDescargando = true
            scActualizaMac.descargar(info, p => scEnviarUpdate('download-progress', p))
                .then(() => scEnviarUpdate('update-downloaded', info))
                .catch(err => {
                    console.error('[autoUpdater] Mac: ' + String(err && err.message || err))
                    scEnviarUpdate('realerror', { message: String(err && err.message || err), code: 'SC_MAC' })
                })
                .finally(() => { scDescargando = false })
        }
    })
    autoUpdater.on('download-progress', (progress) => {
        scEnviarUpdate('download-progress', progress)
    })
    autoUpdater.on('update-downloaded', (info) => {
        scEnviarUpdate('update-downloaded', info)
    })
    autoUpdater.on('update-not-available', (info) => {
        scEnviarUpdate('update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        scEnviarUpdate('checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        scUltimoErrorUpdater = err
        // Un Error no siempre cruza el IPC entero (se perdía el mensaje) y el proceso
        // principal no lo apuntaba en ningún sitio: la 1.16.16-1.16.18 rechazaban cada
        // actualización por la firma y launcher.log no decía nada (21-10-2026). Se manda
        // como objeto plano y se escribe aquí también.
        const plano = { message: String(err && err.message || err), code: err && err.code || null, stack: err && err.stack || null }
        console.error('[autoUpdater] ' + (plano.code || '') + ' ' + plano.message)
        scEnviarUpdate('realerror', plano)
    })
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch(arg){
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event, data)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'skipVersion':
            // data = versión saltada con "Jugar sin actualizar"; vacío = volver a intentarla (Reintentar, búsqueda a mano).
            scVersionSaltada = data ? String(data) : null
            break
        case 'checkForUpdate':
            autoUpdater.checkForUpdates()
                .catch(err => {
                    console.error('[autoUpdater] ' + (err && err.code || '') + ' ' + String(err && err.message || err))
                    event.sender.send('autoUpdateNotification', 'realerror',
                        { message: String(err && err.message || err), code: err && err.code || null })
                })
            break
        case 'allowPrereleaseChange':
            if(!data){
                const preRelComp = semver.prerelease(app.getVersion())
                if(preRelComp != null && preRelComp.length > 0){
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            break
        case 'installUpdateNow':
            // (isSilent, isForceRunAfter): instala sin asistente y vuelve a abrir
            // el launcher automáticamente.
            if(process.platform === 'darwin'){
                scActualizaMac.instalar()
            } else {
                autoUpdater.quitAndInstall(true, true)
            }
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})
// Mac: la actualización ya preparada se instala al cerrar el launcher, como hace
// autoInstallOnAppQuit en Windows (que no conoce la descarga de scactualizamac.js). Sin
// esto, quien cerraba con la cuenta atrás esperando a Minecraft la volvía a bajar cada vez.
app.on('will-quit', () => {
    if(process.platform === 'darwin' && !isDev && scActualizaMac.hayPreparada()){
        scActualizaMac.instalar(false)
    }
})

// Redirect distribution index event from preloader to renderer.
ipcMain.on('distributionIndexDone', (event, res) => {
    event.sender.send('distributionIndexDone', res)
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch(error) {
        return {
            result: false,
            error: error
        }
    }
})

// La aceleración por hardware se mantiene ACTIVADA a propósito: la interfaz usa
// varias capas con desenfoque (backdrop-filter) que por CPU van a tirones en
// equipos modestos. Chromium ya cae solo a software en las GPU problemáticas.
// (HeliosLauncher la desactivaba por un fallo antiguo de Electron.)


const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI_PREFIX)) {
            let queryMap = {}
            
            new URL(uri).searchParams.forEach((v, k) => {
                queryMap[k] = v
            })

            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

            msftAuthSuccess = true
            msftAuthWindow.close()
            msftAuthWindow = null
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
})

// El jugador cancela desde la pantalla de espera. Cerrar la ventana dispara su
// evento 'close', que ya responde NOT_FINISHED y devuelve al launcher a la
// pantalla anterior; así hay un único camino de vuelta en vez de dos.
ipcMain.on(MSFT_OPCODE.CANCEL, () => {
    if(msftAuthWindow) {
        msftAuthWindow.close()
    }
    if(msftLogoutWindow) {
        msftLogoutWindow.close()
    }
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Webs que la interfaz puede abrir en el navegador del sistema: la nuestra y sus
// subdominios (tienda incluida: servidorcobblemon.es/tienda), Discord, TikTok y las
// releases del launcher. Cualquier otra URL se ignora.
function scUrlPermitida(url){
    let u
    try {
        u = new URL(url)
    } catch(_e){
        return false
    }
    if(u.protocol !== 'https:'){
        return false
    }
    const h = u.hostname.toLowerCase()
    const deDominio = (d) => h === d || h.endsWith('.' + d)
    if(deDominio('servidorcobblemon.es') || deDominio('discord.gg') || deDominio('discord.com')
        || deDominio('tiktok.com')){
        return true
    }
    return h === 'github.com' && /^\/Chaktet(\/|$)/i.test(u.pathname)
}

function scAbrirFuera(url){
    if(scUrlPermitida(url)){
        shell.openExternal(url)
    } else {
        console.warn('[SC] URL externa bloqueada:', url)
    }
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow() {

    win = new BrowserWindow({
        width: 1100,
        height: 700,
        // Sin mínimo, la ventana se podía encoger hasta romper toda la interfaz.
        // Este mínimo sigue cabiendo de sobra en portátiles de 1366x768.
        minWidth: 900,
        minHeight: 540,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false,
            // Chromium frena los temporizadores y las animaciones cuando la
            // ventana queda tapada o minimizada (llega a ejecutarlos una vez
            // por minuto). Como las transiciones entre pantallas dependen del
            // final de una animación, el launcher se quedaba a medias y sin
            // responder en cuanto el jugador se iba a otra aplicación.
            // Esto no es una pestaña de fondo: nos interesa que el contador de
            // jugadores, la búsqueda de actualizaciones y las descargas sigan
            // funcionando aunque no esté delante.
            backgroundThrottling: false
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    const data = {
        bkid: Math.floor((Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length)),
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    // La ventana principal tiene Node (nodeIntegration): si algo la hiciera navegar a
    // una web (un enlace de una noticia, un fallo en un handler), esa web tendría
    // acceso al PC del jugador. No se navega nunca fuera de app.ejs; los enlaces de
    // confianza se abren en el navegador del sistema.
    win.webContents.on('will-navigate', (e, url) => {
        if(url === win.webContents.getURL()){
            return // recarga de la propia interfaz ("Reintentar")
        }
        e.preventDefault()
        scAbrirFuera(url)
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
        scAbrirFuera(url)
        return { action: 'deny' }
    })
    // Si el renderer muere (memoria, GPU, un fallo nativo) la ventana se quedaba en
    // blanco sin salida: se registra y se recarga la interfaz.
    win.webContents.on('render-process-gone', (_e, details) => {
        console.error('[SC] El proceso de la interfaz ha muerto:', details.reason, details.exitCode)
        if(details.reason !== 'clean-exit' && win != null && !win.isDestroyed()){
            // If it was hidden for the game, the reloaded UI loses the game's events.
            scMostrarVentana()
            setTimeout(() => {
                if(win != null && !win.isDestroyed()){
                    win.reload()
                }
            }, 1000)
        }
    })

    win.removeMenu()

    win.resizable = true

    win.on('closed', () => {
        win = null
    })
}

function createMenu() {
    
    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

// Tray icon (1.10.0): always there while the launcher runs. While playing,
// "Minimizar al jugar" hides the window here instead of the taskbar; clicking
// the icon (or opening the launcher again) brings it back.
let scTray = null
let scOcultaPorJuego = false

function scMostrarVentana(ventana = win){
    if(ventana == null || ventana.isDestroyed()){
        return
    }
    ventana.setSkipTaskbar(false)
    ventana.show()
    if(ventana.isMinimized()){
        ventana.restore()
    }
    ventana.focus()
    scOcultaPorJuego = false
}

function scCrearBandeja(){
    if(scTray != null || process.platform !== 'win32'){
        return
    }
    try {
        scTray = new Tray(getPlatformIcon('SealCircle'))
        scTray.setToolTip('SC Launcher')
        scTray.setContextMenu(Menu.buildFromTemplate([
            { label: LangLoader.queryJS('tray.open'), click: () => scMostrarVentana() },
            { type: 'separator' },
            { label: LangLoader.queryJS('tray.quit'), click: () => app.quit() }
        ]))
        scTray.on('click', () => scMostrarVentana())
    } catch(err) {
        console.error('[SC] No se pudo crear el icono de la bandeja', err)
        scTray = null
    }
}

// 'ocultar' when the game has finished loading, 'restaurar' when it closes
// (only if it was hidden for the game: a window the player reopened stays).
ipcMain.on('sc-ventana-juego', (_event, accion) => {
    if(win == null || win.isDestroyed()){
        return
    }
    if(accion === 'ocultar'){
        if(scTray != null){
            win.setSkipTaskbar(true)
            win.hide()
        } else {
            win.minimize()
        }
        scOcultaPorJuego = true
    } else if(accion === 'restaurar' && scOcultaPorJuego){
        scMostrarVentana()
    } else if(accion === 'mostrar'){
        // Click on a desktop reminder (eventos.js).
        scMostrarVentana()
    }
})

// «Abrir al encender el PC» (1.17.4). Lo piden Ajustes y la pregunta única de landing.js.
// Solo en el launcher instalado: en desarrollo registraría electron.exe en el arranque de Windows.
// El nombre es fijo porque es el que borra el desinstalador (build/installer.nsh).
ipcMain.handle('sc-abrir-con-windows', (_event, activar) => {
    if(process.platform !== 'win32' || !app.isPackaged){
        return false
    }
    try {
        app.setLoginItemSettings({ openAtLogin: activar === true, name: 'SC Launcher' })
        return true
    } catch(err) {
        console.error('[SC] No se pudo cambiar el arranque con Windows', err)
        return false
    }
})

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

// Una sola instancia. Dos launchers abiertos comparten el mismo directorio de
// datos, así que pueden estar descargando y validando LOS MISMOS ficheros a la
// vez: el segundo se encuentra archivos a medio escribir por el primero y el
// juego revienta al abrirlos. Si ya hay una abierta, se trae al frente en vez
// de arrancar otra.
// Identidad de las notificaciones en Windows. Sin esto Electron usa
// «electron.app.SC Launcher», que no coincide con ningún acceso directo, y el
// centro de notificaciones muestra ese ID en crudo sin nombre ni icono. Debe ser
// IGUAL al appId de electron-builder.yml: el instalador NSIS lo graba en el
// acceso directo del menú Inicio y Windows saca de ahí el nombre y el icono.
if(process.platform === 'win32'){
    app.setAppUserModelId('es.servidorcobblemon.sclauncher')
}

if(!app.requestSingleInstanceLock()){
    app.quit()
} else {
    app.on('second-instance', () => {
        const [ventana] = require('electron').BrowserWindow.getAllWindows()
        if(ventana != null){
            scMostrarVentana(ventana)
        }
    })

    app.on('ready', createWindow)
    app.on('ready', scCrearBandeja)
    app.on('ready', createMenu)
}

app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})
