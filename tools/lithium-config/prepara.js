// Adds config/lithium.properties (Lithium's shape_merging off) as a File module to the three launcher profiles.
// Why: with MoreCulling, Lithium's shape merging can throw IncompatibleClassChangeError while the game bakes models,
// and Minecraft then drops every resource pack (seen 19-10-2026 in a PRO test client). File modules are checked by
// MD5 on every launch, so players get exactly this file. Safe to re-run: an existing module is replaced.
// PRO points at its own folder; LITE and SUPER LITE share the LITE folder, like the other config files.
// Usage: node prepara.js <distribution.publicado.json> <distribution.nuevo.json>
'use strict'
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const [entrada, salida] = process.argv.slice(2)
if (!entrada || !salida) { console.error('uso: node prepara.js <publicado.json> <nuevo.json>'); process.exit(2) }
const BASE = 'https://descargas.servidorcobblemon.es/launcher/'
const buf = fs.readFileSync(path.join(__dirname, 'lithium.properties'))
const md5 = crypto.createHash('md5').update(buf).digest('hex')
const CARPETA = { 'ServidorCobblemon-1.21.1': 'ServidorCobblemon-1.21.1', 'ServidorCobblemonLite-1.21.1': 'ServidorCobblemonLite-1.21.1',
  'ServidorCobblemonSuperLite-1.21.1': 'ServidorCobblemonLite-1.21.1' }
const texto = fs.readFileSync(entrada, 'utf8'), d = JSON.parse(texto)
for (const [perfil, carpeta] of Object.entries(CARPETA)) {
  const s = d.servers.find(x => x.id === perfil)
  if (!s) { console.error('falta el perfil ' + perfil); process.exit(1) }
  s.modules = s.modules.filter(m => m.id !== 'lithium.properties')
  const junto = s.modules.findIndex(m => m.id === 'immediatelyfast.json')
  if (junto < 0) { console.error(perfil + ': no encuentro immediatelyfast.json'); process.exit(1) }
  s.modules.splice(junto + 1, 0, { id: 'lithium.properties', name: 'lithium.properties', type: 'File',
    artifact: { size: buf.length, url: `${BASE}servers/${carpeta}/files/config/lithium.properties`, MD5: md5, path: 'config/lithium.properties' } })
  console.log(`${perfil}: ${s.modules.length} módulos, servers/${carpeta}/files/config/lithium.properties md5 ${md5}`)
}
const sangria = (texto.match(/\n( +)"/) || [, '  '])[1]
const nuevo = JSON.stringify(d, null, sangria)
const sin = x => JSON.stringify({ ...x, servers: x.servers.map(s => ({ ...s, modules: s.modules.filter(m => m.id !== 'lithium.properties') })) })
if (sin(JSON.parse(texto)) !== sin(JSON.parse(nuevo))) { console.error('ABORTADO: cambia algo más que lithium.properties'); process.exit(1) }
fs.writeFileSync(salida, nuevo)
console.log('nuevo md5 ' + crypto.createHash('md5').update(nuevo).digest('hex'))
