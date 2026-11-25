// What a soldier can wear. Looks only: gear never changes health, speed or hitboxes, so every outfit is fair.
// The first item of each slot is the default. A whole outfit travels as a short code, one character per slot,
// so the order of slots and items is part of the protocol: add new items at the end.
export const GEAR = {
  helmet: { name: 'Headgear', view: 'head', items: {
    combat: 'Combat helmet', highcut: 'High-cut helmet', nvg: 'Night-ops helmet', assault: 'Assault helmet, visor',
    crew: 'Crew helmet', boonie: 'Boonie hat', beret: 'Beret', cap: 'Patrol cap', none: 'No headgear',
  } },
  face: { name: 'Face', view: 'head', items: {
    none: 'Bare face', goggles: 'Goggles', shades: 'Shooting glasses', balaclava: 'Balaclava', scarf: 'Desert scarf', gasmask: 'Gas mask', paint: 'Face paint',
  } },
  skin: { name: 'Skin tone', view: 'head', items: { a: 'Tone 1', b: 'Tone 2', c: 'Tone 3', d: 'Tone 4', e: 'Tone 5' } },
  camo: { name: 'Uniform', view: 'full', items: {
    team: 'Team issue', woodland: 'Woodland', desert: 'Desert', arctic: 'Arctic', urban: 'Urban', tiger: 'Tiger stripe', pixel: 'Pixel green', night: 'Night black',
  } },
  vest: { name: 'Body armour', view: 'chest', items: {
    plate: 'Plate carrier', heavy: 'Heavy armour', rig: 'Chest rig', ghillie: 'Ghillie cape', harness: 'Light harness',
  } },
  pack: { name: 'Backpack', view: 'back', items: {
    assault: 'Assault pack', ruck: 'Rucksack and bedroll', radio: 'Field radio', hydro: 'Water carrier', none: 'No backpack',
  } },
  gloves: { name: 'Gloves', view: 'chest', items: { black: 'Black', coyote: 'Coyote', olive: 'Olive', grey: 'Grey', none: 'Bare hands' } },
  boots: { name: 'Boots', view: 'legs', items: { black: 'Black', tan: 'Tan', brown: 'Brown', grey: 'Grey' } },
  extra: { name: 'Belt kit', view: 'legs', items: { pouches: 'Belt pouches', knees: 'Knee pads', holster: 'Thigh holster', full: 'Full kit', none: 'Bare belt' } },
  finish: { name: 'Weapon finish', view: 'gun', items: {
    factory: 'Factory', tan: 'Desert tan', olive: 'Olive drab', snow: 'Snow', woodland: 'Woodland', tiger: 'Tiger stripe', pixel: 'Pixel green', ember: 'Ember',
  } },
};
export const SLOTS = Object.keys(GEAR);
const IDS = Object.fromEntries(SLOTS.map(s => [s, Object.keys(GEAR[s].items)]));
export const itemsOf = slot => IDS[slot];

// Any object -> a complete, valid outfit.
export function cleanGear(g) {
  const out = {};
  for (const s of SLOTS) out[s] = g && typeof g === 'object' && IDS[s].includes(g[s]) ? g[s] : IDS[s][0];
  return out;
}
export const packGear = g => SLOTS.map(s => Math.max(0, IDS[s].indexOf(g[s])).toString(36)).join('');
export function unpackGear(code) {
  const out = {}, c = typeof code === 'string' ? code : '';
  SLOTS.forEach((s, i) => { out[s] = IDS[s][parseInt(c[i], 36)] || IDS[s][0]; });
  return out;
}
export const randomGear = () => Object.fromEntries(SLOTS.map(s => [s, IDS[s][Math.random() * IDS[s].length | 0]]));
