/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil.getLogger('Landing')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    if(proc != null){
        loggerLanding.info('El juego ya está en marcha — ignorando clic en JUGAR.')
        return
    }
    loggerLanding.info('Launching game..')
    if(!scComprobacionesPrevias()){
        return
    }
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()

            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        scFalloArranque(SC_ERR.JVM, Lang.queryJS('landing.launch.errGenerico'), err)
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/avatar/${authUser.uuid}/64')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '&#8226; ' + (serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection'))
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' + Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    const response = await MojangRestAPI.status()
    let statuses
    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangRestAPI.getDefaultStatuses()
    }
    
    greenCount = 0
    greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if(service.status === 'yellow' && status !== 'red'){
            status = 'yellow'
        } else if(service.status === 'red'){
            status = 'red'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    try {

        const servStat = await getServerStatus(47, serv.hostname, serv.port)
        pLabel = Lang.queryJS('landing.serverStatus.players')
        // Solo los conectados: el maximo (5000) no aporta nada al jugador.
        pVal = servStat.players.online

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 5 minutes.
let serverStatusListener = setInterval(() => refreshServerStatus(false), 30000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* ---------------------------------------------------------------------------
 * Diagnóstico de errores de arranque
 *
 * Cada punto donde el arranque puede fallar tiene un código propio. El jugador
 * ve el código y una explicación en cristiano, y con un botón se copia un
 * informe completo (sistema, RAM, Java, error real) para pegarlo en un ticket.
 * El informe se guarda además en un archivo, junto a los registros.
 * ------------------------------------------------------------------------- */
const SC_ERR = {
    DISTRO:         'SC-01', // no se pudo leer la lista de archivos del servidor
    JAVA:           'SC-02', // fallo al descargar o instalar Java
    VERIFICACION:   'SC-03', // fallo verificando los archivos ya descargados
    DESCARGA:       'SC-04', // fallo descargando mods / recursos
    REPARACION:     'SC-05', // el proceso de reparación murió
    JVM:            'SC-06', // el juego no llegó a arrancar
    LAUNCHWRAPPER:  'SC-07', // faltan librerías de arranque
    RAM:            'SC-08', // memoria asignada imposible para este equipo
    CUENTA:         'SC-09', // problema con la cuenta seleccionada
    JAVA_ROTO:      'SC-10', // la instalación de Java está incompleta o dañada
    MEMORIA:        'SC-11', // el juego se quedó sin memoria
    GRAFICOS:       'SC-12', // tarjeta gráfica o drivers: no se pudo crear la ventana
    DRIVER_SODIUM:  'SC-13', // Sodium rechaza el driver: hay UNA versión concreta que instalar
    JAVA_BLOQUEADO: 'SC-14'  // Java se instaló pero el sistema no le deja ejecutarse
}

/**
 * Lee el último informe de fallo que escribe Minecraft. Muchos cierres (sobre
 * todo los de gráficos) van ahí y no a la salida de error del proceso.
 *
 * @returns {string} Texto del informe, o cadena vacía.
 */
function scUltimoCrashReport(){
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        const dir = nodePath.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '', 'crash-reports')
        if(!nodeFs.existsSync(dir)){
            return ''
        }
        const archivos = nodeFs.readdirSync(dir)
            .filter(f => f.endsWith('.txt'))
            .map(f => ({ f, t: nodeFs.statSync(nodePath.join(dir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t)
        if(archivos.length === 0){
            return ''
        }
        // Solo si es reciente (5 min): si no, es de otra partida.
        if(Date.now() - archivos[0].t > 300000){
            return ''
        }
        return nodeFs.readFileSync(nodePath.join(dir, archivos[0].f), 'utf8')
    } catch(e){
        return ''
    }
}

/**
 * Borra la instalación de Java y la marca como no configurada, de modo que el
 * launcher la vuelva a descargar entera en el siguiente intento.
 */
function scRepararJava(){
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        const runtime = nodePath.join(ConfigManager.getDataDirectory(), 'runtime')
        nodeFs.rmSync(runtime, { recursive: true, force: true })
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), null)
        ConfigManager.save()
        return true
    } catch(e){
        loggerLanding.error('No se pudo reparar la instalación de Java', e)
        return false
    }
}

/**
 * El juego se cerró con error antes de llegar a conectar. Traduce la salida a
 * una causa concreta en vez de dejar al jugador sin información.
 *
 * @param {number} code Código de salida del proceso.
 * @param {string} salida Salida de error acumulada del juego.
 */
function scAnalizarCierreDelJuego(code, salida){
    // El informe de fallo de Minecraft suele contener la causa real cuando el
    // problema es de gráficos, porque ahí no llega nada por la salida de error.
    const crash = scUltimoCrashReport()
    const txt = (salida || '') + (crash ? '\n\n--- INFORME DE FALLO DE MINECRAFT ---\n' + crash : '')

    // Sodium comprueba el driver ANTES de arrancar y se niega a seguir con los
    // que sabe que cuelgan o corrompen el juego. Va antes que el bloque genérico
    // de gráficos a propósito: aquí la solución no es "actualiza los drivers",
    // sino UNA versión concreta que además Windows Update no entrega — hay que
    // bajarla a mano del fabricante. Decirle a este jugador que actualice por
    // Windows Update es mandarlo a un callejón sin salida.
    const driverSodium = /The game failed to start because the currently installed (Intel|NVIDIA) Graphics Driver is not compatible/i.exec(txt)
    if(driverSodium != null){
        const esIntel = driverSodium[1].toUpperCase() === 'INTEL'
        const instalada = (/Installed version:\s*([0-9][0-9.]*)/i.exec(txt) || [])[1] || '?'
        const requerida = (/Required version:\s*([0-9][0-9.]*)/i.exec(txt) || [])[1] || '?'
        const mensaje = Lang.queryJS(esIntel ? 'landing.launch.errDriverIntel' : 'landing.launch.errDriverNvidia')
            .replace('{instalada}', instalada)
            .replace('{requerida}', requerida)
        scFalloArranque(SC_ERR.DRIVER_SODIUM, mensaje, new Error(txt.slice(-4000)))
        return
    }

    // Tarjeta gráfica o drivers. Minecraft 1.21 necesita OpenGL 3.2 y Sodium 4.3;
    // con drivers viejos, ausentes o los genéricos de Windows, el juego ni
    // siquiera llega a crear la ventana.
    const PATRONES_GRAFICOS = [
        // Fallos al crear la ventana o el contexto (cualquier fabricante)
        /GLFW error|GLFWErrorCallback|glfwInit|Failed to (create|initialize) (the )?(window|GLFW|OpenGL)/i,
        /Pixel format not accelerated|Couldn't set pixel format|No OpenGL context|OpenGL context could not be created/i,
        /WGL: Driver does not support|GLX[^\n]{0,40}(not|failed)|does not support OpenGL/i,
        /OpenGL[^\n]{0,60}(is required|not supported|too old)|Requires OpenGL|OpenGL 3\.2|OpenGL 4\.3/i,
        // Sin driver real: Windows cae al renderizador genérico por software
        /GDI Generic|Microsoft Basic Display|llvmpipe|swiftshader|software renderer/i,
        // NVIDIA: OpenGL, Direct3D, CUDA y capa de compatibilidad
        /nvoglv(32|64)|nvoglshim|nvd3dum|nvwgf2um|nvapi(64)?|nvcuda|NVIDIA[^\n]{0,60}(crash|error|fail)/i,
        // AMD / ATI: OpenGL, Vulkan y capas Direct3D de todas las generaciones
        /atio(gl|6a)[0-9a-z]*\.dll|aticfx[0-9]*|atiumd[0-9a-z]*|amdvlk(64)?|amdocl[0-9a-z]*|amdxc[0-9]*|Radeon[^\n]{0,60}(crash|error|fail)/i,
        // Intel: ICD de OpenGL por generación (ig4/ig7/ig9/ig11/igxelp...) y Arc/Xe
        /ig[0-9]{1,2}icd(32|64)?|igxelpicd|igdumd[0-9a-z]*|igd10iumd[0-9a-z]*|igdrcl[0-9a-z]*|igvk(64)?|Intel[^\n]{0,60}(HD|UHD|Iris|Arc)[^\n]{0,60}(crash|error|fail)/i,
        // Caída del proceso dentro de una biblioteca gráfica
        /EXCEPTION_ACCESS_VIOLATION[\s\S]{0,600}(opengl32|vulkan-1|d3d(9|11|12)|dxgi|nvogl|atio|ig[0-9]{1,2}icd|amdvlk)/i,
        // El propio Sodium/Iris avisando de hardware o driver insuficiente
        /(sodium|iris)[^\n]{0,140}(OpenGL|driver|unsupported|no compatible|not supported|incompatible)/i
    ]
    const graficos = PATRONES_GRAFICOS.some(p => p.test(txt))

    if(graficos){
        // Si se puede identificar el fabricante, se le da su enlace concreto
        // en vez de la lista de los tres.
        let marca = ''
        if(/nvidia|geforce|nvogl|nvd3d|nvwgf|nvapi|quadro/i.test(txt)){
            marca = Lang.queryJS('landing.launch.errGraficosNvidia')
        } else if(/\bamd\b|radeon|\bati\b|atio|amdvlk|aticfx|amdocl/i.test(txt)){
            marca = Lang.queryJS('landing.launch.errGraficosAmd')
        } else if(/intel|ig[0-9]{1,2}icd|igdumd|igdrcl|igxelp|iris xe|\barc\b/i.test(txt)){
            marca = Lang.queryJS('landing.launch.errGraficosIntel')
        }
        const mensaje = Lang.queryJS('landing.launch.errGraficos') + (marca ? '<br><br>' + marca : '')
        scFalloArranque(SC_ERR.GRAFICOS, mensaje, new Error(txt.slice(-4000)))
        return
    }

    // Java incompleto: falta algún archivo del propio JDK (tzdb.dat y compañía).
    // Suele ser el antivirus poniendo ficheros en cuarentena o una extracción
    // interrumpida.
    const javaRoto = /tzdb\.dat|Error occurred during initialization of VM|ExceptionInInitializerError[\s\S]{0,200}(runtime|jdk-)|java\.lang\.NoClassDefFoundError: java\//i.test(txt)
        || /FileNotFoundException:[^\n]*(runtime|jdk-)[^\n]*/i.test(txt)

    if(javaRoto){
        scFalloArranque(SC_ERR.JAVA_ROTO, Lang.queryJS('landing.launch.errJavaRoto'), new Error(txt.slice(-3000)))
        // Se ofrece la reparación como acción principal del diálogo.
        setOverlayContent(
            Lang.queryJS('landing.launch.failureTitle'),
            `${Lang.queryJS('landing.launch.errJavaRoto')}<br><br>
             <span class="sc-cod-error">${SC_ERR.JAVA_ROTO}</span>
             <span class="sc-cod-ayuda">${Lang.queryJS('landing.launch.codigoAyuda')}</span>`,
            Lang.queryJS('landing.launch.repararJava'),
            Lang.queryJS('landing.launch.okay')
        )
        setOverlayHandler(() => {
            const ok = scRepararJava()
            setOverlayContent(
                Lang.queryJS('landing.launch.failureTitle'),
                Lang.queryJS(ok ? 'landing.launch.javaReparado' : 'landing.launch.javaNoReparado'),
                Lang.queryJS('landing.launch.okay')
            )
            setOverlayHandler(() => toggleOverlay(false))
            setDismissHandler(null)
            toggleOverlay(true)
        })
        setDismissHandler(() => toggleOverlay(false))
        toggleOverlay(true, true)
        return
    }

    if(/OutOfMemoryError|Could not reserve enough space|Failed to allocate/i.test(txt)){
        scFalloArranque(SC_ERR.MEMORIA, Lang.queryJS('landing.launch.errMemoria'), new Error(txt.slice(-3000)))
        return
    }

    scFalloArranque(SC_ERR.JVM, Lang.queryJS('landing.launch.errJvm'), new Error(`Código de salida ${code}\n\n${txt.slice(-3000)}`))
}

function scInformeDiagnostico(codigo, err){
    const os = require('os')
    const gb = b => (b / 1073741824).toFixed(1) + ' GB'
    const serv = ConfigManager.getSelectedServer()
    let javaExe = 'desconocido'
    let ramMin = '?'
    let ramMax = '?'
    try {
        javaExe = ConfigManager.getJavaExecutable(serv) || 'no configurado'
        ramMin = ConfigManager.getMinRAM(serv)
        ramMax = ConfigManager.getMaxRAM(serv)
    } catch(e){ /* configuración incompleta: se refleja como desconocido */ }

    const lineas = [
        '=== INFORME SC LAUNCHER ===',
        `Codigo:    ${codigo}`,
        `Fecha:     ${new Date().toISOString()}`,
        `Launcher:  ${remote.app.getVersion()}`,
        `Version:   ${serv}`,
        `SO:        ${os.platform()} ${os.release()} (${os.arch()})`,
        `CPU:       ${(os.cpus()[0] || {}).model || '?'} x${os.cpus().length}`,
        `RAM total: ${gb(os.totalmem())} (libre ${gb(os.freemem())})`,
        `RAM juego: min ${ramMin} / max ${ramMax}`,
        `Java:      ${javaExe}`,
        `Datos:     ${ConfigManager.getDataDirectory()}`,
        '',
        '--- ERROR ---',
        err == null ? '(sin detalle)' : (err.stack || err.message || String(err))
    ]
    return lineas.join('\n')
}

function scGuardarInforme(codigo, texto){
    try {
        const nodeFs = require('fs')
        const nodePath = require('path')
        const dir = nodePath.join(ConfigManager.getDataDirectory(), 'informes')
        nodeFs.mkdirSync(dir, { recursive: true })
        const ruta = nodePath.join(dir, `${codigo}-${Date.now()}.txt`)
        nodeFs.writeFileSync(ruta, texto)
        return ruta
    } catch(e){
        loggerLanding.warn('No se pudo guardar el informe de diagnóstico', e)
        return null
    }
}

/**
 * Muestra un fallo de arranque con código, explicación y botón para copiar el
 * informe completo.
 *
 * @param {string} codigo Uno de SC_ERR.
 * @param {string} explicacion Qué le pasa y qué puede intentar, en cristiano.
 * @param {Error|string} err Error real, para el informe.
 */
function scFalloArranque(codigo, explicacion, err){
    const informe = scInformeDiagnostico(codigo, err)
    const ruta = scGuardarInforme(codigo, informe)
    loggerLanding.error(`[${codigo}]`, err)

    const desc = `${explicacion}<br><br>
        <span class="sc-cod-error">${codigo}</span>
        <span class="sc-cod-ayuda">${Lang.queryJS('landing.launch.codigoAyuda')}</span>`

    setOverlayContent(
        Lang.queryJS('landing.launch.failureTitle'),
        desc,
        Lang.queryJS('landing.launch.copiarInforme'),
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(() => {
        try {
            require('electron').clipboard.writeText(informe)
        } catch(e){
            loggerLanding.warn('No se pudo copiar el informe', e)
        }
        if(ruta != null){
            shell.showItemInFolder(ruta)
        }
        toggleOverlay(false)
    })
    setDismissHandler(() => toggleOverlay(false))
    toggleOverlay(true, true)
    toggleLaunchArea(false)
}

/**
 * Hace que la opción de pantalla completa del launcher mande de verdad.
 *
 * El launcher solo pasaba "--fullscreen" cuando estaba ACTIVADA; al desactivarla
 * no forzaba nada, así que si el jugador había pulsado F11 alguna vez, Minecraft
 * guardaba fullscreen:true en su configuración y seguía abriendo a pantalla
 * completa ignorando el ajuste. Aquí se escribe el valor correcto antes de
 * lanzar (el juego está cerrado, así que es el momento seguro).
 */
function scAplicarPantallaCompleta(){
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        const ruta = nodePath.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '', 'options.txt')
        if(!nodeFs.existsSync(ruta)){
            return // primera partida: lo creará el juego con los argumentos de lanzamiento
        }
        const deseado = 'fullscreen:' + (ConfigManager.getFullscreen() ? 'true' : 'false')
        const raw = nodeFs.readFileSync(ruta, 'utf8')
        const eol = raw.includes('\r\n') ? '\r\n' : '\n'
        const lineas = raw.split(/\r?\n/)
        // Fuera los saltos finales antes de tocar nada: si no, cada cambio
        // dejaría una línea en blanco más en el archivo.
        while(lineas.length > 0 && lineas[lineas.length - 1].trim() === ''){
            lineas.pop()
        }
        const i = lineas.findIndex(l => l.startsWith('fullscreen:'))
        if(i >= 0){
            if(lineas[i].trim() === deseado){
                return // ya coincide, no tocamos el archivo
            }
            lineas[i] = deseado
        } else {
            lineas.push(deseado)
        }
        nodeFs.writeFileSync(ruta, lineas.join(eol) + eol)
        loggerLanding.info('Pantalla completa ajustada a', deseado)
    } catch(e){
        loggerLanding.warn('No se pudo ajustar la pantalla completa', e)
    }
}

/**
 * Teclas de Cobblemon Extended Battle UI que vienen pisadas de fábrica.
 *
 * El mod registra V, ] y [ sin comprobar si están libres, y en nuestro pack:
 *   - V  la usa Simple Voice Chat (hablar), así que abrir el panel cortaba la voz
 *   - ]  la usan los ajustes de Xaero (en teclado español se ve como "+")
 *   - [  no choca, pero se mueve junto a la otra para que la pareja de tamaño
 *        de fuente quede en dos teclas contiguas y con el mismo sentido (< >)
 *
 * Las nuevas están libres en PRO y en LITE: se comprobaron contra los 145
 * keybinds que Minecraft escribe en options.txt con todos los mods cargados.
 * En teclado español ";" es la Ñ.
 */
const SC_TECLAS_EN_CONFLICTO = [
    { opcion: 'key_key.cobblemonextendedbattleui.toggle_panel',  porDefecto: 'key.keyboard.v',             nueva: 'key.keyboard.semicolon' },
    { opcion: 'key_key.cobblemonextendedbattleui.increase_font', porDefecto: 'key.keyboard.right.bracket', nueva: 'key.keyboard.period' },
    { opcion: 'key_key.cobblemonextendedbattleui.decrease_font', porDefecto: 'key.keyboard.left.bracket',  nueva: 'key.keyboard.comma' },
    // Crafting Tweaks: la K la usa Iris para encender los shaders y el TAB es la
    // lista de jugadores de vanilla. Sus otras 13 teclas vienen sin asignar y no
    // molestan a nadie.
    { opcion: 'key_key.craftingtweaks.compress_stack',           porDefecto: 'key.keyboard.k',             nueva: 'key.keyboard.grave.accent' },
    { opcion: 'key_key.craftingtweaks.refill_last_stack',        porDefecto: 'key.keyboard.tab',           nueva: 'key.keyboard.insert' }
]

/**
 * Reasigna esas teclas en instalaciones que ya existen.
 *
 * options.txt se descarga de la distribución SIN hash, o sea que solo se
 * instala la primera vez y nunca se sobrescribe. Cambiar el valor que enviamos
 * arregla a los jugadores nuevos, pero quien ya haya arrancado el juego tiene
 * la V guardada para siempre. Esto lo corrige una única vez, y solo si la
 * tecla sigue siendo la de fábrica: si el jugador la había cambiado él, no se
 * le toca. El marcador evita volver a corregir a quien decida ponerla de vuelta.
 */
function scCorregirTeclasEnConflicto(){
    const nodeFs = require('fs')
    const nodePath = require('path')
    try {
        const dir = nodePath.join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '')
        const ruta = nodePath.join(dir, 'options.txt')
        if(!nodeFs.existsSync(ruta)){
            return // instalación nueva: ya le llegan bien desde la distribución
        }

        const marcador = nodePath.join(dir, '.sc-teclas-auto.json')
        let yaHechas = []
        if(nodeFs.existsSync(marcador)){
            yaHechas = JSON.parse(nodeFs.readFileSync(marcador, 'utf8'))
        }
        const pendientes = SC_TECLAS_EN_CONFLICTO.filter(t => !yaHechas.includes(t.opcion))
        if(pendientes.length === 0){
            return
        }

        const raw = nodeFs.readFileSync(ruta, 'utf8')
        const eol = raw.includes('\r\n') ? '\r\n' : '\n'
        const lineas = raw.split(/\r?\n/)
        while(lineas.length > 0 && lineas[lineas.length - 1].trim() === ''){
            lineas.pop()
        }

        let cambios = false
        for(const t of pendientes){
            const i = lineas.findIndex(l => l.startsWith(t.opcion + ':'))
            if(i < 0){
                // Aún no ha arrancado con el mod: se deja puesta ya la buena.
                lineas.push(t.opcion + ':' + t.nueva)
            } else if(lineas[i].slice(t.opcion.length + 1).trim() === t.porDefecto){
                lineas[i] = t.opcion + ':' + t.nueva
            } else {
                yaHechas.push(t.opcion) // la eligió el jugador, se respeta
                cambios = true
                continue
            }
            yaHechas.push(t.opcion)
            cambios = true
            loggerLanding.info('Tecla reasignada:', t.opcion, '->', t.nueva)
        }

        if(cambios){
            nodeFs.writeFileSync(ruta, lineas.join(eol) + eol)
            nodeFs.writeFileSync(marcador, JSON.stringify(yaHechas))
        }
    } catch(e){
        loggerLanding.warn('No se pudieron corregir las teclas en conflicto', e)
    }
}

/**
 * Comprobaciones previas al arranque. Detectan las causas más habituales antes
 * de que el juego falle con un error incomprensible.
 *
 * @returns {boolean} true si se puede continuar.
 */
function scComprobacionesPrevias(){
    const os = require('os')
    const serv = ConfigManager.getSelectedServer()
    try {
        const maxRAM = ConfigManager.getMaxRAM(serv)
        const m = /^(\d+(?:\.\d+)?)([MG])$/i.exec(String(maxRAM).trim())
        if(m != null){
            const bytes = parseFloat(m[1]) * (m[2].toUpperCase() === 'G' ? 1073741824 : 1048576)
            // La JVM no arranca si pide más memoria de la que hay físicamente.
            if(bytes > os.totalmem() * 0.92){
                const gb = b => (b / 1073741824).toFixed(1)
                scFalloArranque(
                    SC_ERR.RAM,
                    Lang.queryJS('landing.launch.errRam')
                        .replace('{asignada}', gb(bytes))
                        .replace('{total}', gb(os.totalmem())),
                    new Error(`maxRAM=${maxRAM} totalmem=${os.totalmem()}`)
                )
                return false
            }
        }
    } catch(e){
        loggerLanding.warn('No se pudieron hacer las comprobaciones previas', e)
    }
    return true
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(async () => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)

            // downloadJava es asíncrona: el try/catch síncrono que había aquí NO
            // veía su rechazo. Si fallaba la red o la API de Adoptium, el aviso
            // ya se había cerrado, no salía ninguno nuevo y el jugador se
            // quedaba con la barra de progreso puesta y sin botón de JUGAR.
            try {
                await downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                toggleLaunchArea(false)
                scFalloArranque(SC_ERR.JAVA, Lang.queryJS('landing.launch.errJava'), err)
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)
    clearInterval(extractListener)

    // ⚠ Comprobar que el Java recién instalado ARRANCA de verdad, antes de volver
    // a escanear. discoverBestJvmInstallation no mira los ficheros: EJECUTA cada
    // candidato y descarta en silencio el que no responde, devolviendo null igual
    // que si no hubiera Java. Resultado: se ofrecía otra vez "Instalar Java", el
    // jugador aceptaba, se instalaba bien, y vuelta a empezar — un bucle sin
    // ningún mensaje ni código de error. Pasa cuando el antivirus pone en
    // cuarentena el java.exe recién extraído, que es lo habitual.
    const validado = await validateSelectedJvm(ensureJavaDirIsRoot(newJavaExec), effectiveJavaOptions.supported)
    if(validado == null){
        loggerLanding.error(`Java instalado en ${newJavaExec} pero no se puede ejecutar.`)
        toggleLaunchArea(false)
        scFalloArranque(
            SC_ERR.JAVA_BLOQUEADO,
            Lang.queryJS('landing.launch.errJavaBloqueado').replace('{ruta}', newJavaExec),
            new Error(`JVM extraído pero no validable: ${newJavaExec}`)
        )
        return
    }

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        scFalloArranque(SC_ERR.DISTRO, Lang.queryJS('landing.launch.errDistro'), new Error('No distribution index'))
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            // Sin esto el jugador volvía a la pantalla principal SIN botón de
            // JUGAR: la barra de progreso ya estaba puesta y nadie la quitaba.
            scFalloArranque(SC_ERR.CUENTA, Lang.queryJS('landing.launch.errCuenta'), new Error('No account selected'))
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        scFalloArranque(SC_ERR.REPARACION, Lang.queryJS('landing.launch.errReparacion'), err)
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            scFalloArranque(SC_ERR.REPARACION, Lang.queryJS('landing.launch.errReparacion'), new Error(`Full Repair Module exited with code ${code}`))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        scFalloArranque(SC_ERR.VERIFICACION, Lang.queryJS('landing.launch.errVerificacion'), err)
        return
    }
    

    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            loggerLaunchSuite.error('Error during file download.')
            scFalloArranque(SC_ERR.DESCARGA, Lang.queryJS('landing.launch.errDescarga'), err)
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    fullRepairModule.destroyReceiver()

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        // Se guarda la salida del juego para poder explicar por qué se cerró: sin
        // esto, un fallo temprano solo devolvía al botón JUGAR sin decir nada.
        //
        // ⚠ Se recoge de stdout Y de stderr. Minecraft manda su registro (log4j)
        // por STDOUT, así que escuchando solo stderr esto llegaba casi siempre
        // vacío y todo acababa en el SC-06 genérico aunque el mod hubiera dicho
        // el motivo con todas las letras. Sodium es el caso claro: avisa de que
        // el driver es incompatible, lo registra, y se cierra limpiamente sin
        // generar informe de fallo — esa línea del registro era la única pista y
        // la estábamos tirando.
        let scSalidaError = []
        let scJuegoArranco = false

        const scAnotarSalida = function(data){
            scSalidaError.push(data)
            // stdout es mucho más hablador que stderr, así que se guarda más
            // margen; lo que importa siempre está al final.
            if(scSalidaError.length > 200){
                scSalidaError = scSalidaError.slice(-200)
            }
        }

        // La barra de estado se mantiene visible durante TODO el arranque del
        // juego (antes volvía al botón JUGAR a los pocos segundos y parecía
        // que no pasaba nada → la gente pulsaba JUGAR varias veces).
        const onLoadComplete = () => {
            scJuegoArranco = true
            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))
            setTimeout(() => toggleLaunchArea(false), 3000)
            if(hasRPC){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.loading'))
                proc.stdout.on('data', gameStateChange)
            }
            proc.stdout.removeListener('data', tempListener)
            proc.stderr.removeListener('data', gameErrorListener)
        }

        // Hitos reales del arranque leídos del log del juego.
        const tempListener = function(data){
            data = data.trim()
            scAnotarSalida(data)
            if(GAME_LAUNCH_REGEX.test(data)){
                setLaunchDetails('Cargando los mods..')
            } else if(GAME_JOINED_REGEX.test(data) || data.includes('Connecting to')){
                onLoadComplete()
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joined'))
            } else if(GAME_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joining'))
            }
        }

        const gameErrorListener = function(data){
            data = data.trim()
            scAnotarSalida(data)
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                scFalloArranque(SC_ERR.LAUNCHWRAPPER, Lang.queryJS('landing.launch.errLibrerias'), new Error('LaunchWrapper missing'))
            }
        }

        try {
            // La opción del launcher manda sobre lo que el juego tenga guardado.
            scAplicarPantallaCompleta()
            scCorregirTeclasEnConflicto()

            // Build Minecraft process.
            proc = pb.build()

            // Bind listeners to stdout.
            proc.stdout.on('data', tempListener)
            proc.stderr.on('data', gameErrorListener)

            setLaunchDetails('Abriendo Minecraft..')

            // Si el proceso ni siquiera llega a nacer (ejecutable de Java
            // borrado por el antivirus, permisos, ruta rota), Node avisa por
            // 'error' y NUNCA emite 'close'. Sin este listener el botón de
            // JUGAR no volvía nunca y la guarda anti doble clic bloqueaba
            // todos los intentos siguientes: el launcher quedaba inservible.
            proc.on('error', (err) => {
                loggerLaunchSuite.error('El proceso del juego no pudo arrancar.', err)
                toggleLaunchArea(false)
                proc = null
                scFalloArranque(SC_ERR.JAVA_ROTO, Lang.queryJS('landing.launch.errJavaRoto'), err)
            })

            // Si el juego muere o se cierra, restaurar el botón JUGAR.
            proc.on('close', (code) => {
                toggleLaunchArea(false)
                proc = null
                // Si el juego murió ANTES de llegar a conectar y con error,
                // hay que explicarlo: antes simplemente volvía el botón JUGAR
                // y el jugador se quedaba sin saber qué había pasado.
                if(code !== 0 && !scJuegoArranco){
                    scAnalizarCierreDelJuego(code, scSalidaError.join('\n'))
                }
            })

            // Init Discord Hook
            if(distro.rawDistribution.discord != null && serv.rawServer.discord != null){
                DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
                hasRPC = true
                proc.on('close', (code, signal) => {
                    loggerLaunchSuite.info('Shutting down Discord Rich Presence..')
                    DiscordWrapper.shutdownRPC()
                    hasRPC = false
                    proc = null
                })
            }

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            scFalloArranque(SC_ERR.JVM, Lang.queryJS('landing.launch.errJvm'), err)

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'by ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
async function loadNews(){

    const distroData = await DistroAPI.getDistribution()
    if(!distroData.rawDistribution.rss) {
        loggerLanding.debug('No RSS feed provided.')
        return null
    }

    const promise = new Promise((resolve, reject) => {
        
        const newsFeed = distroData.rawDistribution.rss
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            comments,
                            commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }).catch(err => {
            resolve({
                articles: null
            })
        })
    })

    return await promise
}

// Pista de perfiles PRO/LITE: abre el mismo selector de servidor.
const profileHint = document.getElementById('profile_hint')
if(profileHint != null){
    profileHint.addEventListener('click', () => {
        document.getElementById('server_selection_button').click()
    })
    // Actualiza el texto segun el perfil seleccionado.
    const refreshProfileHint = () => {
        const sel = ConfigManager.getSelectedServer() || ''
        if(sel.includes('Lite')){
            profileHint.innerHTML = 'Juegas la versión <strong>LITE</strong> (gama baja). ¿PC potente? <span class="profile_hint_link">Cambia a PRO aquí</span>'
        } else {
            profileHint.innerHTML = 'Juegas la versión <strong>PRO</strong>. ¿Tu PC es de gama baja? <span class="profile_hint_link">Cambia a LITE aquí</span>'
        }
    }
    refreshProfileHint()
    // Reengancha cuando cambie la seleccion (el texto del boton selector cambia al elegir).
    const selObserver = new MutationObserver(refreshProfileHint)
    selObserver.observe(document.getElementById('server_selection_button'), { childList: true, subtree: true })
}

// Toda la pildora de cuenta abre la gestion de cuentas.
const userContentChip = document.getElementById('user_content')
if(userContentChip != null){
    userContentChip.style.cursor = 'pointer'
    userContentChip.addEventListener('click', async e => {
        if(e.target && e.target.id === 'avatarOverlay'){ return }
        await prepareSettings()
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
        })
    })
}
