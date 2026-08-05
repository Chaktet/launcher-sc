const {ipcRenderer}  = require('electron')
const fs             = require('fs-extra')
const os             = require('os')
const path           = require('path')

// PRIMERO de todo: cada módulo crea su logger al ser importado, así que si esto
// no va delante, los suyos se quedan sin fichero y perdemos justo lo del arranque.
const Registro       = require('./registro')
Registro.engancharLoggers()
Registro.capturarErroresGlobales()

const ConfigManager  = require('./configmanager')
const { DistroAPI }  = require('./distromanager')
const LangLoader     = require('./langloader')
const { LoggerUtil } = require('helios-core')
// eslint-disable-next-line no-unused-vars
const { HeliosDistribution } = require('helios-core/common')

const logger = LoggerUtil.getLogger('Preloader')

logger.info('Loading..')

// Load ConfigManager
ConfigManager.load()

// Yuck!
// TODO Fix this
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

// Load Strings
LangLoader.setupLanguage()

/**
 * 
 * @param {HeliosDistribution} data 
 */
function onDistroLoad(data){
    if(data != null){
        
        // Resolve the selected server if its value has yet to be set.
        if(ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null){
            logger.info('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
    }
    ipcRenderer.send('distributionIndexDone', data != null)
}

// Ensure Distribution is downloaded and cached.
// Con un tiempo límite: si la conexión se queda COLGADA en vez de cortarse (wifi
// de colegio, portal cautivo, antivirus inspeccionando el tráfico), esta promesa
// no se resolvía nunca y el launcher se quedaba en la pantalla de carga para
// siempre. Agotado el plazo se sigue el mismo camino que un fallo de red, que ya
// intenta la copia local y, si no la hay, muestra el error de arranque.
let distroResuelta = false
const distroLimite = setTimeout(async () => {
    if(distroResuelta){
        return
    }
    distroResuelta = true
    logger.error('Se agotó el tiempo de espera al descargar la distribución.')
    // Antes de rendirse, la copia local. helios-core ya la intenta por su
    // cuenta, pero solo cuando la descarga FALLA; aquí la hemos cortado
    // nosotros por tiempo, así que ese camino no llega a ejecutarse y sin
    // esto el launcher moría con un error fatal teniendo la copia a mano.
    try {
        const local = await DistroAPI.getDistributionLocalLoadOnly()
        if(local != null){
            logger.info('Sin respuesta del servidor: se usa la copia local de la distribución.')
            onDistroLoad(local)
            return
        }
    } catch(err) {
        logger.warn('No hay copia local utilizable de la distribución.', err)
    }
    onDistroLoad(null)
}, 30000)

DistroAPI.getDistribution()
    .then(heliosDistro => {
        if(distroResuelta){
            return
        }
        distroResuelta = true
        clearTimeout(distroLimite)
        logger.info('Loaded distribution index.')

        onDistroLoad(heliosDistro)
    })
    .catch(err => {
        if(distroResuelta){
            return
        }
        distroResuelta = true
        clearTimeout(distroLimite)
        logger.info('Failed to load an older version of the distribution index.')
        logger.info('Application cannot run.')
        logger.error(err)

        onDistroLoad(null)
    })

// Clean up temp dir incase previous launches ended unexpectedly. 
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if(err){
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})