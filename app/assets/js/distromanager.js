const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// PRODUCCIÓN: distribución servida desde descargas.servidorcobblemon.es (origen ovh-a /var/www/packs/launcher)
exports.REMOTE_DISTRO_URL = 'https://descargas.servidorcobblemon.es/launcher/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api