const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// PRODUCCIÓN: distribución servida desde descargas.servidorcobblemon.es (origen ovh-a /var/www/packs/launcher)
exports.SC_HOST_PRINCIPAL = 'descargas.servidorcobblemon.es'
exports.REMOTE_DISTRO_URL = `https://${exports.SC_HOST_PRINCIPAL}/launcher/distribution.json`

// RUTA DIRECTA · esquiva Cloudflare.
//
// Los operadores españoles bloquean por orden judicial rangos enteros de IPs de
// Cloudflare durante los partidos de fútbol para cortar emisiones piratas, y se
// llevan por delante miles de webs legítimas. La nuestra entre ellas: el 16 de
// agosto de 2026 media base de jugadores española no podía ni descargar ni abrir
// la web, con la infraestructura intacta (todos los artefactos sirviendo 200 con
// el tamaño correcto, DNS y certificado bien, origen sano).
//
// Los bloqueos van por IP CONCRETA, no por proveedor. Cloudflare se lleva la peor
// parte porque miles de dominios comparten cada IP; un dedicado nuestro tiene un
// riesgo de arrastre mucho menor. Por eso el escape es un host que apunta directo
// al origen, con la nube de Cloudflare desactivada y su propio certificado.
//
// ⚠ Este host puede NO EXISTIR todavía. Nada de esto se activa sin comprobar
// antes que responde, así que mientras no exista el launcher se comporta igual
// que siempre.
exports.SC_HOST_DIRECTO = 'directo.servidorcobblemon.es'
exports.SC_DISTRO_URL_DIRECTA = `https://${exports.SC_HOST_DIRECTO}/launcher/distribution.json`

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api
