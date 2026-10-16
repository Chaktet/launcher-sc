// Check for the SC-03 ENOENT of 16-10: after the data folder changes, rebuilding the distribution with the new
// folders must point the Fabric version JSON at the new common folder. Run: node tools/prueba-carpeta-datos.js
const path = require('path')
const { HeliosDistribution } = require('helios-core/common')

const url = 'https://descargas.servidorcobblemon.es/launcher/distribution.json'

async function main(){
    const raw = await (await fetch(url)).json()
    const viejo = 'C:\\Users\\X\\AppData\\Roaming\\.helioslauncher'
    const nuevo = 'D:\\Servidor cobblemon'
    const DistroAPI = { commonDir: path.join(viejo, 'common'), instanceDir: path.join(viejo, 'instances') }
    DistroAPI.distribution = new HeliosDistribution(raw, DistroAPI.commonDir, DistroAPI.instanceDir)

    const rutaLoader = d => {
        const serv = d.getMainServer()
        const loader = serv.modules.find(m => m.rawModule.type === 'Fabric' || m.rawModule.type === 'ForgeHosted')
        const manifiesto = loader.subModules.find(m => m.rawModule.type === 'VersionManifest')
        return manifiesto.getPath()
    }
    console.log('antes:  ', rutaLoader(DistroAPI.distribution))

    // Same steps as scAlinearCarpetasDistro in landing.js
    const common = path.join(nuevo, 'common'), instancias = path.join(nuevo, 'instances')
    DistroAPI.commonDir = common
    DistroAPI.instanceDir = instancias
    DistroAPI.distribution = new HeliosDistribution(DistroAPI.distribution.rawDistribution, common, instancias)

    const despues = rutaLoader(DistroAPI.distribution)
    console.log('después:', despues)
    if(!despues.startsWith(common)) { console.error('FALLO: sigue en la carpeta vieja'); process.exit(1) }
    console.log('OK')
}
main().catch(e => { console.error(e); process.exit(1) })
