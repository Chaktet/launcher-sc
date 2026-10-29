const fs   = require('fs-extra')
const { LoggerUtil } = require('helios-core')
const os   = require('os')
const path = require('path')

const logger = LoggerUtil.getLogger('ConfigManager')

const sysRoot = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME)

const dataPath = path.join(sysRoot, '.helioslauncher')

const launcherDir = require('@electron/remote').app.getPath('userData')

/**
 * Retrieve the absolute path of the launcher directory.
 * 
 * @returns {string} The absolute path of the launcher directory.
 */
exports.getLauncherDirectory = function(){
    return launcherDir
}

/**
 * Get the launcher's data directory. This is where all files related
 * to game launch are installed (common, instances, java, etc).
 * 
 * @returns {string} The absolute path of the launcher's data directory.
 */
exports.getDataDirectory = function(def = false){
    return !def ? config.settings.launcher.dataDirectory : DEFAULT_CONFIG.settings.launcher.dataDirectory
}

/**
 * Set the new data directory.
 * 
 * @param {string} dataDirectory The new data directory.
 */
exports.setDataDirectory = function(dataDirectory){
    config.settings.launcher.dataDirectory = dataDirectory
}

const configPath = path.join(exports.getLauncherDirectory(), 'config.json')
const configPathLEGACY = path.join(dataPath, 'config.json')
// Copia de la última configuración válida (ver save()).
const configPathBak = configPath + '.bak'
// Con una copia válida no es un primer arranque: load() la recupera.
const firstLaunch = !fs.existsSync(configPath) && !fs.existsSync(configPathLEGACY)
    && scLeerConfig(configPathBak) == null

exports.getAbsoluteMinRAM = function(ram){
    if(ram?.minimum != null) {
        return ram.minimum/1024
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (6*1073741824) ? 3 : 2
    }
}

exports.getAbsoluteMaxRAM = function(_ram){
    const mem = os.totalmem()
    const gT16 = mem-(16*1073741824)
    return Math.floor((mem-(gT16 > 0 ? (Number.parseInt(gT16/8) + (16*1073741824)/4) : mem/4))/1073741824)
}

function resolveSelectedRAM(ram) {
    if(ram?.recommended != null) {
        return `${ram.recommended}M`
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (8*1073741824) ? '4G' : (mem >= (6*1073741824) ? '3G' : '2G')
    }
}

/**
 * Three types of values:
 * Static = Explicitly declared.
 * Dynamic = Calculated by a private function.
 * Resolved = Resolved externally, defaults to null.
 */
const DEFAULT_CONFIG = {
    settings: {
        game: {
            resWidth: 1280,
            resHeight: 720,
            fullscreen: false,
            autoConnect: true,
            launchDetached: true
        },
        launcher: {
            allowPrerelease: false,
            dataDirectory: dataPath,
            // Hide the launcher to the tray once the game has loaded (1.10.0).
            minimizarAlJugar: true,
            // Envío anónimo del código de un fallo de arranque (1.16.12). Se puede apagar en Ajustes → Launcher.
            enviarErrores: true,
            // Abrir con Windows (1.17.4). Apagado hasta que el jugador diga que sí en la pregunta
            // única (landing.js) o en Ajustes: nunca se activa sin su permiso.
            abrirConWindows: false,
            abrirConWindowsPreguntado: false,
            // Fondos (1.16.13, scfondos.js): el elegido en Ajustes (null = el más nuevo) y el
            // más nuevo que ya se aplicó una vez (cuando sale otro, se pone solo).
            fondoElegido: null,
            fondoNuevoVisto: null
        }
    },
    newsCache: {
        date: null,
        content: null,
        dismissed: false
    },
    clientToken: null,
    selectedServer: null, // Resolved
    // ¿El jugador ha elegido versión (PRO/LITE) alguna vez? Si no, el launcher
    // se la pregunta en el primer arranque en vez de asignarle PRO en silencio.
    perfilElegido: false,
    selectedAccount: null,
    authenticationDatabase: {},
    modConfigurations: [],
    javaConfig: {}
}

let config = null

// Persistance Utility Functions

/**
 * Save the current configuration to a file.
 */
exports.save = function(){
    // Escritura atómica: fichero temporal + rename. Escribiendo encima, un apagón, un
    // cierre a la fuerza o el antivirus a mitad dejaban config.json cortado, y al
    // abrir el launcher se perdían cuentas, RAM, Java y la elección de versión.
    const datos = JSON.stringify(config, null, 4)
    const tmp = configPath + '.tmp'
    const fd = fs.openSync(tmp, 'w')
    try {
        fs.writeSync(fd, datos, null, 'utf8')
        fs.fsyncSync(fd)
    } finally {
        fs.closeSync(fd)
    }
    // La copia de seguridad es la versión anterior, solo si era válida: no se pisa
    // una copia buena con un fichero dañado.
    try {
        if(fs.existsSync(configPath)){
            JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            fs.copyFileSync(configPath, configPathBak)
        }
    } catch(_e){
        // El actual está dañado o no se puede leer: se conserva la copia que hubiera.
    }
    try {
        fs.renameSync(tmp, configPath)
    } catch(err){
        // En Windows un antivirus o el indexador pueden tener config.json abierto y el
        // rename falla (EPERM/EBUSY). Mejor una escritura directa que no guardar.
        logger.warn('No se pudo reemplazar config.json de forma atómica; se escribe directamente.', err)
        fs.writeFileSync(configPath, datos, 'UTF-8')
        fs.rmSync(tmp, { force: true })
    }
}

/** Lee un config.json y lo devuelve parseado, o null si no existe o está dañado. */
function scLeerConfig(ruta){
    try {
        return JSON.parse(fs.readFileSync(ruta, 'UTF-8'))
    } catch(_e){
        return null
    }
}

/**
 * Load the configuration into memory. If a configuration file exists,
 * that will be read and saved. Otherwise, a default configuration will
 * be generated. Note that "resolved" values default to null and will
 * need to be externally assigned.
 */
exports.load = function(){
    let doLoad = true

    if(!fs.existsSync(configPath)){
        // Create all parent directories.
        fs.ensureDirSync(path.join(configPath, '..'))
        if(fs.existsSync(configPathLEGACY)){
            fs.moveSync(configPathLEGACY, configPath)
        } else if(scLeerConfig(configPathBak) != null){
            // config.json ha desaparecido (borrado por un limpiador, un antivirus o un
            // fallo a medio guardar) pero la copia es buena: se recupera en vez de
            // empezar de cero sin cuentas.
            logger.info('config.json missing: restoring from config.json.bak.')
            fs.copyFileSync(configPathBak, configPath)
        } else {
            doLoad = false
            config = DEFAULT_CONFIG
            exports.save()
        }
    }
    if(doLoad){
        let doValidate = false
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            doValidate = true
        } catch (err){
            logger.error(err)
            logger.info('Configuration file contains malformed JSON or is corrupt.')
            // Antes se volvía a la configuración por defecto: el jugador perdía sus
            // cuentas y ajustes. Se tira de la copia de la última vez que se guardó bien,
            // y el fichero dañado se aparta para poder mirarlo en un ticket.
            try {
                fs.copyFileSync(configPath, configPath + '.danado')
            } catch(_e){
                // Sin copia del dañado: solo se pierde ese diagnóstico.
            }
            const copia = scLeerConfig(configPathBak)
            if(copia != null){
                logger.info('Restoring configuration from config.json.bak.')
                config = copia
                doValidate = true
            } else {
                logger.info('Generating a new configuration file.')
                fs.ensureDirSync(path.join(configPath, '..'))
                config = DEFAULT_CONFIG
                exports.save()
            }
        }
        if(doValidate){
            config = validateKeySet(DEFAULT_CONFIG, config)
            exports.save()
        }
    }
    logger.info('Successfully Loaded')
}

/**
 * @returns {boolean} Whether or not the manager has been loaded.
 */
exports.isLoaded = function(){
    return config != null
}

/**
 * Validate that the destination object has at least every field
 * present in the source object. Assign a default value otherwise.
 * 
 * @param {Object} srcObj The source object to reference against.
 * @param {Object} destObj The destination object.
 * @returns {Object} A validated destination object.
 */
function validateKeySet(srcObj, destObj){
    if(srcObj == null){
        srcObj = {}
    }
    const validationBlacklist = ['authenticationDatabase', 'javaConfig']
    const keys = Object.keys(srcObj)
    for(let i=0; i<keys.length; i++){
        if(typeof destObj[keys[i]] === 'undefined'){
            destObj[keys[i]] = srcObj[keys[i]]
        } else if(typeof srcObj[keys[i]] === 'object' && srcObj[keys[i]] != null && !(srcObj[keys[i]] instanceof Array) && validationBlacklist.indexOf(keys[i]) === -1){
            destObj[keys[i]] = validateKeySet(srcObj[keys[i]], destObj[keys[i]])
        }
    }
    return destObj
}

/**
 * Check to see if this is the first time the user has launched the
 * application. This is determined by the existance of the data path.
 * 
 * @returns {boolean} True if this is the first launch, otherwise false.
 */
exports.isFirstLaunch = function(){
    return firstLaunch
}

/**
 * Returns the name of the folder in the OS temp directory which we
 * will use to extract and store native dependencies for game launch.
 * 
 * @returns {string} The name of the folder.
 */
exports.getTempNativeFolder = function(){
    return 'WCNatives'
}

// System Settings (Unconfigurable on UI)

/**
 * Retrieve the news cache to determine
 * whether or not there is newer news.
 * 
 * @returns {Object} The news cache object.
 */
exports.getNewsCache = function(){
    return config.newsCache
}

/**
 * Set the new news cache object.
 * 
 * @param {Object} newsCache The new news cache object.
 */
exports.setNewsCache = function(newsCache){
    config.newsCache = newsCache
}

/**
 * Set whether or not the news has been dismissed (checked)
 * 
 * @param {boolean} dismissed Whether or not the news has been dismissed (checked).
 */
exports.setNewsCacheDismissed = function(dismissed){
    config.newsCache.dismissed = dismissed
}

/**
 * Retrieve the common directory for shared
 * game files (assets, libraries, etc).
 * 
 * @returns {string} The launcher's common directory.
 */
exports.getCommonDirectory = function(){
    return path.join(exports.getDataDirectory(), 'common')
}

/**
 * Retrieve the instance directory for the per
 * server game directories.
 * 
 * @returns {string} The launcher's instance directory.
 */
exports.getInstanceDirectory = function(){
    return path.join(exports.getDataDirectory(), 'instances')
}

/**
 * Retrieve the launcher's Client Token.
 * There is no default client token.
 * 
 * @returns {string} The launcher's Client Token.
 */
exports.getClientToken = function(){
    return config.clientToken
}

/**
 * Set the launcher's Client Token.
 * 
 * @param {string} clientToken The launcher's new Client Token.
 */
exports.setClientToken = function(clientToken){
    config.clientToken = clientToken
}

/**
 * Retrieve the ID of the selected serverpack.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {string} The ID of the selected serverpack.
 */
exports.getSelectedServer = function(def = false){
    return !def ? config.selectedServer : DEFAULT_CONFIG.clientToken
}

/**
 * ¿Ha elegido ya el jugador su versión (PRO o LITE)?
 *
 * @returns {boolean}
 */
exports.getPerfilElegido = function(){
    return config.perfilElegido === true
}

/**
 * Marca que el jugador ya ha elegido versión, para no volver a preguntárselo.
 *
 * @param {boolean} v
 */
exports.setPerfilElegido = function(v){
    config.perfilElegido = v === true
}

/**
 * Set the ID of the selected serverpack.
 * 
 * @param {string} serverID The ID of the new selected serverpack.
 */
exports.setSelectedServer = function(serverID){
    config.selectedServer = serverID
}

/**
 * Get an array of each account currently authenticated by the launcher.
 * 
 * @returns {Array.<Object>} An array of each stored authenticated account.
 */
exports.getAuthAccounts = function(){
    return config.authenticationDatabase
}

/**
 * Returns the authenticated account with the given uuid. Value may
 * be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @returns {Object} The authenticated account with the given uuid.
 */
exports.getAuthAccount = function(uuid){
    return config.authenticationDatabase[uuid]
}

/**
 * Update the access token of an authenticated mojang account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMojangAuthAccount = function(uuid, accessToken){
    config.authenticationDatabase[uuid].accessToken = accessToken
    config.authenticationDatabase[uuid].type = 'mojang' // For gradual conversion.
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an authenticated mojang account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} username The username (usually email) of the authenticated account.
 * @param {string} displayName The in game name of the authenticated account.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMojangAuthAccount = function(uuid, accessToken, username, displayName){
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'mojang',
        accessToken,
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: displayName.trim()
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Update the tokens of an authenticated microsoft account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * @param {string} msAccessToken The new Microsoft Access Token
 * @param {string} msRefreshToken The new Microsoft Refresh Token
 * @param {date} msExpires The date when the microsoft access token expires
 * @param {date} mcExpires The date when the mojang access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMicrosoftAuthAccount = function(uuid, accessToken, msAccessToken, msRefreshToken, msExpires, mcExpires) {
    config.authenticationDatabase[uuid].accessToken = accessToken
    config.authenticationDatabase[uuid].expiresAt = mcExpires
    config.authenticationDatabase[uuid].microsoft.access_token = msAccessToken
    config.authenticationDatabase[uuid].microsoft.refresh_token = msRefreshToken
    config.authenticationDatabase[uuid].microsoft.expires_at = msExpires
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an authenticated microsoft account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} name The in game name of the authenticated account.
 * @param {date} mcExpires The date when the mojang access token expires
 * @param {string} msAccessToken The microsoft access token
 * @param {string} msRefreshToken The microsoft refresh token
 * @param {date} msExpires The date when the microsoft access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMicrosoftAuthAccount = function(uuid, accessToken, name, mcExpires, msAccessToken, msRefreshToken, msExpires) {
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'microsoft',
        accessToken,
        username: name.trim(),
        uuid: uuid.trim(),
        displayName: name.trim(),
        expiresAt: mcExpires,
        microsoft: {
            access_token: msAccessToken,
            refresh_token: msRefreshToken,
            expires_at: msExpires
        }
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Remove an authenticated account from the database. If the account
 * was also the selected account, a new one will be selected. If there
 * are no accounts, the selected account will be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * 
 * @returns {boolean} True if the account was removed, false if it never existed.
 */
exports.removeAuthAccount = function(uuid){
    if(config.authenticationDatabase[uuid] != null){
        delete config.authenticationDatabase[uuid]
        if(config.selectedAccount === uuid){
            const keys = Object.keys(config.authenticationDatabase)
            if(keys.length > 0){
                config.selectedAccount = keys[0]
            } else {
                config.selectedAccount = null
                config.clientToken = null
            }
        }
        return true
    }
    return false
}

/**
 * Get the currently selected authenticated account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.getSelectedAccount = function(){
    return config.authenticationDatabase[config.selectedAccount]
}

/**
 * Set the selected authenticated account.
 * 
 * @param {string} uuid The UUID of the account which is to be set
 * as the selected account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.setSelectedAccount = function(uuid){
    const authAcc = config.authenticationDatabase[uuid]
    if(authAcc != null) {
        config.selectedAccount = uuid
    }
    return authAcc
}

/**
 * Get an array of each mod configuration currently stored.
 * 
 * @returns {Array.<Object>} An array of each stored mod configuration.
 */
exports.getModConfigurations = function(){
    return config.modConfigurations
}

/**
 * Set the array of stored mod configurations.
 * 
 * @param {Array.<Object>} configurations An array of mod configurations.
 */
exports.setModConfigurations = function(configurations){
    config.modConfigurations = configurations
}

/**
 * Get the mod configuration for a specific server.
 * 
 * @param {string} serverid The id of the server.
 * @returns {Object} The mod configuration for the given server.
 */
exports.getModConfiguration = function(serverid){
    const cfgs = config.modConfigurations
    for(let i=0; i<cfgs.length; i++){
        if(cfgs[i].id === serverid){
            return cfgs[i]
        }
    }
    return null
}

/**
 * Set the mod configuration for a specific server. This overrides any existing value.
 * 
 * @param {string} serverid The id of the server for the given mod configuration.
 * @param {Object} configuration The mod configuration for the given server.
 */
exports.setModConfiguration = function(serverid, configuration){
    const cfgs = config.modConfigurations
    for(let i=0; i<cfgs.length; i++){
        if(cfgs[i].id === serverid){
            cfgs[i] = configuration
            return
        }
    }
    cfgs.push(configuration)
}

// User Configurable Settings

// Java Settings

function defaultJavaConfig(effectiveJavaOptions, ram) {
    if(effectiveJavaOptions.suggestedMajor > 8) {
        return defaultJavaConfig17(ram)
    } else {
        return defaultJavaConfig8(ram)
    }
}

function defaultJavaConfig8(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            '-XX:+UseConcMarkSweepGC',
            '-XX:+CMSIncrementalMode',
            '-XX:-UseAdaptiveSizePolicy',
            '-Xmn128M'
        ],
    }
}

// Ruta ASCII compartida para las DLL de LWJGL, con subcarpeta por usuario
// (hash) para evitar choques de permisos en equipos multiusuario.
function lwjglExtractPath() {
    const os = require('os')
    const crypto = require('crypto')
    // En Mac y Linux no hay ProgramData: el 'C:\ProgramData' de reserva quedaba como
    // ruta relativa y, con el launcher abierto desde el Finder (directorio '/'), LWJGL
    // no podía escribir ahí y el juego no arrancaba. Su carpeta temporal ya es ASCII.
    const base = process.platform === 'win32' ? (process.env.ProgramData || 'C:\\ProgramData') : os.tmpdir()
    const userTag = crypto.createHash('md5').update(os.userInfo().username, 'utf8').digest('hex').substring(0, 8)
    return path.join(base, 'SCLauncher', 'natives-' + userTag)
}

function defaultJavaConfig17(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+UseG1GC',
            '-XX:G1NewSizePercent=20',
            '-XX:G1ReservePercent=20',
            '-XX:MaxGCPauseMillis=50',
            '-XX:G1HeapRegionSize=32M',
            // LWJGL extrae sus DLL a %TEMP% por defecto y falla si el antivirus
            // lo bloquea o si la ruta contiene tildes/ñ (usuarios españoles):
            // "Failed to locate library: lwjgl.dll". Extraemos a una ruta ASCII
            // fija fuera del perfil del usuario y de %TEMP%.
            '-Dorg.lwjgl.system.SharedLibraryExtractPath=' + lwjglExtractPath()
        ],
    }
}

/**
 * Ensure a java config property is set for the given server.
 * 
 * @param {string} serverid The server id.
 * @param {*} mcVersion The minecraft version of the server.
 */
exports.ensureJavaConfig = function(serverid, effectiveJavaOptions, ram) {
    if(!Object.prototype.hasOwnProperty.call(config.javaConfig, serverid)) {
        config.javaConfig[serverid] = defaultJavaConfig(effectiveJavaOptions, ram)
        config.javaConfig[serverid].ramAuto = true
    } else {
        // Automatic RAM (1.9.0): on for whoever never moved the sliders (still the
        // profile default); a hand-picked value is kept as manual.
        // Both sliders must still be at the default, compared in MB: pressing
        // "Listo" in Settings rewrites the untouched '6144M' default as '6G'.
        if(typeof config.javaConfig[serverid].ramAuto !== 'boolean') {
            const mb = v => {
                const s = String(v || '').trim().toUpperCase()
                return s.endsWith('G') ? Number.parseFloat(s) * 1024 : Number.parseFloat(s)
            }
            const porDefecto = mb(resolveSelectedRAM(ram))
            config.javaConfig[serverid].ramAuto = mb(config.javaConfig[serverid].maxRAM) === porDefecto
                && mb(config.javaConfig[serverid].minRAM) === porDefecto
        }
        // Migración: añade la ruta de extracción de LWJGL a configuraciones
        // creadas antes del fix (antivirus / rutas con tildes).
        const jvmOpts = config.javaConfig[serverid].jvmOptions
        if(Array.isArray(jvmOpts) && !jvmOpts.some(o => typeof o === 'string' && o.startsWith('-Dorg.lwjgl.system.SharedLibraryExtractPath'))) {
            jvmOpts.push('-Dorg.lwjgl.system.SharedLibraryExtractPath=' + lwjglExtractPath())
        }
    }
}

/**
 * Retrieve the minimum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The minimum amount of memory for JVM initialization.
 */
exports.getMinRAM = function(serverid){
    return config.javaConfig[serverid].minRAM
}

/**
 * Set the minimum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @param {string} minRAM The new minimum amount of memory for JVM initialization.
 */
exports.setMinRAM = function(serverid, minRAM){
    config.javaConfig[serverid].minRAM = minRAM
}

/**
 * Retrieve the maximum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The maximum amount of memory for JVM initialization.
 */
exports.getMaxRAM = function(serverid){
    return config.javaConfig[serverid].maxRAM
}

/**
 * Set the maximum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @param {string} maxRAM The new maximum amount of memory for JVM initialization.
 */
exports.setMaxRAM = function(serverid, maxRAM){
    config.javaConfig[serverid].maxRAM = maxRAM
}

/**
 * Whether the launcher picks the memory itself (screndimiento.ramAutomatica)
 * instead of the sliders.
 *
 * @param {string} serverid The server id.
 * @returns {boolean}
 */
exports.getRamAuto = function(serverid){
    return config.javaConfig[serverid]?.ramAuto !== false
}

/**
 * @param {string} serverid The server id.
 * @param {boolean} auto True to let the launcher pick the memory.
 */
exports.setRamAuto = function(serverid, auto){
    config.javaConfig[serverid].ramAuto = auto === true
}

/**
 * Graphics preset waiting to be written to options.txt ('bajo' | 'medio' |
 * 'alto'), or null. It is applied with the game closed: right away from
 * Settings when possible, otherwise just before the next launch.
 *
 * @param {string} serverid The server id.
 */
exports.getCalidadPendiente = function(serverid){
    return config.javaConfig[serverid]?.calidadPendiente ?? null
}

exports.setCalidadPendiente = function(serverid, nivel){
    if(config.javaConfig[serverid] != null){
        config.javaConfig[serverid].calidadPendiente = nivel
    }
}

/**
 * Last graphics preset applied with the one-click buttons, to mark it in the UI.
 *
 * @param {string} serverid The server id.
 */
exports.getCalidad = function(serverid){
    return config.javaConfig[serverid]?.calidad ?? null
}

exports.setCalidad = function(serverid, nivel){
    if(config.javaConfig[serverid] != null){
        config.javaConfig[serverid].calidad = nivel
    }
}

/**
 * Retrieve the path of the Java Executable.
 * 
 * This is a resolved configuration value and defaults to null until externally assigned.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The path of the Java Executable.
 */
exports.getJavaExecutable = function(serverid){
    return config.javaConfig[serverid].executable
}

/**
 * Set the path of the Java Executable.
 * 
 * @param {string} serverid The server id.
 * @param {string} executable The new path of the Java Executable.
 */
exports.setJavaExecutable = function(serverid, executable){
    config.javaConfig[serverid].executable = executable
}

/**
 * Retrieve the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and will not be included
 * in this value.
 * 
 * @param {string} serverid The server id.
 * @returns {Array.<string>} An array of the additional arguments for JVM initialization.
 */
exports.getJVMOptions = function(serverid){
    return config.javaConfig[serverid].jvmOptions
}

/**
 * Set the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and should not be
 * included in this value.
 * 
 * @param {string} serverid The server id.
 * @param {Array.<string>} jvmOptions An array of the new additional arguments for JVM 
 * initialization.
 */
exports.setJVMOptions = function(serverid, jvmOptions){
    config.javaConfig[serverid].jvmOptions = jvmOptions
}

// Game Settings

/**
 * Retrieve the width of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The width of the game window.
 */
exports.getGameWidth = function(def = false){
    return !def ? config.settings.game.resWidth : DEFAULT_CONFIG.settings.game.resWidth
}

/**
 * Set the width of the game window.
 * 
 * @param {number} resWidth The new width of the game window.
 */
exports.setGameWidth = function(resWidth){
    config.settings.game.resWidth = Number.parseInt(resWidth)
}

/**
 * Validate a potential new width value.
 * 
 * @param {number} resWidth The width value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameWidth = function(resWidth){
    const nVal = Number.parseInt(resWidth)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Retrieve the height of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The height of the game window.
 */
exports.getGameHeight = function(def = false){
    return !def ? config.settings.game.resHeight : DEFAULT_CONFIG.settings.game.resHeight
}

/**
 * Set the height of the game window.
 * 
 * @param {number} resHeight The new height of the game window.
 */
exports.setGameHeight = function(resHeight){
    config.settings.game.resHeight = Number.parseInt(resHeight)
}

/**
 * Validate a potential new height value.
 * 
 * @param {number} resHeight The height value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameHeight = function(resHeight){
    const nVal = Number.parseInt(resHeight)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Check if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game is set to launch in fullscreen mode.
 */
exports.getFullscreen = function(def = false){
    return !def ? config.settings.game.fullscreen : DEFAULT_CONFIG.settings.game.fullscreen
}

/**
 * Change the status of if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} fullscreen Whether or not the game should launch in fullscreen mode.
 */
exports.setFullscreen = function(fullscreen){
    config.settings.game.fullscreen = fullscreen
}

/**
 * Check if the game should auto connect to servers.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game should auto connect to servers.
 */
exports.getAutoConnect = function(def = false){
    return !def ? config.settings.game.autoConnect : DEFAULT_CONFIG.settings.game.autoConnect
}

/**
 * Change the status of whether or not the game should auto connect to servers.
 * 
 * @param {boolean} autoConnect Whether or not the game should auto connect to servers.
 */
exports.setAutoConnect = function(autoConnect){
    config.settings.game.autoConnect = autoConnect
}

/**
 * Check if the game should launch as a detached process.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game will launch as a detached process.
 */
exports.getLaunchDetached = function(def = false){
    return !def ? config.settings.game.launchDetached : DEFAULT_CONFIG.settings.game.launchDetached
}

/**
 * Change the status of whether or not the game should launch as a detached process.
 * 
 * @param {boolean} launchDetached Whether or not the game should launch as a detached process.
 */
exports.setLaunchDetached = function(launchDetached){
    config.settings.game.launchDetached = launchDetached
}

// Launcher Settings

/**
 * Check if the launcher should download prerelease versions.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the launcher should download prerelease versions.
 */
exports.getAllowPrerelease = function(def = false){
    return !def ? config.settings.launcher.allowPrerelease : DEFAULT_CONFIG.settings.launcher.allowPrerelease
}

/**
 * Change the status of Whether or not the launcher should download prerelease versions.
 * 
 * @param {boolean} launchDetached Whether or not the launcher should download prerelease versions.
 */
exports.setAllowPrerelease = function(allowPrerelease){
    config.settings.launcher.allowPrerelease = allowPrerelease
}

/**
 * Whether the launcher hides to the tray once the game has loaded and comes
 * back when it closes.
 *
 * @param {boolean} def Optional. If true, the default value will be returned.
 */
exports.getMinimizarAlJugar = function(def = false){
    return !def ? config.settings.launcher.minimizarAlJugar !== false : DEFAULT_CONFIG.settings.launcher.minimizarAlJugar
}

exports.setMinimizarAlJugar = function(v){
    config.settings.launcher.minimizarAlJugar = v === true
}

/**
 * Lanzar el juego a través del vigilante (docs/PLAN-VIGILANTE.md): con la partida cargada el
 * launcher se cierra entero en vez de quedarse en la bandeja. Encendido salvo que la config
 * diga false; es el interruptor para apagarlo a mano si diera problemas en algún PC.
 */
exports.getVigilante = function(){
    return config.settings.launcher.vigilante !== false
}

/**
 * Whether the anonymous code of a launch failure is sent (1.16.12). On by
 * default; configs from before have no value and count as on.
 *
 * @param {boolean} def Optional. If true, the default value will be returned.
 */
exports.getEnviarErrores = function(def = false){
    return !def ? config.settings.launcher.enviarErrores !== false : DEFAULT_CONFIG.settings.launcher.enviarErrores
}

exports.setEnviarErrores = function(v){
    config.settings.launcher.enviarErrores = v === true
}

/**
 * Whether the launcher opens when Windows starts (1.17.4). Off by default; only the
 * player turns it on. Windows itself is updated by scAplicarAbrirConWindows (settings.js).
 *
 * @param {boolean} def Optional. If true, the default value will be returned.
 */
exports.getAbrirConWindows = function(def = false){
    return !def ? config.settings.launcher.abrirConWindows === true : DEFAULT_CONFIG.settings.launcher.abrirConWindows
}

exports.setAbrirConWindows = function(v){
    config.settings.launcher.abrirConWindows = v === true
}

/** Whether the one-time "open with Windows?" question was already answered. */
exports.getAbrirConWindowsPreguntado = function(){
    return config.settings.launcher.abrirConWindowsPreguntado === true
}

exports.setAbrirConWindowsPreguntado = function(v){
    config.settings.launcher.abrirConWindowsPreguntado = v === true
}

/** Fondo elegido en Ajustes → Launcher, o null para seguir siempre el más nuevo (scfondos.js). */
exports.getFondoElegido = function(){
    return config.settings.launcher.fondoElegido || null
}

exports.setFondoElegido = function(id){
    config.settings.launcher.fondoElegido = id || null
}

/** Id del fondo más nuevo que ya se aplicó una vez: si el catálogo trae otro más nuevo, se pone solo. */
exports.getFondoNuevoVisto = function(){
    return config.settings.launcher.fondoNuevoVisto || null
}

exports.setFondoNuevoVisto = function(id){
    config.settings.launcher.fondoNuevoVisto = id || null
}