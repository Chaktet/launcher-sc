// Builds config/emotecraft.json with the 10 wheel pages (8 slots each) filled by topic.
// Usage: node rueda.js <setDir with .json sources> <out emotecraft.json>
const fs = require('fs'), path = require('path');
const [setDir, out] = process.argv.slice(2);
const BUILTIN = {
  waving: '33b912f8-0aa0-45e6-a2d4-9b5677e6f35c', clap: '96506a5e-a69c-4a18-9add-d43dfd272fa6',
  crying: 'a2969c42-520f-4c5c-a024-a7d0a2b7b4d1', palm: '0de63fbe-2f20-44e0-8969-479b76ceeb6b',
  kazotsky_kick: '01a53a42-2fd2-418c-8e46-e4ee1ff9ee6a', roblox_potion_dance: 'f9f6669d-f1b3-4170-8bc5-475a9a600439',
  backflip: 'ebfb1e69-330a-4970-8bca-f5625c90681a', here: '3045b335-12ca-4ddb-aca5-0aef450a5e4c',
};
const PAGES = [
  // 1 básicos
  ['waving', 'spe_cuddle', 'clap', 'spe_laugh', 'crying', 'spe_bow', 'spe_gangnam_style2', 'spe_sit'],
  // 2 saludos y trato social
  ['spe_polite_hello', 'spe_salute', 'spe_air_kiss', 'spe_handshake', 'spe_hugs', 'spe_hand_on_heart', 'spe_give_it_here', 'here'],
  // 3 reacciones
  ['spe_shrug_your_shoulders', 'spe_yes', 'spe_no', 'palm', 'spe_shock', 'spe_think', 'spe_be_shy', 'spe_take_offence'],
  // 4 emociones
  ['spe_delight', 'spe_be_sad', 'spe_fear', 'spe_apologize', 'mine_rideonthefloorinhysteria', 'spe_go_crazy', 'spe_fatigue', 'mine_yawn'],
  // 5 sentarse
  ['spe_nice_to_sit', 'spe_sit_relaxed', 'spe_to_sit_on_the_throne', 'spe_sit_cross_legged', 'spe_sit_down_like_a_boss', 'spe_sit_elegantly', 'spe_chill_to_sit', 'spe_sit_by_the_fire'],
  // 6 tumbarse y descansar
  ['spe_lay', 'spe_lying_with_your_hands_behind_your_head', 'spe_lie_on_your_stomach', 'spe_lying_sideways1', 'spe_sleep', 'spe_lean_in_front_of_the_block', 'spe_wait_at_the_wall', 'spe_pray'],
  // 7 bailes famosos
  ['spe_helltaker', 'spe_torture_crackdown', 'spe_justdance', 'spe_floss', 'spe_dab', 'baile_club_penguin', 'mine_de_macarena', 'mine_de_griddy'],
  // 8 más bailes
  ['spe_caramel', 'spe_jumpstyle', 'spe_shuffle', 'spe_boogie_down', 'spe_lezginka', 'kazotsky_kick', 'roblox_potion_dance', 'mine_lethalcompanydance'],
  // 9 en pareja
  ['spe_waltz1', 'spe_waltz2', 'spe_heart1', 'spe_heart2', 'spe_holding_hands1', 'spe_holding_hands', 'caricia', 'spe_petting_a_dog'],
  // 10 acción
  ['backflip', 'spe_push_ups', 'spe_fighting_pose', 'spe_twist_the_sword', 'spe_get_on_one_knee', 'mine_cartwheel', 'mine_hadouken', 'spe_jump'],
];
const used = new Set(), fastmenu = {};
PAGES.forEach((page, p) => {
  if (page.length !== 8) throw new Error(`page ${p + 1} has ${page.length} slots`);
  fastmenu[p] = {};
  page.forEach((id, s) => {
    let uuid = BUILTIN[id];
    if (!uuid) {
      const f = path.join(setDir, id + '.json');
      if (!fs.existsSync(f)) throw new Error('missing emote ' + id);
      uuid = JSON.parse(fs.readFileSync(f, 'utf8')).uuid;
    }
    if (used.has(uuid)) throw new Error('repeated in wheel: ' + id);
    used.add(uuid);
    fastmenu[p][s] = uuid;
  });
});
fs.writeFileSync(out, JSON.stringify({ config_version: 4, fastmenu }, null, 2) + '\n');
console.log('wheel:', used.size, 'emotes in', PAGES.length, 'pages');
