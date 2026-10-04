// Builds the SC emote set: Spanish name/description, fixed UUID, ASCII file names, original icon.
// Usage: node prepara_emotes.js <outDir>
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'packs', 'shortlist');
const out = process.argv[2];
const uuids = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'packs', 'shortlist_uuids.tsv'), 'utf8')
  .trim().split(/\r?\n/).slice(1).map(l => l.split('\t')).map(r => [r[0], r[7]]));

// source file -> [published name, Spanish name, Spanish description]
const SET = {
  'hug.json': ['abrazo', 'Abrazo', 'Abraza a quien tengas delante'],
  'MIEM_laughalot2.json': ['reir', 'Reír', 'Partirse de risa'],
  'bow2.json': ['reverencia', 'Reverencia', 'Una reverencia educada'],
  'campfire_sit1.json': ['sentarse', 'Sentarse', 'Sentarse en el suelo'],
  'MIEM_sittingwithyourkneestothechest.json': ['sentarse_rodillas', 'Sentarse abrazando las rodillas', 'Sentado con las rodillas al pecho'],
  'lay_down5.json': ['tumbarse', 'Tumbarse', 'Tumbarse a descansar'],
  'MIEM_cowgirlsleep.json': ['dormir', 'Dormir', 'Echarse una siesta'],
  'MIEM_victory_1.json': ['victoria', 'Victoria', 'Celebrar una victoria'],
  'MIEM_think.json': ['pensar', 'Pensar', 'Pensativo'],
  'MIEM_pat_on_head.json': ['caricia', 'Acariciar la cabeza', 'Acariciar la cabeza a alguien'],
  'heart.json': ['corazon', 'Mano en el corazón', 'Con cariño'],
  'nervous.json': ['timido', 'Tímido', 'Nervioso o vergonzoso'],
  'F.json': ['respetos', 'Presentar respetos', 'Pulsa F'],
  'dab.json': ['dab', 'Dab', 'Hacer un dab'],
  'club_penguin_dance.json': ['baile_club_penguin', 'Baile Club Penguin', 'El baile de Club Penguin'],
  'floss.json': ['baile_floss', 'Baile Floss', 'Mover los brazos de lado a lado'],
  'orange justice.json': ['baile_orange_justice', 'Baile Orange Justice', 'El baile Orange Justice'],
  'MIEM_7.0_hungarian_folk_dance.json': ['baile_czardas', 'Baile Czardas', 'Baile popular húngaro'],
  'MIEM_7.0_friend_round_dance.json': ['baile_corro', 'Baile en corro', 'Baile de la amistad'],
  'MIEM_happy_bird_dance.json': ['baile_pajaro', 'Baile del pájaro', 'El baile del pájaro feliz'],
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const seen = new Set();
for (const [src, [dst, name, desc]] of Object.entries(SET)) {
  const j = JSON.parse(fs.readFileSync(path.join(SRC, src), 'utf8'));
  const author = typeof j.author === 'string' ? j.author : JSON.stringify(j.author);
  if (!uuids[src] || seen.has(uuids[src])) throw new Error('uuid missing or repeated: ' + src);
  seen.add(uuids[src]);
  j.name = name;
  j.description = desc;
  j.author = author;
  j.uuid = uuids[src];
  fs.writeFileSync(path.join(out, dst + '.json'), JSON.stringify(j));
  const png = path.join(SRC, src.replace(/\.json$/, '.png'));
  if (fs.existsSync(png)) fs.copyFileSync(png, path.join(out, dst + '.png'));
  console.log(dst.padEnd(22), uuids[src], name, '·', author);
}
if (Object.keys(SET).length !== fs.readdirSync(SRC).filter(f => f.endsWith('.json')).length) throw new Error('source count mismatch');
