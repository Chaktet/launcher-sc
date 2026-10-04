// Launches the SC modpack client (PRO profile) from a throwaway game dir, adding extra mods.
// Usage: node lanzar_cliente.js <gameDir> [extraMod.jar ...]
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = 'E:/PROYECTOS-MC/sc-test-data';
const COMMON = ROOT + '/common';
const INST = ROOT + '/instances/ServidorCobblemon-1.21.1';
const [gameDir, ...extra] = process.argv.slice(2);

function libPath(name) {
  const [g, a, v, cls] = name.split(':');
  return `${COMMON}/libraries/${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}${cls ? '-' + cls : ''}.jar`;
}
function allowed(rules) {
  if (!rules) return true;
  let ok = false;
  for (const r of rules) {
    const match = !r.os || r.os.name === 'windows';
    if (match) ok = r.action === 'allow';
  }
  return ok;
}
const vanilla = JSON.parse(fs.readFileSync(`${COMMON}/versions/1.21.1/1.21.1.json`, 'utf8'));
const fabric = JSON.parse(fs.readFileSync(`${COMMON}/versions/1.21.1-fabric-0.19.3/1.21.1-fabric-0.19.3.json`, 'utf8'));
const cpSet = new Map();
for (const l of [...fabric.libraries, ...vanilla.libraries]) {
  if (!allowed(l.rules)) continue;
  const p = l.downloads?.artifact?.path ? `${COMMON}/libraries/${l.downloads.artifact.path}` : libPath(l.name);
  const key = l.name.split(':').slice(0, 2).join(':') + (l.name.split(':')[3] || '');
  if (!cpSet.has(key)) cpSet.set(key, p);
}
const classpath = [...cpSet.values()];
for (const p of classpath) if (!fs.existsSync(p)) console.error('MISSING', p);
classpath.push(`${COMMON}/versions/1.21.1/1.21.1.jar`);

const mods = fs.readFileSync(`${INST}/forgeMods.list`, 'utf8').split(/\r?\n/).filter(Boolean)
  .filter(m => !/sc_lockserver/i.test(m))
  .filter(m => !(process.env.EXCLUDE && new RegExp(process.env.EXCLUDE, 'i').test(m)));
mods.push(...extra.map(e => path.resolve(e)));
fs.mkdirSync(gameDir, { recursive: true });
const listFile = path.resolve(gameDir, 'mods.list');
fs.writeFileSync(listFile, mods.join('\n'));

const args = [
  '-Xmx6G', '-Xms2G', '-XX:+UseG1GC',
  `-Djava.library.path=${path.resolve(gameDir, 'natives')}`,
  `-Dorg.lwjgl.system.SharedLibraryExtractPath=${path.resolve(gameDir, 'natives')}`,
  '-cp', classpath.join(';'),
  'net.fabricmc.loader.impl.launch.knot.KnotClient',
  '--username', 'SCEmoteTest', '--version', 'ServidorCobblemon-1.21.1',
  '--gameDir', path.resolve(gameDir), '--assetsDir', `${COMMON}/assets`, '--assetIndex', vanilla.assetIndex.id,
  '--uuid', process.env.UUID || '00000000000000000000000000000e01', '--accessToken', '0', '--userType', 'legacy',
  '--versionType', 'release', '--width', '1280', '--height', '720',
  ...(process.env.NOQP ? [] : ['--quickPlaySingleplayer', 'emotetest']), '--fabric.addMods', '@' + listFile,
];
const out = fs.openSync(path.resolve(gameDir, 'stdout.txt'), 'w');
const child = cp.spawn('C:/Program Files/Java/jdk-21/bin/java.exe', args, { cwd: gameDir, detached: true, stdio: ['ignore', out, out] });
child.unref();
console.log('pid', child.pid, 'mods', mods.length, 'cp', classpath.length);
