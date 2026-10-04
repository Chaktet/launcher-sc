// Builds the full SC emote set into <outDir>: fixed UUIDs, Spanish names, icons, no duplicates.
// Sources: our KosmX/Mine shortlist (final/sc, already built) + Mine Emotes selection (packs/mine_seleccion.txt)
// + optional extra sources listed in packs/extra_seleccion.tsv (file \t spanish name).
// Usage: node monta_set.js <outDir>
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const H = __dirname, out = process.argv[2];
const uuid = s => { const h = crypto.createHash('md5').update(s).digest(); h[6] = (h[6] & 0x0f) | 0x30; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex'); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`; };
const fb = v => typeof v === 'string' ? v : (v && (v.fallback || v.text)) || '';
const clean = s => s.replace(/§./g, '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const names = new Map(), uuids = new Set(), dups = [];
function put(file, json, name, desc, icon) {
  const key = name.toLowerCase();
  if (names.has(key)) { dups.push(`"${name}": ${file} vs ${names.get(key)}`); return; }
  if (uuids.has(json.uuid)) throw new Error('duplicate uuid ' + file);
  names.set(key, file); uuids.add(json.uuid);
  json.name = name; json.description = desc;
  delete json.comment; delete json.bages;
  fs.writeFileSync(path.join(out, file + '.json'), JSON.stringify(json));
  if (!icon || !fs.existsSync(icon)) throw new Error('no icon ' + file);
  fs.copyFileSync(icon, path.join(out, file + '.png'));
}

// 1) the 20 already prepared (Spanish names, icons rendered by us where missing), minus those SPEmotes covers better
const coveredBySpe = new Set(['abrazo', 'reverencia', 'sentarse', 'tumbarse', 'corazon', 'timido', 'dab', 'baile_floss', 'reir', 'dormir', 'pensar']);
for (const f of fs.readdirSync(path.join(H, 'final', 'sc')).filter(f => f.endsWith('.json') && !coveredBySpe.has(f.slice(0, -5)))) {
  const j = JSON.parse(fs.readFileSync(path.join(H, 'final', 'sc', f), 'utf8'));
  put(f.slice(0, -5), j, j.name, j.description, path.join(H, 'final', 'sc', f.replace(/json$/, 'png')));
}
const taken = new Set(['MIEM_laughalot2', 'MIEM_7.0_hungarian_folk_dance', 'MIEM_7.0_friend_round_dance', 'MIEM_happy_bird_dance',
  'MIEM_victory_1', 'MIEM_think', 'MIEM_pat_on_head', 'MIEM_sittingwithyourkneestothechest', 'MIEM_cowgirlsleep']);

// 2) Mine Emotes selection, official Spanish names from their translation pack
const MINE = path.join(H, 'packs', 'mine');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const esNames = readJson(path.join(H, 'packs', 'mine_es_names.json'));
const esDesc = readJson(path.join(H, 'packs', 'mine_es_desc.json'));
const overrides = fs.existsSync(path.join(H, 'packs', 'nombres_es.tsv'))
  ? Object.fromEntries(fs.readFileSync(path.join(H, 'packs', 'nombres_es.tsv'), 'utf8').trim().split(/\r?\n/).map(l => l.split('\t'))) : {};
let n = 0;
for (const line of fs.readFileSync(path.join(H, 'packs', 'mine_seleccion.txt'), 'utf8').split(/\r?\n/)) {
  const id = line.trim(); if (!id || id.startsWith('#')) continue;
  const base = 'MIEM_' + id; if (taken.has(base)) continue;
  const j = JSON.parse(fs.readFileSync(path.join(MINE, base + '.json'), 'utf8'));
  const nk = j.name && j.name.translate, dk = j.description && j.description.translate;
  const name = clean(overrides[id] || (nk && esNames[nk]) || fb(j.name));
  const desc = clean((dk && esDesc[dk]) || fb(j.description));
  j.uuid = uuid('servidorcobblemon:emote:' + base);
  const file = 'mine_' + id.replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
  put(file, j, name, desc, path.join(MINE, base + '.png'));
  n++;
}
// 3) SPEmotes selection (most downloaded on RedlanceEmotes, curated), Spanish names written by hand
const SPE = path.join(H, 'packs', 'extra', 'spemotes', 'x', 'SPEmotes ALL');
let m = 0;
for (const line of fs.readFileSync(path.join(H, 'packs', 'spe_seleccion.tsv'), 'utf8').trim().split(/\r?\n/)) {
  const [base, name] = line.split('\t');
  const j = readJson(path.join(SPE, base + '.json'));
  j.uuid = uuid('servidorcobblemon:emote:' + base);
  if (!j.author) j.author = 'SPEmotes (Milyan)';
  const file = 'spe_' + base.replace(/^SPE_/, '').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
  put(file, j, name, 'SPEmotes', path.join(SPE, base + '.png'));
  m++;
}
console.log('total', names.size, 'mine added', n, 'spe added', m);
if (dups.length) { console.log("DUPLICADOS:\n" + dups.join("\n")); process.exitCode = 1; }
