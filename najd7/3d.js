/* Najd 7 — 3D v5 (three.js r170, vendored). Scene is pixel-mapped from the developer's aerial masterplan (img/master.webp, 973×516):
   every villa, pergola cell, roof, lane, planted buffer, the pool / lounge / clubhouse / court block and the parking are placed at the
   measured pixel coordinates (1 px = 0.17 m). Facade language follows the developer's street renders. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const N7 = window.N7; if (!N7) throw new Error('N7 missing');
const { plots, TYPES } = N7;
const QS = new URLSearchParams(location.search);
const COARSE = matchMedia('(pointer:coarse)').matches;
const HIGH = QS.get('q') ? QS.get('q') === 'high' : (!COARSE && (navigator.hardwareConcurrency || 4) >= 4);

// ---------------------------------------------------------------- plan frame
const PX = 0.17, CX = 480, CY = 258;
const X = px => (px - CX) * PX, Z = py => (py - CY) * PX;
const FH = 3.4;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// measured white-roof segments per row, left→right (px)
const SEG = {
  top: [[17,46],[54,83],[91,117],[125,154],[162,191],[199,228],[236,265],[273,301],[309,338],[346,377],[384,414],[421,450],[457,486],[494,523],[531,561],[568,597],[605,635],[643,672],[679,709],[717,746],[754,781],[789,817],[825,854],[862,891],[899,925]],
  ml: [[19,48],[56,85],[93,119],[127,155],[164,193],[201,229],[238,266],[274,302],[310,339],[347,377],[385,415]],
  mr: [[508,537],[545,573],[582,607],[615,644],[653,681],[689,718],[726,755],[763,791],[799,828],[836,866],[874,904],[912,936]],
  bot: [[21,49],[58,86],[94,120],[127,156],[164,193],[200,229],[237,265],[273,301],[309,338],[346,375],[383,412],[420,447],[455,484],[491,520],[528,557],[565,593],[601,629],[638,666],[674,703],[711,740],[747,775],[782,810],[818,846],[854,883],[890,916]]
};
// back edge (py), white roof start/end and pergola front, measured from the back edge (px). face: +1 front→south, −1 front→north
const ROWS = [
  { seg: SEG.top, first: 73, back: 148, zw0: 12, zw1: 68, zf: 114, face: -1 },
  { seg: SEG.ml,  first: 48, back: 310, zw0: 16, zw1: 72, zf: 116, face: -1 },
  { seg: SEG.mr,  first: 37, back: 310, zw0: 16, zw1: 72, zf: 116, face: -1 },
  { seg: SEG.bot, first: 25, back: 342, zw0: 14, zw1: 78, zf: 128, face: 1 }
];
const FLOORS_N = t => (t === 'A' ? 3 : 2);

// ---------------------------------------------------------------- textures
function ctex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (o.rep) t.repeat.set(o.rep[0], o.rep[1]); return t;
}
function speckle(x, w, h, amt, seed = 1) { const r = rng(seed); const d = x.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (r() - .5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0); }
const TX = {};
function textures() {
  if (TX.ok) return TX;
  TX.stucco = ctex(512, 512, (x, w, h) => { x.fillStyle = '#d9bd98'; x.fillRect(0, 0, w, h); speckle(x, w, h, 14, 2); x.fillStyle = 'rgba(120,85,50,.18)'; x.fillRect(0, 0, 2, h); x.fillRect(w / 2, 0, 2, h); });
  TX.stone = ctex(512, 512, (x, w, h) => { x.fillStyle = '#dcd7cd'; x.fillRect(0, 0, w, h); speckle(x, w, h, 12, 3); x.fillStyle = 'rgba(90,80,70,.35)'; for (let y = 0; y < h; y += 51) x.fillRect(0, y, w, 3); x.fillStyle = 'rgba(90,80,70,.15)'; for (let y = 0; y < h; y += 51) for (let i = 0; i < 3; i++) x.fillRect(((y * 7 + i * 173) % w), y, 2, 51); });
  TX.wood = ctex(256, 256, (x, w, h) => { x.fillStyle = '#c0733c'; x.fillRect(0, 0, w, h); const r = rng(4); for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(${90 + r() * 40},${45 + r() * 25},${20},${.18 + r() * .2})`; x.lineWidth = 1 + r() * 2; x.beginPath(); const y = r() * h; x.moveTo(0, y); x.bezierCurveTo(w * .3, y + r() * 6 - 3, w * .6, y + r() * 6 - 3, w, y + r() * 4 - 2); x.stroke(); } });
  TX.woodL = ctex(256, 256, (x, w, h) => { x.fillStyle = '#e9d3b2'; x.fillRect(0, 0, w, h); const r = rng(14); for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(150,110,70,${.08 + r() * .12})`; x.lineWidth = 1 + r() * 2; x.beginPath(); const y = r() * h; x.moveTo(0, y); x.bezierCurveTo(w * .3, y + r() * 6 - 3, w * .6, y + r() * 6 - 3, w, y + r() * 4 - 2); x.stroke(); } });
  TX.paverL = ctex(512, 512, (x, w, h) => { x.fillStyle = '#e7dccb'; x.fillRect(0, 0, w, h); speckle(x, w, h, 10, 5); x.fillStyle = 'rgba(150,135,110,.45)'; for (let i = 0; i <= w; i += 64) { x.fillRect(i, 0, 2, h); x.fillRect(0, i, w, 2); } });
  TX.paverD = ctex(512, 512, (x, w, h) => { x.fillStyle = '#827a70'; x.fillRect(0, 0, w, h); speckle(x, w, h, 16, 6); x.fillStyle = 'rgba(40,36,32,.4)'; for (let i = 0; i <= h; i += 43) { x.fillRect(0, i, w, 2); for (let j = (i / 43 % 2) * 64; j <= w; j += 128) x.fillRect(j, i, 2, 43); } });
  TX.asphalt = ctex(512, 512, (x, w, h) => { x.fillStyle = '#3c3c3f'; x.fillRect(0, 0, w, h); speckle(x, w, h, 26, 7); });
  TX.lawn = ctex(512, 512, (x, w, h) => { x.fillStyle = '#5f9e3c'; x.fillRect(0, 0, w, h); const r = rng(8); for (let i = 0; i < 9000; i++) { x.fillStyle = r() < .5 ? `rgba(40,90,25,${.25 + r() * .3})` : `rgba(150,200,80,${.2 + r() * .3})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 3); } });
  TX.mulch = ctex(256, 256, (x, w, h) => { x.fillStyle = '#6b4c34'; x.fillRect(0, 0, w, h); speckle(x, w, h, 40, 9); });
  TX.sand = ctex(512, 512, (x, w, h) => { x.fillStyle = '#e2d3b6'; x.fillRect(0, 0, w, h); speckle(x, w, h, 14, 10); });
  TX.clay = ctex(512, 512, (x, w, h) => { x.fillStyle = '#c8663a'; x.fillRect(0, 0, w, h); speckle(x, w, h, 18, 11); });
  TX.tile = ctex(256, 256, (x, w, h) => { x.fillStyle = '#bfeef0'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(40,120,130,.35)'; for (let i = 0; i <= w; i += 32) { x.fillRect(i, 0, 2, h); x.fillRect(0, i, w, 2); } });
  TX.perf = ctex(128, 128, (x) => { x.clearRect(0, 0, 128, 128); x.fillStyle = '#2d2420'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x.fillRect(14 + i * 38, 14 + j * 38, 24, 24); });
  TX.leaf = ctex(256, 256, (x, w, h) => { x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, w, h); const r = rng(12); for (let i = 0; i < 2600; i++) { const v = 120 + r() * 135 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.ellipse(r() * w, r() * h, 2 + r() * 4, 1 + r() * 2, r() * 3, 0, 6.3); x.fill(); } });
  TX.frond = ctex(512, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = '#7d7a3c'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); const r = rng(13);
    for (let px = 12; px < w - 6; px += 6) { const L = 52 * Math.sin(Math.PI * px / w) + 6; for (const s of [-1, 1]) { const g = 100 + r() * 70 | 0; x.strokeStyle = `rgb(${70 + r() * 30 | 0},${g},${35 + r() * 20 | 0})`; x.lineWidth = 3.5; x.beginPath(); x.moveTo(px, h / 2); x.lineTo(px + L * .55, h / 2 + s * L * .85); x.stroke(); } } });
  TX.trunk = ctex(64, 256, (x, w, h) => { x.fillStyle = '#8b6a48'; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { x.fillStyle = '#5e4630'; x.fillRect(0, y, w, 4); x.fillStyle = '#a58460'; x.fillRect(0, y + 5, w, 3); } }, { rep: [1, 8] });
  TX.waterN = (() => { const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); const img = x.createImageData(S, S); const hgt = (i, j) => { const u = i / S * 6.2832, v = j / S * 6.2832; return Math.sin(u * 3 + v * 2) * .5 + Math.sin(u * 5 - v * 4) * .3 + Math.sin(u * 9 + v * 7) * .18 + Math.sin(-u * 2 + v * 11) * .12; };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const dx = hgt(i + 1, j) - hgt(i - 1, j), dy = hgt(i, j + 1) - hgt(i, j - 1); const nx = -dx * 2, ny = -dy * 2, nz = 1; const l = Math.hypot(nx, ny, nz); const k = (j * S + i) * 4; img.data[k] = (nx / l * .5 + .5) * 255; img.data[k + 1] = (ny / l * .5 + .5) * 255; img.data[k + 2] = (nz / l * .5 + .5) * 255; img.data[k + 3] = 255; }
    x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t; })();
  TX.ok = true; return TX;
}

// ---------------------------------------------------------------- materials
const MT = {};
function mats() {
  if (MT.ok) return MT; const T = textures();
  const S = (o, u) => { const m = new THREE.MeshStandardMaterial(o); m.userData.uv = u || 2; return m; };
  const P = (o, u) => { const m = new THREE.MeshPhysicalMaterial(o); m.userData.uv = u || 2; return m; };
  Object.assign(MT, {
    stucco: S({ map: T.stucco, roughness: .86 }, 3), stuccoRoof: S({ map: T.stucco, color: '#fff3e6', roughness: .86 }, 3),
    stone: S({ map: T.stone, roughness: .78 }, 3), dark: S({ color: '#2b2522', roughness: .42, metalness: .35 }),
    wood: S({ map: T.wood, roughness: .58 }, 1.2), slat: S({ map: T.woodL, roughness: .62 }, 1.2), door: S({ map: T.wood, color: '#8a5a3a', roughness: .5 }, 1.2),
    deck: S({ map: T.wood, color: '#e2c4a4', roughness: .7 }, 1.6), white: S({ color: '#f6f3ee', roughness: .72 }), tan: S({ color: '#d5b791', roughness: .82 }),
    joint: S({ color: '#b48f64', roughness: .9 }), curb: S({ color: '#d9d2c5', roughness: .85 }), line: S({ color: '#f5f4f0', roughness: .8 }),
    winLit: P({ color: '#1c2a31', metalness: .55, roughness: .05, envMapIntensity: 1.7, emissive: '#ffcf90', emissiveIntensity: 0 }),
    winDark: P({ color: '#1c2a31', metalness: .55, roughness: .05, envMapIntensity: 1.7, emissive: '#ffb56b', emissiveIntensity: 0 }),
    glass: P({ color: '#d6ece8', roughness: .04, metalness: 0, transparent: true, opacity: .3, envMapIntensity: 1.3, depthWrite: false }),
    perf: S({ map: T.perf, transparent: true, alphaTest: .5, roughness: .9 }), lamp: S({ color: '#fff4dc', emissive: '#ffd08a', emissiveIntensity: .15 }),
    paverL: S({ map: T.paverL, roughness: .92 }, 3), paverD: S({ map: T.paverD, roughness: .9 }, 3), asphalt: S({ map: T.asphalt, roughness: .96 }, 7),
    lawn: S({ map: T.lawn, roughness: 1 }, 5), mulch: S({ map: T.mulch, roughness: 1 }, 2), sand: S({ map: T.sand, roughness: 1 }, 9), clay: S({ map: T.clay, roughness: .95 }, 4),
    tile: S({ map: T.tile, roughness: .4 }, 1.2), coping: S({ color: '#efe8dc', roughness: .7 }), rubber: S({ color: '#3a3d3c', roughness: .95 }),
    fabric: S({ color: '#f1ebe1', roughness: .95 }), accent: S({ color: '#c8643a', roughness: .9 }),
    metal: S({ color: '#9aa0a3', metalness: .85, roughness: .3 }), mesh: S({ color: '#1e1e1e', transparent: true, opacity: .3, roughness: .8, side: THREE.DoubleSide, depthWrite: false }),
    context: S({ color: '#e6dccb', roughness: .95 }), context2: S({ color: '#dccfb9', roughness: .95 }), ctxWin: S({ color: '#6c6660', roughness: .5, emissive: '#ffcf90', emissiveIntensity: 0 }),
    sculpt1: S({ color: '#c8503a', metalness: .6, roughness: .3 }), sculpt2: S({ color: '#1e9c8f', metalness: .6, roughness: .3 })
  });
  ['glass', 'perf', 'mesh'].forEach(k => MT[k].userData.aoHide = true);
  ['perf', 'lamp', 'line', 'glass', 'mesh'].forEach(k => MT[k].userData.noCast = true);
  MT.perf.userData.keepUV = true;
  MT.water = new THREE.MeshPhysicalMaterial({ color: '#39c9cc', roughness: .04, metalness: 0, transparent: true, opacity: .84, normalMap: T.waterN, normalScale: new THREE.Vector2(.35, .35), envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: .05, emissive: '#19b7c2', emissiveIntensity: 0 });
  // Poly Haven CC0 PBR textures (tex/*.webp): real surface relief + asphalt/sand/wood/lane colour
  const TL = new THREE.TextureLoader(); const ld = (f, srgb) => { const t = TL.load('tex/' + f + '.webp'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const nrm = (m, f, k) => { m.normalMap = ld(f); m.normalScale = new THREE.Vector2(k, k); m.needsUpdate = true; };
  nrm(MT.stucco, 'stucco_n', .55); MT.stuccoRoof.normalMap = MT.stucco.normalMap; MT.stuccoRoof.normalScale = MT.stucco.normalScale;
  nrm(MT.paverL, 'paverL_n', .7); nrm(MT.lawn, 'lawn_n', .8);
  MT.paverD.map = ld('paverD_d', 1); MT.paverD.color.set('#d8d2ca'); nrm(MT.paverD, 'paverD_n', .8);
  MT.asphalt.map = ld('asphalt_d', 1); MT.asphalt.color.set('#b8b8b8'); nrm(MT.asphalt, 'asphalt_n', .6);
  MT.sand.map = ld('sand_d', 1); MT.sand.color.set('#f3e6cf'); nrm(MT.sand, 'sand_n', .6);
  const wd = ld('wood_d', 1), wn = ld('wood_n');
  [[MT.wood, '#f0a36a'], [MT.deck, '#ffffff'], [MT.door, '#8f6446']].forEach(([m, c]) => { m.map = wd; m.color.set(c); m.normalMap = wn; m.normalScale = new THREE.Vector2(.5, .5); m.needsUpdate = true; });
  MT.ok = true; return MT;
}
function worldUV(g, s) { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; if (!uv) return; for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v; if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); } uv.setXY(i, u / s, v / s); } uv.needsUpdate = true; }

// geometry bag: collects transformed primitives per material and merges them (few draw calls)
class Bag {
  constructor() { this.map = new Map(); this.T = new THREE.Matrix4(); }
  add(m, g) { g.applyMatrix4(this.T); let a = this.map.get(m); if (!a) this.map.set(m, a = []); a.push(g); return g; }
  bb(m, x0, y0, z0, x1, y1, z1) { const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0); if (w < 1e-3 || h < 1e-3 || d < 1e-3) return; const g = new THREE.BoxGeometry(w, h, d); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return this.add(m, g); }
  quad(m, w, h, x, y, z, ry = 0) { const g = new THREE.PlaneGeometry(w, h); if (ry) g.rotateY(ry); g.translate(x, y, z); return this.add(m, g); }
  cyl(m, rt, rb, h, x, y, z, seg = 12) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return this.add(m, g); }
  flush(parent, tag) { const out = []; for (const [m, gs] of this.map) { if (!m.userData.keepUV) gs.forEach(g => worldUV(g, m.userData.uv || 2)); const geo = mergeGeometries(gs, false); gs.forEach(g => g.dispose()); const mesh = new THREE.Mesh(geo, m); mesh.castShadow = !m.userData.noCast; mesh.receiveShadow = true; if (tag) mesh.userData.tag = tag; parent.add(mesh); out.push(mesh); } this.map.clear(); return out; }
}

// ---------------------------------------------------------------- vegetation / props registry (instanced later)
function newRegistry() { return { palms: [], trees: [], shrubs: [], flowers: [], cars: [], labels: [], glowS: [], glowL: [], pools: [] }; }
const GREENS = ['#4c8f33', '#5da33b', '#3d7d2f', '#72ad42', '#86bd4b', '#2f6e2e', '#63a047'];
const BLOOM = ['#d8247a', '#e8508f', '#e0412f', '#f4c430', '#f7f3ea', '#9b5bd3', '#f08a24', '#ff6f91'];

// ---------------------------------------------------------------- the townhouse
// local frame: x across (−w/2..w/2), z from back edge (0) to pergola front (zf), front = +z.
// B(key) returns the bag for a part; keys: s{k} shell of floor k, i{k} interior, c{k} ceiling, r roof level.
function townhouse(B, s, reg, T) {
  const M = mats(); const { w, zw0, zw1, zf, N } = s; const hw = w / 2, zF = zf - 0.9, zG = zF - 0.35, H = N * FH; const r = rng(s.seed || 1);
  const win = () => (r() < .68 ? M.winLit : M.winDark);
  const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(T);
  // ---- rear yard + light canopy (plan: thin grey strip with dark separators)
  let b = B('s0');
  b.bb(M.paverL, -hw, 0, 0, hw, .06, zw0); b.bb(M.stucco, -hw, 0, 0, -hw + .16, 1.9, zw0); b.bb(M.stucco, -hw, 0, 0, hw, 1.9, .16);
  b.bb(M.dark, -hw, FH - .3, 0, -hw + .22, FH - .05, zw0); b.bb(M.dark, hw - .22, FH - .3, 0, hw, FH - .05, zw0); b.bb(M.dark, -hw, FH - .3, 0, hw, FH - .05, .22);
  for (let z = .4; z < zw0 - .1; z += .34) b.bb(M.slat, -hw + .22, FH - .22, z, hw - .22, FH - .12, z + .1);
  reg.shrubs.push({ p: P(-hw + .9, 0, zw0 * .45), s: .55, c: GREENS[(r() * 7) | 0] });
  // ---- floors
  for (let k = 0; k < N; k++) {
    const y0 = k * FH, y1 = y0 + FH, face = k === 0 ? zG : zF; b = B('s' + k); const bi = B('i' + k), bc = B('c' + k);
    const wm = k === 0 ? M.stone : M.stucco;
    if (!s.hollow) b.bb(wm, -hw, y0, zw0, hw, y1, face);
    else {
      b.bb(M.coping, -hw, y0, zw0, hw, y0 + .18, face); bc.bb(M.white, -hw + .2, y1 - .18, zw0 + .2, hw - .2, y1, face - .2);
      b.bb(wm, -hw, y0, zw0, -hw + .2, y1, face); b.bb(wm, hw - .2, y0, zw0, hw, y1, face); b.bb(wm, -hw, y0, zw0, hw, y1, zw0 + .2);
      if (k === 0) { b.bb(wm, -hw, y0, face - .2, -2.45, y1, face); b.bb(wm, -.25, y0, face - .2, .85, y1, face); b.bb(wm, 2.45, y0, face - .2, hw, y1, face); b.bb(wm, -2.45, y0 + 2.8, face - .2, 2.45, y1, face); }
      else { b.bb(wm, -hw, y0, face - .2, -1.0, y1, face); b.bb(wm, 1.3, y0, face - .2, hw, y1, face); b.bb(wm, -1.0, y0 + 3.0, face - .2, 1.3, y1, face); b.bb(wm, -1.0, y0, face - .2, 1.3, y0 + .3, face); }
      interior(bi, k, s, hw, zw0, face, y0, reg);
    }
    // back facade
    if (k === 0) { b.bb(M.dark, -1.65, .05, zw0 - .12, 1.15, 2.72, zw0); b.bb(win(), -1.55, .12, zw0 - .15, 1.05, 2.62, zw0 - .1); b.bb(M.dark, -.25, .12, zw0 - .2, -.19, 2.62, zw0 - .12); }
    else [-1.5, 1.2].forEach(cx => { b.bb(M.dark, cx - .6, y0 + 1.0, zw0 - .12, cx + .6, y0 + 2.85, zw0); b.bb(win(), cx - .52, y0 + 1.08, zw0 - .15, cx + .52, y0 + 2.77, zw0 - .1); });
    // front facade
    if (k === 0) {
      b.bb(M.dark, -2.52, .3, zG, -.18, 2.82, zG + .12); b.bb(win(), -2.42, .4, zG + .1, -.28, 2.72, zG + .16); b.bb(M.dark, -1.38, .4, zG + .14, -1.32, 2.72, zG + .2); b.bb(M.dark, -2.42, 2.05, zG + .14, -.28, 2.1, zG + .2);
      b.bb(M.door, .92, 0, zG, 2.0, 2.7, zG + .1); b.bb(win(), 2.08, .1, zG, 2.42, 2.7, zG + .12); b.bb(M.dark, .62, 2.86, zG, 2.72, 3.0, zG + 1.15);
      b.bb(M.lamp, .72, 2.1, zG + .1, .82, 2.4, zG + .2); b.bb(M.lamp, 2.52, 2.1, zG + .1, 2.62, 2.4, zG + .2); reg.glowS.push(P(.77, 2.25, zG + .3), P(2.57, 2.25, zG + .3)); reg.pools.push({ p: P(1.67, .08, zG + 1.1), s: 3.2 });
      b.bb(M.stone, .7, 0, zG, 2.3, .14, zG + .95);
      b.bb(M.stone, -2.7, 0, zG + .2, -.05, .55, zG + .95); b.bb(M.mulch, -2.62, .55, zG + .28, -.13, .6, zG + .87);
      for (let i = 0; i < 3; i++) reg.shrubs.push({ p: P(-2.3 + i * .95, .55, zG + .58), s: .42 + r() * .12, c: r() < .5 ? GREENS[(r() * 7) | 0] : BLOOM[(r() * 8) | 0] });
      for (let i = 0; i < 5; i++) reg.flowers.push({ p: P(-2.5 + r() * 2.3, .72, zG + .35 + r() * .5), c: BLOOM[(r() * 8) | 0] });
      b.bb(M.dark, -hw, FH - .12, zF - .45, hw, FH + .22, zF + .25);   // fascia band
    } else {
      b.bb(M.joint, -hw, y0 - .04, face, hw, y0 + .04, face + .03);
      b.bb(M.dark, -1.05, y0 + .3, face, .38, y0 + 3.0, face + .16); b.bb(win(), -.97, y0 + .38, face + .12, .3, y0 + 2.92, face + .18);
      b.bb(M.dark, -.36, y0 + .38, face + .16, -.3, y0 + 2.92, face + .22); b.bb(M.dark, -.97, y0 + 2.2, face + .16, .3, y0 + 2.26, face + .22);
      for (let i = 0; i < 6; i++) b.bb(M.wood, .5 + i * .14, y0 + .22, face, .56 + i * .14, y0 + 3.08, face + .26);
      b.quad(M.perf, .95, .95, -2.05, y0 + 1.7, face + .013); b.quad(M.perf, .95, .95, 2.05, y0 + 1.15, face + .013);
      b.bb(M.dark, -hw, y0, zF - .08, -hw + .3, y1, zf); b.bb(M.dark, hw - .3, y0, zF - .08, hw, y1, zf);   // portal piers
    }
    if (k > 0) { if (s.endL) { b.quad(M.perf, .95, .95, -hw - .013, y0 + 1.5, zw0 + (face - zw0) * .35, -Math.PI / 2); b.quad(M.perf, .95, .95, -hw - .013, y0 + 1.5, zw0 + (face - zw0) * .7, -Math.PI / 2); }
      if (s.endR) { b.quad(M.perf, .95, .95, hw + .013, y0 + 1.5, zw0 + (face - zw0) * .35, Math.PI / 2); b.quad(M.perf, .95, .95, hw + .013, y0 + 1.5, zw0 + (face - zw0) * .7, Math.PI / 2); } }
  }
  // ---- roof level: roof room (white roof in plan), terrace, pergola (striped cell with black frame in plan)
  b = B('r');
  b.bb(M.dark, -hw, H, zF - .08, -hw + .3, H + 3.35, zf); b.bb(M.dark, hw - .3, H, zF - .08, hw, H + 3.35, zf);
  b.bb(M.deck, -hw + .3, H, zw1, hw - .3, H + .12, zF);
  b.bb(M.glass, -hw + .3, H + .12, zF - .06, hw - .3, H + 1.12, zF - .02); b.bb(M.dark, -hw + .3, H + 1.1, zF - .09, hw - .3, H + 1.16, zF + .01);
  b.bb(M.stuccoRoof, -hw + .45, H, zw0, hw - .45, H + 3.0, zw1);
  b.bb(M.dark, -1.5, H + .1, zw1, 1.1, H + 2.6, zw1 + .1); b.bb(win(), -1.4, H + .18, zw1 + .08, 1.0, H + 2.52, zw1 + .14);
  b.bb(M.tan, -hw, H, zw0 - .05, -hw + .45, H + 3.42, zw1); b.bb(M.tan, hw - .45, H, zw0 - .05, hw, H + 3.42, zw1);
  if (s.hollow) b.bb(M.white, -hw + .45, H + 3.0, zw0, hw - .45, H + 3.22, zw1);
  b.bb(M.dark, -hw, H + 3.0, zw1 - .3, -hw + .3, H + 3.35, zf); b.bb(M.dark, hw - .3, H + 3.0, zw1 - .3, hw, H + 3.35, zf);
  b.bb(M.dark, -hw, H + 3.0, zf - .35, hw, H + 3.35, zf); b.bb(M.dark, -hw + .3, H + 3.0, zw1 - .3, hw - .3, H + 3.35, zw1);
  for (let z = zw1 + .12; z < zf - .42; z += .33) b.bb(M.slat, -hw + .3, H + 3.12, z, hw - .3, H + 3.28, z + .13);
  b.bb(M.fabric, -2.2, H + .12, zw1 + 1.2, -.2, H + .55, zw1 + 2.0); b.bb(M.accent, -2.0, H + .55, zw1 + 1.25, -1.4, H + .85, zw1 + 1.4); b.bb(M.wood, -1.8, H + .12, zw1 + 2.5, -.6, H + .5, zw1 + 3.3);
  b.bb(M.stone, 1.4, H + .12, zF - 1.2, 2.3, H + .6, zF - .3);
  reg.shrubs.push({ p: P(1.85, H + .6, zF - .75), s: .55, c: r() < .5 ? '#d8247a' : GREENS[(r() * 7) | 0] });
  return { H, cap: { x0: -hw + .45, x1: hw - .45, y0: H + 3.0, y1: H + 3.22, z0: zw0, z1: zw1 } };
}
// dolls-house interior (modal only)
const ROOMS = {
  0: [{ n: 'مجلس', x: .18, z: .78 }, { n: 'مدخل', x: .3, z: .55 }, { n: 'معيشة ومطبخ', x: -.12, z: .28 }, { n: 'حمّام ضيوف', x: .32, z: .12 }],
  1: [{ n: 'غرفة رئيسية', x: -.05, z: .78 }, { n: 'غرفة نوم', x: -.22, z: .22 }, { n: 'غرفة نوم', x: .25, z: .22 }, { n: 'صالة', x: .2, z: .5 }],
  2: [{ n: 'الجناح الرئيسي', x: -.05, z: .78 }, { n: 'غرفة خادمة', x: .28, z: .2 }, { n: 'صالة عائلية', x: -.2, z: .3 }]
};
function interior(b, k, s, hw, z0, z1, y0, reg) {
  const M = mats(); const D = z1 - z0, h = FH - .2, zz = f => z0 + D * f;
  b.bb(M.fabric, -hw + .2, y0 + .18, zz(.45), hw - 1.8, y0 + h - .4, zz(.45) + .12);
  if (k > 0) b.bb(M.fabric, .3, y0 + .18, z0 + .2, .42, y0 + h - .4, zz(.45));
  b.bb(M.stone, -hw + .5, y0 + .18, zz(.52), -hw + 2.1, y0 + h, zz(.52) + 1.6);   // stair / lift core
  (ROOMS[k] || []).forEach(rm => { const cx = rm.x * s.w, cz = zz(rm.z);
    if (/نوم|رئيسي|الجناح|خادمة/.test(rm.n)) { b.bb(M.fabric, cx - .85, y0 + .18, cz - 1.0, cx + .85, y0 + .7, cz + 1.0); b.bb(M.accent, cx - .85, y0 + .7, cz + .45, cx + .85, y0 + .8, cz + 1.0); b.bb(M.door, cx - .9, y0 + .18, cz - 1.15, cx + .9, y0 + 1.2, cz - 1.0); }
    if (rm.n === 'مجلس') { b.bb(M.fabric, cx - 1.1, y0 + .18, cz + .55, cx + 1.1, y0 + .65, cz + 1.25); b.bb(M.fabric, cx + .7, y0 + .18, cz - .9, cx + 1.3, y0 + .65, cz + .55); b.bb(M.wood, cx - .5, y0 + .18, cz - .4, cx + .3, y0 + .55, cz + .2); }
    if (/مطبخ/.test(rm.n)) { b.bb(M.dark, -hw + .3, y0 + .18, z0 + .25, hw - .6, y0 + 1.05, z0 + .85); b.bb(M.wood, cx - .8, y0 + .18, cz - .2, cx + .8, y0 + .95, cz + .6); b.bb(M.fabric, cx - 1.2, y0 + .18, cz + 1.2, cx + .8, y0 + .6, cz + 1.9); }
    if (/صالة/.test(rm.n)) { b.bb(M.fabric, cx - .9, y0 + .18, cz - .35, cx + .9, y0 + .62, cz + .35); }
    reg.labels.push({ t: rm.n, k, x: cx, y: y0 + h - .5, z: cz }); });
}

// ---------------------------------------------------------------- instanced vegetation & props
function blobGeo(seed, n, spread, flat = 1) {
  const r = rng(seed); const parts = [];
  for (let i = 0; i < n; i++) { const g = new THREE.IcosahedronGeometry(.5 + r() * .38, 3); g.scale(1, flat, 1); g.translate((r() - .5) * spread, (r() - .25) * spread * .55 * flat, (r() - .5) * spread); parts.push(g); }
  let geo = mergeGeometries(parts); geo.deleteAttribute('normal'); geo.deleteAttribute('uv'); geo = mergeVertices(geo, 1e-4);
  const p = geo.attributes.position; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const d = (Math.sin(x * 7.1) + Math.sin(y * 8.3 + 1) + Math.sin(z * 6.7 + 2)) * .035; const l = Math.hypot(x, y, z) || 1; p.setXYZ(i, x + x / l * d, y + y / l * d, z + z / l * d); uv[i * 2] = Math.atan2(z, x) / 6.283 * 3; uv[i * 2 + 1] = y * 1.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.computeVertexNormals(); return geo;
}
function crownGeo() {
  const r = rng(77); const parts = [];
  for (let i = 0; i < 20; i++) { const g = new THREE.PlaneGeometry(1, .36, 12, 1); g.translate(.5, 0, 0); const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) { const u = p.getX(j), v = p.getY(j); p.setXYZ(j, u, -.55 * u * u + .28 * u, v * (1 - .55 * u)); }
    const tier = i % 3; g.rotateZ((tier === 0 ? .62 : tier === 1 ? .2 : -.28) + (r() - .5) * .15); g.rotateY(i * 2.39996 + r() * .2); g.scale(.85 + r() * .3, 1, 1); parts.push(g); }
  const geo = mergeGeometries(parts); geo.computeVertexNormals(); return geo;
}
const windU = { value: 0 };
function makeSky(scale) {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, gnd: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunC: { value: new THREE.Color() }, sunS: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, hor, gnd, sunC; uniform vec3 sunDir; uniform float sunS; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = d.y; vec3 c = h > 0. ? mix(hor, top, pow(clamp(h, 0., 1.), .5)) : mix(hor, gnd, clamp(-h * 5., 0., 1.));
        float s = max(dot(d, normalize(sunDir)), 0.); c += sunC * (pow(s, 900.) * 12. + pow(s, 14.) * .45 + pow(s, 3.) * .08) * sunS;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const o = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m); o.scale.setScalar(scale); o.frustumCulled = false; o.renderOrder = -1; return o;
}
function setSky(o, p, dir) { const U = o.material.uniforms; U.top.value.set(p.skyT); U.hor.value.set(p.skyH); U.gnd.value.set(p.skyG); U.sunDir.value.copy(dir); U.sunC.value.set(p.sunC); U.sunS.value = p.sunS; }
function leafTexA() { return ctex(256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); const r = rng(31); for (let i = 0; i < 70; i++) { const v = 150 + r() * 105 | 0; x.fillStyle = `rgb(${v - 10},${v},${v - 20})`; x.save(); x.translate(20 + r() * 216, 20 + r() * 216); x.rotate(r() * 6.3); x.beginPath(); x.ellipse(0, 0, 9 + r() * 7, 4 + r() * 3, 0, 0, 6.3); x.fill(); x.strokeStyle = 'rgba(60,70,40,.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-10, 0); x.lineTo(10, 0); x.stroke(); x.restore(); } }); }
function cardGeo(seed, n, rx, ry, rz, size) {
  const r = rng(seed); const parts = [];
  for (let i = 0; i < n; i++) { const g = new THREE.PlaneGeometry(size, size); const u = r() * 2 - 1, th = r() * 6.283, rr = Math.pow(r(), .3); const x = Math.sqrt(1 - u * u) * Math.cos(th) * rr * rx, y = u * rr * ry, z = Math.sqrt(1 - u * u) * Math.sin(th) * rr * rz;
    g.rotateX(r() * Math.PI); g.rotateY(r() * Math.PI); g.rotateZ(r() * Math.PI); const s = .75 + r() * .5; g.scale(s, s, s); g.translate(x, y, z);
    const nn = g.attributes.normal, l = Math.hypot(x, y * .8, z) || 1; for (let k = 0; k < nn.count; k++) nn.setXYZ(k, x / l, (y + .35 * ry) / l, z / l); parts.push(g); }
  return mergeGeometries(parts);
}
function sway(m, amp) { m.onBeforeCompile = sh => { sh.uniforms.uTime = windU; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
   vec4 ip = instanceMatrix[3];
  #else
   vec4 ip = vec4(0.);
  #endif
  float hh = length(transformed.xz) + max(transformed.y, 0.);
  transformed.x += sin(uTime*1.4 + ip.x*.31 + ip.z*.17) * ${amp.toFixed(4)} * hh;
  transformed.z += cos(uTime*1.1 + ip.x*.23) * ${(amp * .7).toFixed(4)} * hh;
  transformed.y += sin(uTime*1.7 + ip.z*.4 + transformed.x*2.) * ${(amp * .5).toFixed(4)} * hh;`); }; }
function carGeos() {
  const sh = new THREE.Shape(); [[-2.3, .42], [-2.26, .86], [-1.25, .98], [-.62, 1.42], [.86, 1.42], [1.5, 1.0], [2.26, .9], [2.32, .5], [2.22, .3], [-2.2, .3]].forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
  const body = new THREE.ExtrudeGeometry(sh, { depth: 1.62, bevelEnabled: true, bevelThickness: .1, bevelSize: .09, bevelSegments: 3, steps: 1 }); body.translate(0, 0, -.81);
  const gs = new THREE.Shape(); [[-1.05, 1.02], [-.56, 1.38], [.8, 1.38], [1.32, 1.02]].forEach(([x, y], i) => i ? gs.lineTo(x, y) : gs.moveTo(x, y));
  const glass = new THREE.ExtrudeGeometry(gs, { depth: 1.86, bevelEnabled: false }); glass.translate(0, 0, -.93);
  const wh = []; [[-1.45, -.84], [1.45, -.84], [-1.45, .84], [1.45, .84]].forEach(([x, z]) => { const g = new THREE.CylinderGeometry(.34, .34, .26, 16); g.rotateX(Math.PI / 2); g.translate(x, .34, z); wh.push(g); });
  const hl = [], tl = []; [-.62, .62].forEach(z => { const a = new THREE.BoxGeometry(.08, .14, .38); a.translate(2.36, .76, z); hl.push(a); const b = new THREE.BoxGeometry(.08, .14, .42); b.translate(-2.36, .8, z); tl.push(b); });
  return { body, glass, wheels: mergeGeometries(wh), head: mergeGeometries(hl), tail: mergeGeometries(tl) };
}
function personGeos() { const body = new THREE.CapsuleGeometry(.22, .92, 4, 10); body.translate(0, .68, 0); const head = new THREE.SphereGeometry(.13, 12, 10); head.translate(0, 1.5, 0); return { body, head }; }

function instanced(geo, mat, list, fn, parent, opt = {}) {
  if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); const m4 = new THREE.Matrix4(), c = new THREE.Color();
  list.forEach((it, i) => { fn(it, m4, i); im.setMatrixAt(i, m4); if (it.c) im.setColorAt(i, c.set(it.c)); });
  im.castShadow = opt.cast !== false; im.receiveShadow = opt.recv !== false; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); parent.add(im); return im;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function compose(m4, x, y, z, ry, sx, sy, sz) { _q.setFromEuler(_e.set(0, ry, 0)); return m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy ?? sx, sz ?? sx)); }

function shade(c, k) { return '#' + new THREE.Color(c).multiplyScalar(k).getHexString(); }
function buildVegetation(reg, parent, aoHide) {
  const T = textures(); const out = {};
  const leafM = new THREE.MeshStandardMaterial({ map: T.leaf, roughness: .9 }); sway(leafM, .008);
  const shrubM = new THREE.MeshStandardMaterial({ map: T.leaf, roughness: .9 });
  const trunkM = new THREE.MeshStandardMaterial({ map: T.trunk, roughness: .95 });
  const barkM = new THREE.MeshStandardMaterial({ color: '#6e5238', roughness: .95 });
  const frondM = new THREE.MeshStandardMaterial({ map: T.frond, alphaTest: .45, side: THREE.DoubleSide, roughness: .8 }); sway(frondM, .035);
  const flowerM = new THREE.MeshStandardMaterial({ roughness: .7 });
  const r = rng(99);
  out.palmTrunk = instanced(new THREE.CylinderGeometry(.2, .32, 1, 10, 4).translate(0, .5, 0), trunkM, reg.palms, (p, m) => compose(m, p.p.x, p.p.y, p.p.z, p.rot || 0, 1, p.h, 1), parent);
  out.palmCrown = instanced(crownGeo(), frondM, reg.palms.map(p => ({ ...p, c: '#ffffff' })), (p, m) => compose(m, p.p.x, p.p.y + p.h - .1, p.p.z, p.rot || r() * 6, p.R, p.R, p.R), parent);
  if (out.palmCrown) aoHide.push(out.palmCrown);
  const cardM = new THREE.MeshStandardMaterial({ map: TX.leafA || (TX.leafA = leafTexA()), alphaTest: .5, side: THREE.DoubleSide, roughness: .85, envMapIntensity: .35 }); sway(cardM, .01);
  const coreM = new THREE.MeshStandardMaterial({ map: T.leaf, roughness: .95, color: '#9aa596' });
  const tg = [cardGeo(5, 110, 1.0, .8, 1.0, .75), cardGeo(9, 95, 1.1, .62, 1.1, .8)], cg = [blobGeo(5, 5, 1.1, .75), blobGeo(9, 5, 1.2, .6)];
  [0, 1].forEach(v => { const L = reg.trees.filter((t, i) => i % 2 === v); instanced(new THREE.CylinderGeometry(.12, .2, 1, 8).translate(0, .5, 0), barkM, L.map(t => ({ ...t, c: null })), (t, m) => compose(m, t.p.x, t.p.y, t.p.z, 0, t.R * .9, t.h * .55, t.R * .9), parent);
    const tf = (t, m) => compose(m, t.p.x, t.p.y + t.h * .55 + t.R * .55, t.p.z, t.rot || 0, t.R, t.R * .9, t.R);
    instanced(cg[v], coreM, L.map(t => ({ ...t, c: shade(t.c, .55) })), (t, m) => { tf(t, m); m.scale(_s.set(.8, .8, .8)); return m; }, parent);
    const im = instanced(tg[v], cardM, L, tf, parent); if (im) aoHide.push(im); });
  instanced(blobGeo(21, 4, 1.0, .8), coreM, reg.shrubs.map(t => ({ ...t, c: shade(t.c, .6) })), (t, m) => compose(m, t.p.x, t.p.y + t.s * .45, t.p.z, t.rot || 0, t.s * .8, t.s * .7, t.s * .8), parent);
  const sim = instanced(cardGeo(21, 46, .75, .55, .75, .5), cardM, reg.shrubs, (t, m) => compose(m, t.p.x, t.p.y + t.s * .5, t.p.z, t.rot || 0, t.s, t.s * .9, t.s), parent); if (sim) aoHide.push(sim);
  instanced(new THREE.IcosahedronGeometry(1, 1), flowerM, reg.flowers, (t, m) => compose(m, t.p.x, t.p.y, t.p.z, 0, t.s || .16), parent, { cast: false });
  return out;
}

// ---------------------------------------------------------------- scene (masterplan)
const wrap3 = document.getElementById('m3d'), c3d = document.getElementById('c3d'), master = document.getElementById('master');
let built = false, R, scene, camera, controls, composer, gtao, bloom, sky, skyEnv, envScene, pmrem, envRT, sun, hemi, capsIM, hitIM, V = [], aoHide = [], labelsEl = [];
const movers = { cars: [], people: [] }, state = { status: false, compare: false, preset: 'day' };
let selBox, selEdges, hovEdges, pin, overlay, fly = null, visible = true, lastInteract = 0; const clock = new THREE.Clock();

function carColor(r) { const P = ['#f2f2f0', '#f2f2f0', '#f2f2f0', '#1c1c1e', '#1c1c1e', '#b9bdc1', '#b9bdc1', '#6b6e72', '#d8cbb3', '#9b1c20', '#27463a', '#c9b48a']; return P[(r() * P.length) | 0]; }
function buildSite() {
  const M = mats(); const reg = newRegistry(); const bag = new Bag(); const Bf = () => bag; const r = rng(2026);
  const G = (x0, y0, x1, y1, m, h = .02, base = 0) => bag.bb(m, X(x0), base, Z(y0), X(x1), base + h, Z(y1));
  const pt = (px, py, y = 0) => new THREE.Vector3(X(px), y, Z(py));
  // ---- ground: desert base, streets, sidewalks, site paving
  bag.bb(M.sand, -700, -.25, -700, 700, -.05, 700);
  G(-70, -60, 1043, 580, M.paverL, .02, -.05);
  G(-70, -48, 1043, -8, M.asphalt, .03); G(-70, 520, 1043, 566, M.asphalt, .03); G(-62, -48, -20, 566, M.asphalt, .031); G(993, -48, 1035, 566, M.asphalt, .031);
  for (let x = -60; x < 1040; x += 26) { G(x, -29, x + 13, -27, M.line, .04); G(x, 542, x + 13, 544, M.line, .04); }
  for (let y = -40; y < 560; y += 26) { G(-42, y, -40, y + 13, M.line, .04); G(1013, y, 1015, y + 13, M.line, .04); }
  [[-8, -3], [566, 572]].forEach(([a, b]) => G(-70, a, 1043, b, M.curb, .14)); [[-20, -16], [989, 993]].forEach(([a, b]) => G(a, -8, b, 520, M.curb, .14));
  for (let i = 0; i < 6; i++) G(436 + i * 8, 522, 441 + i * 8, 564, M.line, .045);
  // top landscape band + north walkway; side strips + east lane
  G(0, 0, 973, 8, M.paverL, .05); G(0, 8, 973, 34, M.mulch, .12); G(0, 32, 973, 34, M.curb, .25);
  G(0, 34, 13, 470, M.mulch, .12); G(938, 34, 962, 470, M.mulch, .12); G(962, 34, 989, 520, M.paverD, .04);
  // buffers: dark lanes + planted beds (as the plan)
  G(12, 148, 962, 163, M.paverD, .05); G(12, 163, 415, 190, M.lawn, .12); G(508, 163, 938, 190, M.lawn, .12); G(12, 190, 962, 195, M.curb, .16);
  G(12, 162, 415, 164, M.curb, .2); G(508, 162, 938, 164, M.curb, .2);
  G(12, 310, 962, 320, M.paverD, .05); G(12, 320, 938, 341, M.lawn, .12); G(12, 319, 938, 321, M.curb, .2);
  // front sidewalk of the south row + parking with the plan's triangular planted islands
  G(12, 466, 938, 473, M.paverL, .1); G(12, 473, 990, 520, M.asphalt, .04);
  for (let k = 0; k <= 10; k++) { const a = 95 + 72.5 * k; if (a > 850) break;
    const isl = new THREE.Shape(); isl.moveTo(X(a - 18), Z(474)); isl.lineTo(X(a + 18), Z(474)); isl.lineTo(X(a), Z(494)); isl.closePath();
    const g = new THREE.ExtrudeGeometry(isl, { depth: .18, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, .22, 0); const mi = new THREE.Mesh(g, M.lawn); mi.receiveShadow = true; scene.add(mi);
    reg.trees.push({ p: pt(a, 480), R: 2.0 + r() * .6, h: 5 + r() * 1.5, c: GREENS[k % 7] }); reg.shrubs.push({ p: pt(a - 8, 476, .22), s: .7, c: BLOOM[k % 8] }, { p: pt(a + 8, 476, .22), s: .7, c: GREENS[(k + 3) % 7] });
    for (let j = 1; j <= 3; j++) { const bx = a + 18 + j * 13; if (bx > 845) break; G(bx - 7.5, 476, bx - 7, 505, M.line, .05); if (r() < .78) reg.cars.push({ x: X(bx - 1), z: Z(492), ry: Math.PI / 2 + (r() - .5) * .06, c: carColor(r) }); } }
  G(855, 470, 925, 520, M.paverL, .06);
  const ramp = new Bag(); ramp.bb(M.dark, X(862), 0, Z(500), X(918), 3.4, Z(503)); ramp.bb(M.dark, X(862), 0, Z(500), X(864), 3.4, Z(518)); ramp.bb(M.dark, X(916), 0, Z(500), X(918), 3.4, Z(518));
  for (let z = 503; z < 518; z += 2) ramp.bb(M.slat, X(864), 3.2, Z(z), X(916), 3.35, Z(z) + .12); ramp.bb(M.asphalt, X(864), -.01, Z(503), X(916), .08, Z(518)); ramp.bb(M.line, X(866), 1.05, Z(515), X(890), 1.12, Z(515.5)); ramp.flush(scene);
  reg.cars.push({ x: X(890), z: Z(488), ry: -Math.PI / 2 + .04, c: '#f2f2f0' });
  // ---- villas
  const cap = [], hit = [];
  ROWS.forEach(row => { const n = row.seg.length; row.seg.forEach(([s0, s1], i) => {
    const num = row.first - i, p = plots.find(q => q.n === num); if (!p) return;
    const xl = i === 0 ? s0 - 4 : (row.seg[i - 1][1] + s0) / 2, xr = i === n - 1 ? s1 + 4 : (s1 + row.seg[i + 1][0]) / 2;
    const w = (xr - xl) * PX, N = FLOORS_N(p.t);
    const T = new THREE.Matrix4().makeRotationY(row.face > 0 ? 0 : Math.PI).setPosition(X((xl + xr) / 2), 0, Z(row.back));
    bag.T = T; const endL = row.face > 0 ? i === 0 : i === n - 1, endR = row.face > 0 ? i === n - 1 : i === 0;
    const res = townhouse(Bf, { w, zw0: row.zw0 * PX, zw1: row.zw1 * PX, zf: row.zf * PX, N, endL, endR, seed: num * 7 }, reg, T);
    const c = res.cap; cap.push(new THREE.Matrix4().multiplyMatrices(T, new THREE.Matrix4().compose(new THREE.Vector3((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(c.x1 - c.x0, c.y1 - c.y0, c.z1 - c.z0))));
    const hb = new THREE.Matrix4().multiplyMatrices(T, new THREE.Matrix4().compose(new THREE.Vector3(0, (res.H + 3.4) / 2, row.zf * PX / 2), new THREE.Quaternion(), new THREE.Vector3(w, res.H + 3.4, row.zf * PX)));
    hit.push(hb); V.push({ n: num, p, H: res.H, m: hb, front: row.face, center: new THREE.Vector3().setFromMatrixPosition(hb) });
  }); });
  bag.T = new THREE.Matrix4();
  // ---- amenity block between 37 and 38 (pool · lounge · clubhouse · court), pavilion in the north buffer
  G(415, 196, 508, 310, M.paverL, .06);
  bag.bb(M.coping, X(418.5), 0, Z(198), X(420), .95, Z(309)); bag.bb(M.coping, X(507), 0, Z(198), X(508.5), .95, Z(309));
  bag.bb(M.tile, X(423), .05, Z(204), X(454), .12, Z(266));
  bag.bb(M.coping, X(420), 0, Z(201), X(456), .45, Z(204)); bag.bb(M.coping, X(420), 0, Z(266), X(456), .45, Z(269)); bag.bb(M.coping, X(420), 0, Z(204), X(423), .45, Z(266)); bag.bb(M.coping, X(454), 0, Z(204), X(456), .45, Z(266));
  const water = new THREE.Mesh(new THREE.PlaneGeometry((454 - 423) * PX, (266 - 204) * PX).rotateX(-Math.PI / 2), M.water); water.position.set(X(438.5), .38, Z(235)); water.receiveShadow = true; scene.add(water); aoHide.push(water);
  bag.bb(M.metal, X(446), .45, Z(205), X(446.4), 1.3, Z(205.4)); bag.bb(M.metal, X(449), .45, Z(205), X(449.4), 1.3, Z(205.4));
  bag.bb(M.stone, X(420), 0, Z(186), X(430), .12, Z(196)); bag.cyl(M.metal, .05, .05, 2.4, X(425), .12, Z(191)); bag.bb(M.metal, X(425), 2.45, Z(190), X(427.5), 2.5, Z(192));
  [[435, 441], [443, 449]].forEach(([a, b2]) => { bag.bb(M.wood, X(a), 0, Z(184), X(b2), .35, Z(200)); bag.bb(M.fabric, X(a) + .1, .35, Z(184) + .1, X(b2) - .1, .5, Z(200) - .1); bag.bb(M.accent, X(a) + .15, .5, Z(185), X(b2) - .15, .72, Z(187)); });
  bag.bb(M.deck, X(452), .05, Z(166), X(497), .25, Z(196));
  [[452.8, 166.8], [496.2, 166.8], [452.8, 195.2], [496.2, 195.2]].forEach(([a, b2]) => bag.bb(M.dark, X(a) - .15, .25, Z(b2) - .15, X(a) + .15, 3.2, Z(b2) + .15));
  bag.bb(M.dark, X(452), 3.2, Z(166), X(497), 3.45, Z(167.5)); bag.bb(M.dark, X(452), 3.2, Z(194.5), X(497), 3.45, Z(196));
  for (let x = 454; x < 496; x += 2.3) bag.bb(M.slat, X(x), 3.45, Z(166), X(x) + .16, 3.62, Z(196));
  bag.bb(M.fabric, X(456), .25, Z(170), X(470), .7, Z(174)); bag.bb(M.fabric, X(456), .25, Z(174), X(459), .7, Z(190)); bag.bb(M.fabric, X(478), .25, Z(186), X(493), .7, Z(190));
  bag.bb(M.accent, X(458), .7, Z(170.4), X(462), 1.0, Z(171.2)); bag.bb(M.accent, X(485), .7, Z(189), X(489), 1.0, Z(189.6)); bag.bb(M.wood, X(468), .25, Z(178), X(480), .62, Z(184));
  bag.bb(M.dark, X(455), .06, Z(205), X(494), .2, Z(237));
  [[457, 207], [488, 207], [457, 231]].forEach(([a, b2]) => { bag.bb(M.stone, X(a), .2, Z(b2), X(a + 5), .8, Z(b2 + 5)); reg.shrubs.push({ p: pt(a + 2.5, b2 + 2.5, .8), s: .75, c: GREENS[(a + b2) % 7] }); });
  bag.cyl(M.stone, .9, .9, .5, X(476), .2, Z(219), 24);
  const tor1 = new THREE.Mesh(new THREE.TorusGeometry(1.15, .16, 16, 48), M.sculpt1); tor1.position.set(X(476), 1.9, Z(219)); tor1.rotation.y = .6; tor1.castShadow = true; scene.add(tor1);
  const tor2 = new THREE.Mesh(new THREE.TorusGeometry(.95, .14, 16, 48), M.sculpt2); tor2.position.set(X(476), 1.8, Z(219)); tor2.rotation.set(.9, -.5, 0); tor2.castShadow = true; scene.add(tor2); movers.sculpt = [tor1, tor2];
  [[462, 214], [462, 226], [469, 233], [478, 233], [485, 233]].forEach(([a, b2]) => { bag.cyl(M.dark, .08, .08, .7, X(a), .2, Z(b2)); bag.bb(M.lamp, X(a) - .09, .88, Z(b2) - .09, X(a) + .09, 1.0, Z(b2) + .09); reg.glowS.push(pt(a, b2, .95)); }); reg.pools.push({ p: pt(476, 219, .22), s: 7 }, { p: pt(475, 181, .27), s: 9 });
  bag.bb(M.wood, X(463), .2, Z(229), X(473), .62, Z(231.5)); bag.bb(M.wood, X(478), .2, Z(229), X(490), .62, Z(231.5));
  bag.bb(M.rubber, X(452), .06, Z(238), X(507), .2, Z(271)); const ch = 4.4;
  bag.bb(M.glass, X(452.5), .2, Z(238.5), X(506.5), ch, Z(239.2)); bag.bb(M.glass, X(452.5), .2, Z(238.5), X(453.2), ch, Z(270.5));
  bag.bb(M.stucco, X(506), .2, Z(238), X(507), ch, Z(271)); bag.bb(M.stucco, X(452), .2, Z(270), X(507), ch, Z(271));
  for (let x = 452; x <= 507; x += 9) bag.bb(M.dark, X(x), .2, Z(238), X(x) + .14, ch, Z(238) + .14);
  for (let z = 238; z <= 271; z += 8) bag.bb(M.dark, X(452), .2, Z(z), X(452) + .14, ch, Z(z) + .14);
  bag.bb(M.white, X(451.5), ch, Z(237.5), X(507.5), ch + .45, Z(271.5)); bag.bb(M.tan, X(451.5), ch + .45, Z(237.5), X(507.5), ch + .6, Z(238.5)); bag.bb(M.tan, X(451.5), ch + .45, Z(270.5), X(507.5), ch + .6, Z(271.5));
  for (let i = 0; i < 5; i++) { bag.bb(M.dark, X(458 + i * 9), .2, Z(245), X(458 + i * 9) + .8, 1.3, Z(245) + 1.9); bag.bb(M.rubber, X(458 + i * 9) - .1, .2, Z(260), X(458 + i * 9) + 1.3, .9, Z(260) + .7); }
  bag.bb(M.dark, X(500), .2, Z(242), X(505), 2.2, Z(243));
  // court — clay surface, lines, net, black-framed glass & mesh enclosure, light poles
  bag.bb(M.clay, X(424), .06, Z(271), X(502), .16, Z(307));
  const L = (a, b2, c2, d) => bag.bb(M.line, X(a), .16, Z(b2), X(c2), .18, Z(d));
  L(425, 272, 501, 272.6); L(425, 305.4, 501, 306); L(425, 272, 425.6, 306); L(500.4, 272, 501, 306); L(440, 272, 440.5, 306); L(486, 272, 486.5, 306); L(440, 288.7, 486.5, 289.3);
  bag.bb(M.mesh, X(463), .16, Z(271.5), X(463.3), 1.0, Z(306.5)); bag.bb(M.white, X(462.9), .95, Z(271.5), X(463.4), 1.05, Z(306.5)); bag.cyl(M.dark, .05, .05, 1.07, X(463.1), .16, Z(271.3)); bag.cyl(M.dark, .05, .05, 1.07, X(463.1), .16, Z(306.7));
  bag.bb(M.glass, X(424), .16, Z(271), X(502), 3.0, Z(271.3)); bag.bb(M.glass, X(424), .16, Z(306.7), X(502), 3.0, Z(307));
  bag.bb(M.glass, X(424), .16, Z(271), X(424.3), 4.0, Z(307)); bag.bb(M.glass, X(501.7), .16, Z(271), X(502), 4.0, Z(307));
  bag.bb(M.mesh, X(424), 3.0, Z(271), X(502), 4.0, Z(271.3)); bag.bb(M.mesh, X(424), 3.0, Z(306.7), X(502), 4.0, Z(307));
  for (let x = 424; x <= 502; x += 11.1) { bag.bb(M.dark, X(x) - .06, .16, Z(271) - .06, X(x) + .06, 4.0, Z(271) + .06); bag.bb(M.dark, X(x) - .06, .16, Z(307) - .06, X(x) + .06, 4.0, Z(307) + .06); }
  bag.bb(M.dark, X(424) - .06, .16, Z(289), X(424) + .06, 4.0, Z(289) + .12); bag.bb(M.dark, X(502) - .06, .16, Z(289), X(502) + .06, 4.0, Z(289) + .12);
  [[426, 273], [500, 273], [426, 305], [500, 305]].forEach(([a, b2]) => { bag.cyl(M.dark, .07, .09, 6.5, X(a), .16, Z(b2)); bag.bb(M.lamp, X(a) - .35, 6.5, Z(b2) - .2, X(a) + .35, 6.7, Z(b2) + .2); reg.glowL.push(pt(a, b2, 6.5)); }); reg.pools.push({ p: pt(463, 289, .2), s: 16 });
  // lane bollards & benches, street lamps
  for (let x = 40; x < 940; x += 46) { [155, 315].forEach(y => { if (x > 412 && x < 510 && y === 155) return; bag.cyl(M.dark, .08, .08, .75, X(x), 0, Z(y)); bag.bb(M.lamp, X(x) - .08, .75, Z(y) - .08, X(x) + .08, .86, Z(y) + .08); reg.glowS.push(pt(x, y, .85)); reg.pools.push({ p: pt(x, y, .07), s: 3.5 }); }); }
  for (let x = 70; x < 940; x += 185) { [164.5, 321].forEach(y => { bag.bb(M.wood, X(x), .45, Z(y) + .1, X(x + 10), .55, Z(y) + .6); bag.bb(M.dark, X(x) + .2, 0, Z(y) + .2, X(x) + .35, .45, Z(y) + .5); bag.bb(M.dark, X(x + 10) - .35, 0, Z(y) + .2, X(x + 10) - .2, .45, Z(y) + .5); }); }
  const lampAt = (px, py, ry) => { bag.cyl(M.dark, .09, .12, 7.5, X(px), 0, Z(py)); const d = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)); bag.bb(M.dark, X(px) + Math.min(0, d.x * 1.5) - .06, 7.4, Z(py) + Math.min(0, d.z * 1.5) - .06, X(px) + Math.max(0, d.x * 1.5) + .06, 7.52, Z(py) + Math.max(0, d.z * 1.5) + .06); bag.bb(M.lamp, X(px) + d.x * 1.2 - .25, 7.28, Z(py) + d.z * 1.2 - .25, X(px) + d.x * 1.2 + .25, 7.38, Z(py) + d.z * 1.2 + .25); reg.glowL.push(new THREE.Vector3(X(px) + d.x * 1.2, 7.2, Z(py) + d.z * 1.2)); reg.pools.push({ p: new THREE.Vector3(X(px) + d.x * 1.8, .09, Z(py) + d.z * 1.8), s: 10 }); };
  for (let x = 20; x < 973; x += 70) { lampAt(x, -5, Math.PI); lampAt(x + 35, 569, 0); }
  for (let y = 40; y < 520; y += 70) { lampAt(-18, y, -Math.PI / 2); lampAt(991, y + 35, Math.PI / 2); }
  // ---- context: neighbouring plots (quiet massing, windows glow at night)
  const ctx = new Bag(); const cr = rng(5);
  const block = (x0, z0, x1, z1) => { const h = 6.8 + (cr() < .5 ? 3.4 : 0) + cr() * .6; ctx.bb(cr() < .5 ? M.context : M.context2, x0, 0, z0, x1, h, z1); ctx.bb(M.white, x0 - .2, h, z0 - .2, x1 + .2, h + .35, z1 + .2);
    for (let f = 0; f < Math.round(h / 3.4); f++) for (let t = 0; t < 4; t++) { if (cr() < .35) continue; const xx = x0 + (x1 - x0) * (t + .5) / 4, zz = z0 + (z1 - z0) * (t + .5) / 4; ctx.bb(M.ctxWin, xx - .7, f * 3.4 + 1, z0 - .05, xx + .7, f * 3.4 + 2.6, z1 + .05); ctx.bb(M.ctxWin, x0 - .05, f * 3.4 + 1, zz - .7, x1 + .05, f * 3.4 + 2.6, zz + .7); } };
  for (let x = -150; x < 1150; x += 72) { block(X(x), Z(-170), X(x + 60), Z(-110)); if (cr() < .7) reg.trees.push({ p: pt(x + 30, 579), R: 1.9, h: 4.6, c: GREENS[(cr() * 7) | 0] }); if (cr() < .7) reg.trees.push({ p: pt(x + 30, -60), R: 1.9, h: 4.6, c: GREENS[(cr() * 7) | 0] }); }
  for (let y = -100; y < 640; y += 72) { block(X(-200), Z(y), X(-135), Z(y + 60)); block(X(1110), Z(y), X(1175), Z(y + 60)); }
  G(-70, 590, 1043, 632, M.lawn, .05); G(-70, -100, 1043, -64, M.lawn, .05); for (let x = -60; x < 1040; x += 22) { reg.trees.push({ p: pt(x, 611), R: 2.1 + r() * .5, h: 4.8, c: GREENS[(r() * 7) | 0] }); reg.trees.push({ p: pt(x + 11, -82), R: 2.1 + r() * .5, h: 4.8, c: GREENS[(r() * 7) | 0] }); }
  ctx.flush(scene, 'ctx');
  // ---- planting (read from the plan) + edge vegetation detected from the plan image
  const palm = (px, py, d) => reg.palms.push({ p: pt(px, py), h: 5.8 + r() * 2.4, R: Math.max(3.2, d * PX * .38), rot: r() * 6 });
  const tree = (px, py, d, c) => reg.trees.push({ p: pt(px, py), h: 4.2 + r() * 1.6, R: Math.max(1.4, d * PX * .33), rot: r() * 6, c: c || GREENS[(r() * 7) | 0] });
  const shrub = (px, py, c, s = 1, y = .12) => reg.shrubs.push({ p: pt(px, py, y), s: (.7 + r() * .4) * s, c, rot: r() * 6 });
  const fl = (px, py, c, n = 8, spread = 1.4, y = .14) => { for (let i = 0; i < n; i++) reg.flowers.push({ p: pt(px, py, y).add(new THREE.Vector3((r() - .5) * spread * 2, .15 + r() * .15, (r() - .5) * spread)), c, s: .12 + r() * .08 }); };
  [50, 240, 395, 537, 745, 910].forEach((x, i) => palm(x, 176, [80, 70, 60, 65, 65, 65][i]));
  [[325, 75], [665, 80]].forEach(([x, d]) => tree(x, 176, d, '#4f9a37'));
  const FLC = { p: '#e8508f', r: '#e0412f', w: '#f7f3ea', y: '#f4c430' };
  [[95, 'g'], [120, '#9b2f45'], [160, 'g'], [185, '#7a8a3a'], [205, 'p'], [280, 'g'], [572, 'p'], [590, '#9b2f45'], [615, 'g'], [710, '#7a8a3a'], [790, '#9b2f45'], [820, 'g'], [835, 'w'], [860, 'g'], [875, 'p'], [440, 'g'], [15, 'g']].forEach(([x, c]) => {
    if (FLC[c]) { shrub(x, 176, GREENS[(r() * 7) | 0], .8); fl(x, 176, FLC[c], 14, 1.6, .5); } else shrub(x, 176, c === 'g' ? GREENS[(r() * 7) | 0] : c, 1.1); });
  [30, 360, 590].forEach((x, i) => palm(x, 330, [70, 65, 65][i]));
  [[160, 70], [240, 60], [306, 45], [450, 50], [735, 55], [815, 50], [900, 70]].forEach(([x, d]) => tree(x, 330, d));
  [[80, 'g'], [100, 'g'], [205, 'g'], [275, '#9b2f45'], [410, '#9b2f45'], [490, 'r'], [510, 'w'], [535, 'g'], [635, 'w'], [660, 'g'], [680, 'g'], [700, 'g'], [770, 'g'], [790, 'g'], [850, 'g'], [560, 'p'], [125, 'p'], [382, 'y']].forEach(([x, c]) => {
    if (FLC[c]) { shrub(x, 330, GREENS[(r() * 7) | 0], .8); fl(x, 330, FLC[c], 14, 1.6, .5); } else shrub(x, 330, c === 'g' ? GREENS[(r() * 7) | 0] : c, 1.1); });
  for (let x = 20; x < 935; x += 6) { if (x > 412 && x < 510) continue; if (r() < .55) fl(x, 186.5, BLOOM[(r() * 8) | 0], 3, .5, .12); if (r() < .55) fl(x, 338, BLOOM[(r() * 8) | 0], 3, .5, .12); }
  const LAND = window.N7LAND || { E: [], F: [] };
  LAND.E.forEach(([x, y, rad, k, c]) => { if (y > 468 && y < 520) return; if (k === 'p') palm(x, y, rad * 2); else if (k === 't') tree(x, y, rad * 2, c); else shrub(x, y, c, 1); });
  LAND.F.forEach(([x, y, c]) => { if (y > 468 && y < 520) return; fl(x, y, c, 6, 1.0, .12); });
  for (let x = 4; x < 970; x += 4.5) { const c = r() < .35 ? BLOOM[(r() * 8) | 0] : GREENS[(r() * 7) | 0]; shrub(x, 21 + (r() - .5) * 18, c, 1.25); if (r() < .6) fl(x, 21 + (r() - .5) * 16, BLOOM[(r() * 8) | 0], 5, .8, .5); }
  for (let x = 30; x < 960; x += 48) tree(x + (r() - .5) * 10, 16 + r() * 8, 34 + r() * 20);
  for (let y = 40; y < 466; y += 5) { shrub(6.5, y, r() < .3 ? BLOOM[(r() * 8) | 0] : GREENS[(r() * 7) | 0], 1.0); shrub(950, y, r() < .3 ? BLOOM[(r() * 8) | 0] : GREENS[(r() * 7) | 0], 1.2); }
  for (let y = 60; y < 460; y += 55) tree(952, y + r() * 10, 40 + r() * 20);
  // ---- people (thobes, abayas, casual) walking the lanes; two players on the court
  const skin = ['#c89a74', '#b98760', '#d9ae88', '#a87552'];
  const outfits = ['#f4f2ec', '#f4f2ec', '#f4f2ec', '#1c1c1e', '#1c1c1e', '#c8643a', '#2f7d6d', '#e8b64a'];
  const walk = (y, x0, x1) => movers.people.push({ path: [[X(x0), Z(y)], [X(x1), Z(y)]], t: r(), sp: (1.1 + r() * .5) / Math.abs((x1 - x0) * PX), c: outfits[(r() * 8) | 0], hc: r() < .4 ? '#c8323a' : r() < .6 ? '#f4f2ec' : skin[(r() * 4) | 0] });
  for (let i = 0; i < 9; i++) walk(153 + r() * 7, 20 + r() * 300, 600 + r() * 330); for (let i = 0; i < 9; i++) walk(312 + r() * 6, 20 + r() * 300, 600 + r() * 330); for (let i = 0; i < 6; i++) walk(469, 20 + r() * 300, 560 + r() * 360); for (let i = 0; i < 5; i++) walk(4, 10 + r() * 400, 560 + r() * 400);
  movers.players = [{ x: 432, y: 289, amp: 12, c: '#f4f2ec' }, { x: 494, y: 289, amp: 12, c: '#c8643a' }];
  movers.people.push({ static: true, x: X(472), z: Z(180), c: '#f4f2ec', hc: '#c8323a' }, { static: true, x: X(474), z: Z(181.5), c: '#1c1c1e', hc: '#1c1c1e' });
  // moving cars around the block
  const loopP = [[X(-41), Z(-28)], [X(1014), Z(-28)], [X(1014), Z(543)], [X(-41), Z(543)]]; const per = loopP.reduce((a, p, i) => a + Math.hypot(p[0] - loopP[(i + 1) % 4][0], p[1] - loopP[(i + 1) % 4][1]), 0);
  for (let i = 0; i < 6; i++) movers.cars.push({ loop: loopP, per, t: i / 6 + r() * .05, sp: 9 / per, c: carColor(r) });
  return { bag, reg, cap, hit };
}

function build() {
  built = true;
  R = new THREE.WebGLRenderer({ canvas: c3d, antialias: !HIGH, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(HIGH ? 2 : 1.5, devicePixelRatio || 1)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, 1.7, .5, 6000);
  sky = makeSky(3000); scene.add(sky); aoHide.push(sky);
  envScene = new THREE.Scene(); skyEnv = makeSky(20); envScene.add(skyEnv); const eg0 = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b9a88c' })); eg0.position.y = -2; envScene.add(eg0); envScene.userData.ground = eg0; pmrem = new THREE.PMREMGenerator(R);
  sun = new THREE.DirectionalLight('#fff1dc', 3); sun.castShadow = true; const sm = HIGH ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 800 }); sun.shadow.bias = -.00035; sun.shadow.normalBias = .035; sun.shadow.camera.updateProjectionMatrix(); scene.add(sun); scene.add(sun.target);
  hemi = new THREE.HemisphereLight('#dfeeff', '#b49b7a', 1.0); scene.add(hemi);
  const { bag, reg, cap, hit } = buildSite();
  bag.flush(scene, 'site');
  scene.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.aoHide && !aoHide.includes(o)) aoHide.push(o); });
  capsIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .7 }), cap.length); cap.forEach((m, i) => { capsIM.setMatrixAt(i, m); capsIM.setColorAt(i, new THREE.Color('#f6f3ee')); });
  capsIM.castShadow = capsIM.receiveShadow = true; scene.add(capsIM);
  hitIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }), hit.length); hit.forEach((m, i) => hitIM.setMatrixAt(i, m)); hitIM.computeBoundingSphere(); scene.add(hitIM);
  buildVegetation(reg, scene, aoHide);
  amHits = amenLbl.map((L, i) => { const [x0, y0, x1, y1, h] = L.b; const o = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(X(x1) - X(x0)), h, Math.abs(Z(y1) - Z(y0))), new THREE.MeshBasicMaterial({ visible: false })); o.position.set((X(x0) + X(x1)) / 2, h / 2, (Z(y0) + Z(y1)) / 2); o.userData.am = i; scene.add(o); return o; });
  const glowTex = ctex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,236,196,1)'); g.addColorStop(.22, 'rgba(255,206,130,.6)'); g.addColorStop(1, 'rgba(255,170,80,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
  const gp = (list, size) => { const m = new THREE.PointsMaterial({ map: glowTex, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }); const o = new THREE.Points(new THREE.BufferGeometry().setFromPoints(list), m); scene.add(o); aoHide.push(o); return m; };
  const poolM = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  const poolIM = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolM, reg.pools, (t, m) => compose(m, t.p.x, t.p.y, t.p.z, 0, t.s, 1, t.s), scene, { cast: false, recv: false }); aoHide.push(poolIM);
  movers.glow = [gp(reg.glowS, 1.3), gp(reg.glowL, 4.5), poolM];
  const cg = carGeos(); const bodyM = new THREE.MeshPhysicalMaterial({ roughness: .28, metalness: .55, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.3 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#141a1f', roughness: .05, metalness: .6, envMapIntensity: 1.5 }); const tyreM = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: .8 });
  const headM = new THREE.MeshStandardMaterial({ color: '#f5f5f0', emissive: '#fff6de', emissiveIntensity: .2 }), tailM = new THREE.MeshStandardMaterial({ color: '#7a0f12', emissive: '#ff2a2a', emissiveIntensity: .1 }); movers.lightMats = [headM, tailM];
  const allCars = [...reg.cars.map(c => ({ ...c, fixed: true })), ...movers.cars]; movers.allCars = allCars;
  const carFn = (c, m) => compose(m, c.x || 0, 0, c.z || 0, c.ry || 0, 1);
  movers.carIM = ['body', 'glass', 'wheels', 'head', 'tail'].map((k, i) => instanced(cg[k], [bodyM, glassM, tyreM, headM, tailM][i], allCars.map(c => ({ ...c, c: k === 'body' ? c.c : null })), carFn, scene, { cast: k === 'body' }));
  const pg = personGeos(); const pBodyM = new THREE.MeshStandardMaterial({ roughness: .85 }), pHeadM = new THREE.MeshStandardMaterial({ roughness: .8 });
  const ppl = [...movers.people, ...movers.players.map(p => ({ player: p, c: p.c, hc: '#c89a74' }))]; movers.allPeople = ppl;
  movers.pBody = instanced(pg.body, pBodyM, ppl.map(p => ({ c: p.c })), (p, m) => compose(m, 0, -50, 0, 0, 1), scene); movers.pHead = instanced(pg.head, pHeadM, ppl.map(p => ({ c: p.hc })), (p, m) => compose(m, 0, -50, 0, 0, 1), scene);
  movers.pBody.frustumCulled = movers.pHead.frustumCulled = false; movers.carIM.forEach(im => im && (im.frustumCulled = false));
  // selection visuals
  const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  selBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffb52e', transparent: true, opacity: .16, depthWrite: false })); selBox.matrixAutoUpdate = false; selBox.visible = false; scene.add(selBox);
  selEdges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: '#ffb52e' })); selEdges.matrixAutoUpdate = false; selEdges.visible = false; scene.add(selEdges);
  hovEdges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9 })); hovEdges.matrixAutoUpdate = false; hovEdges.visible = false; scene.add(hovEdges);
  pin = new THREE.Group(); const pm = new THREE.MeshStandardMaterial({ color: '#ffb52e', emissive: '#ff9d00', emissiveIntensity: .6, metalness: .3, roughness: .3 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.7, 1.8, 24), pm); cone.rotation.x = Math.PI; cone.position.y = .9; pin.add(cone); const ball = new THREE.Mesh(new THREE.SphereGeometry(.75, 24, 16), pm); ball.position.y = 2.1; pin.add(ball); pin.visible = false; scene.add(pin);
  [selBox, selEdges, hovEdges, pin].forEach(o => aoHide.push(o));
  movers.nums = V.map(v => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(v.n), transparent: true, depthWrite: false, sizeAttenuation: false })); s.scale.set(.042, .042, 1); s.position.copy(v.center).setY(v.H + 5.3); s.renderOrder = 5; scene.add(s); aoHide.push(s); return s; });
  new THREE.TextureLoader().load('img/master.webp', t => { t.colorSpace = THREE.SRGBColorSpace; overlay = new THREE.Mesh(new THREE.PlaneGeometry(973 * PX, 516 * PX).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: .55, depthTest: false, depthWrite: false, toneMapped: false }));
    overlay.position.set(X(486.5), .4, Z(258)); overlay.renderOrder = 10; overlay.visible = state.compare; scene.add(overlay); aoHide.push(overlay); });
  controls = new OrbitControls(camera, c3d); controls.enableDamping = true; controls.dampingFactor = .07; controls.maxPolarAngle = 1.47; controls.minDistance = 8; controls.maxDistance = 480; controls.zoomSpeed = .9;
  controls.addEventListener('start', () => { fly = null; lastInteract = performance.now(); controls.autoRotate = false; });
  controls.addEventListener('change', () => { const t = controls.target; t.x = THREE.MathUtils.clamp(t.x, -140, 140); t.z = THREE.MathUtils.clamp(t.z, -110, 110); t.y = THREE.MathUtils.clamp(t.y, 0, 30); });
  controls.autoRotate = !QS.get('still'); controls.autoRotateSpeed = .35;
  if (HIGH || QS.get('post')) {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }); composer = new EffectComposer(R, rt);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 4, 4); gtao.blendIntensity = .9; gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    const or = gtao.render.bind(gtao); gtao.render = (...a) => { const v = aoHide.map(o => o.visible); aoHide.forEach(o => o.visible = false); or(...a); aoHide.forEach((o, i) => o.visible = v[i]); };
    composer.addPass(gtao);
    bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), .12, .55, .92); composer.addPass(bloom); composer.addPass(new OutputPass());
  }
  resize(); setView('overall', true); applyPreset(QS.get('t') || 'day');
  const ray = new THREE.Raycaster(), mv = new THREE.Vector2(); let down = null;
  const aim = e => { const rc = c3d.getBoundingClientRect(); mv.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(mv, camera); };
  const cast = e => { aim(e); const h = ray.intersectObject(hitIM, false)[0]; return h ? V[h.instanceId] : null; };
  const castAm = e => { aim(e); const hv = ray.intersectObject(hitIM, false)[0], ha = ray.intersectObjects(amHits, false)[0]; return ha && (!hv || ha.distance < hv.distance) ? ha.object.userData.am : -1; };
  c3d.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  c3d.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; const a = castAm(e); if (a >= 0) { amHover = a; clearTimeout(amTimer); if (e.pointerType === 'touch') amTimer = setTimeout(() => amHover = -1, 3500); return; } const v = cast(e); if (v) { N7.select(v.n); paint(); flyTo(v); window.va && window.va('event', { name: 'n7_villa_3d', data: { villa: v.n } }); } });
  const tip = document.getElementById('tip3d'); let lastM = 0;
  c3d.addEventListener('pointermove', e => { if (e.pointerType === 'touch' || performance.now() - lastM < 45) return; lastM = performance.now(); const a = castAm(e); amHover = a; if (a >= 0) { hovEdges.visible = false; c3d.style.cursor = 'help'; tip.classList.remove('on'); return; } const v = cast(e);
    if (v) { hovEdges.matrix.copy(v.m); hovEdges.visible = true; c3d.style.cursor = 'pointer'; const T = TYPES[v.p.t]; tip.innerHTML = `<b>فيلا ${v.n}</b> — ${T.name} · <span class="st ${v.p.st}">${v.p.st === 'ok' ? 'متاحة' : v.p.st === 'hold' ? 'محجوزة' : 'مباعة'}</span>`; const rc = wrap3.getBoundingClientRect(); tip.style.transform = `translate(${e.clientX - rc.left + 14}px,${e.clientY - rc.top + 14}px)`; tip.classList.add('on'); }
    else { hovEdges.visible = false; c3d.style.cursor = 'grab'; tip.classList.remove('on'); } });
  c3d.addEventListener('pointerleave', () => { hovEdges.visible = false; tip.classList.remove('on'); amHover = -1; });
  new ResizeObserver(resize).observe(wrap3);
  setInterval(() => { const r = wrap3.getBoundingClientRect(); visible = !document.hidden && r.bottom > 0 && r.top < innerHeight && r.width > 0; }, 400);
  document.getElementById('tb3d').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a, v = b.dataset.v;
    if (a === 'view') setView(v); if (a === 'time') applyPreset(v); if (a === 'status') { state.status = !state.status; paint(); } if (a === 'compare') setCompare(!state.compare);
    if (a === 'fs') { if (document.fullscreenElement) document.exitFullscreen(); else wrap3.requestFullscreen && wrap3.requestFullscreen(); }
    syncToolbar(); });
  syncToolbar(); paint(); document.getElementById('load3d').classList.add('done'); requestAnimationFrame(loop);
}
function numTex(n) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.arc(64, 64, 54, 0, 6.3); x.fill(); x.lineWidth = 7; x.strokeStyle = '#10322d'; x.stroke(); x.fillStyle = '#10322d'; x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function resize() { if (!R) return; const w = wrap3.clientWidth, h = wrap3.clientHeight; if (!w || !h) return; R.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (composer) { composer.setPixelRatio(R.getPixelRatio()); composer.setSize(w, h); } }

// ---------------------------------------------------------------- presets (day / sunset / night)
const PRE = {
  day: { elev: 48, az: 32, sunC: '#fff0d6', sunI: 3.4, sunS: 1, hemiS: '#dcecff', hemiG: '#b39a76', hemiI: .62, exp: 1.0, skyT: '#3f86cf', skyH: '#d4e6f0', skyG: '#cdbf9f', win: 0, lamp: .15, water: 0, bloom: [.08, .5, .96], env: .75, fog: '#d4e3ec' },
  sunset: { elev: 8, az: -62, sunC: '#ffab63', sunI: 3.0, sunS: 1.4, hemiS: '#ffd3ad', hemiG: '#80614a', hemiI: .5, exp: 1.02, skyT: '#43577f', skyH: '#ffbf86', skyG: '#9c7a5c', win: .8, lamp: 1.4, water: .12, bloom: [.3, .55, .86], env: .7, fog: '#f0c49a' },
  night: { elev: -4, az: -80, sunC: '#a9b8ff', sunI: .45, sunS: 0, hemiS: '#3f5285', hemiG: '#2a221c', hemiI: .5, exp: 1.18, skyT: '#060c1a', skyH: '#1d2946', skyG: '#141312', win: 1.5, lamp: 3.2, water: .8, bloom: [.55, .5, .72], env: .3, fog: '#0f1628' }
};
function applyPreset(k) {
  if (!PRE[k]) k = 'day'; state.preset = k; const p = PRE[k]; const M = mats(); const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - p.elev), THREE.MathUtils.degToRad(p.az));
  [sky, skyEnv].forEach(s => setSky(s, p, dir)); envScene.userData.ground.material.color.set(p.skyG);
  const lightDir = k === 'night' ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(120)) : dir.clone();
  if (lightDir.y < .08) lightDir.y = .08; sun.position.copy(lightDir).normalize().multiplyScalar(300); sun.target.position.set(0, 0, 0); sun.color.set(p.sunC); sun.intensity = p.sunI;
  hemi.color.set(p.hemiS); hemi.groundColor.set(p.hemiG); hemi.intensity = p.hemiI; R.toneMappingExposure = p.exp;
  if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture; scene.environmentIntensity = p.env;
  scene.fog = new THREE.Fog(p.fog, state.compare ? 1e5 : 300, state.compare ? 1e5 : 1400);
  M.winLit.emissiveIntensity = p.win; M.winDark.emissiveIntensity = p.win * .12; M.lamp.emissiveIntensity = p.lamp; M.ctxWin.emissiveIntensity = p.win * .22; MT.water.emissiveIntensity = p.water;
  if (movers.lightMats) { movers.lightMats[0].emissiveIntensity = k === 'day' ? .2 : 2; movers.lightMats[1].emissiveIntensity = k === 'day' ? .1 : 1.5; }
  if (movers.glow) { const g = k === 'day' ? 0 : k === 'sunset' ? .45 : 1; movers.glow[0].opacity = g; movers.glow[1].opacity = g * .9; movers.glow[2].opacity = g * .4; }
  if (bloom) { bloom.strength = p.bloom[0]; bloom.radius = p.bloom[1]; bloom.threshold = p.bloom[2]; }
  wrap3.dataset.preset = k;
}
// ---------------------------------------------------------------- views & fly
function setView(v, instant) {
  const a = camera.aspect || 1.7; let pos, tgt;
  if (v === 'overall') { tgt = new THREE.Vector3(2, 2, 4); pos = new THREE.Vector3(88, 72, 132); }
  if (v !== 'top' && state.compare && v) { state.compare = false; if (overlay) overlay.visible = false; camera.fov = 38; camera.updateProjectionMatrix(); scene.fog.near = 300; scene.fog.far = 1400; controls.maxDistance = 480; }
  if (v === 'top') { const vfov = THREE.MathUtils.degToRad(camera.fov); const need = Math.max(172 / a, 92) * 1.06; const h = need / 2 / Math.tan(vfov / 2); tgt = new THREE.Vector3(X(486.5), 0, Z(258)); pos = new THREE.Vector3(X(486.5), h, Z(258) + .01); }
  if (v === 'amenity') { tgt = new THREE.Vector3(X(463), 1, Z(248)); pos = tgt.clone().add(new THREE.Vector3(-16, 46, 24)); }
  if (v === 'street') { tgt = new THREE.Vector3(X(300), 6, Z(430)); pos = new THREE.Vector3(X(560), 2.2, Z(548)); }
  if (!pos) return; controls.autoRotate = false; go(pos, tgt, instant);
}
function flyTo(v) { const d = new THREE.Vector3(0, 0, v.front).multiplyScalar(26); const tgt = v.center.clone().setY(v.H * .5 + 1); const pos = tgt.clone().add(d).add(new THREE.Vector3(14, 16 + v.H * .6, 0)); go(pos, tgt); }
function go(pos, tgt, instant) { if (instant) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); return; } fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, s: performance.now(), d: 1300 }; }
function setCompare(on) { state.compare = on; if (overlay) overlay.visible = on; camera.fov = on ? 7 : 38; camera.updateProjectionMatrix(); if (scene.fog) scene.fog.far = on ? 1e5 : 1400; if (scene.fog) scene.fog.near = on ? 1e5 : 300; controls.maxDistance = on ? 3000 : 480; if (on) setView('top', true); else setView('overall'); }
function syncToolbar() { const tb = document.getElementById('tb3d'); tb.querySelectorAll('[data-a="time"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === state.preset)); tb.querySelector('[data-a="status"]').setAttribute('aria-pressed', state.status); tb.querySelector('[data-a="compare"]').setAttribute('aria-pressed', state.compare); document.getElementById('lg3d').classList.toggle('on', state.status); }

// ---------------------------------------------------------------- paint (status / filter / selection)
const COL = { cap: new THREE.Color('#f6f3ee'), ok: new THREE.Color('#2fbf71'), hold: new THREE.Color('#f5a524'), sold: new THREE.Color('#9a9a96'), sel: new THREE.Color('#ffb52e'), A: new THREE.Color('#e7a33e'), B: new THREE.Color('#2fb37e'), C: new THREE.Color('#ef6c47'), D: new THREE.Color('#9b6ce0') };
function paint() {
  if (!built) return; const sel = N7.sel, filt = N7.filt;
  V.forEach((v, i) => { let c = COL.cap; if (state.status) c = COL[v.p.st] || COL.ok; if (filt !== 'all' && v.p.t === filt) c = COL[v.p.t]; if (sel === v.n) c = COL.sel; capsIM.setColorAt(i, c); });
  capsIM.instanceColor.needsUpdate = true; const v = V.find(x => x.n === sel);
  [selBox, selEdges].forEach(o => { o.visible = !!v; if (v) o.matrix.copy(v.m); }); pin.visible = !!v; if (v) { pin.position.copy(v.center).setY(v.H + 7); pin.userData.y = v.H + 7; }
}
document.getElementById('plots').addEventListener('click', () => { if (!built) return; paint(); const v = V.find(x => x.n === N7.sel); if (v && wrap3.classList.contains('on')) flyTo(v); });
document.addEventListener('n7filter', () => paint());

// ---------------------------------------------------------------- loop
const m4 = new THREE.Matrix4(); const amenLbl = [{ t: 'المسبح', p: [438, 235, 2], b: [420, 201, 456, 269, 1.2] }, { t: 'النادي الرياضي', p: [480, 254, 6], b: [452, 238, 507, 271, 5] }, { t: 'ملعب التنس / البادل', p: [463, 289, 5], b: [424, 271, 502, 307, 4.2] }, { t: 'الجلسة الخارجية', p: [475, 181, 5], b: [452, 166, 497, 196, 3.8] }, { t: 'جلسة المجسّم الفني', p: [475, 221, 4], b: [455, 205, 494, 237, 3] }, { t: 'مدخل المواقف السفلية', p: [890, 510, 5], b: [862, 500, 918, 518, 3.6] }]; let amHover = -1, amHits = [], amTimer = 0;
function loop(now) {
  requestAnimationFrame(loop); if (!wrap3.classList.contains('on') || !visible) return;
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime; windU.value = t;
  if (fly) { const k = Math.min(1, (now - fly.s) / fly.d), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (k >= 1) fly = null; }
  if (!controls.autoRotate && !fly && !QS.get('still') && lastInteract && performance.now() - lastInteract > 25000) controls.autoRotate = true;
  controls.update(dt); sky.position.copy(camera.position);
  MT.water.normalMap.offset.set(t * .018, t * .011);
  if (movers.sculpt) { movers.sculpt[0].rotation.y = t * .3; movers.sculpt[1].rotation.z = t * .22; }
  if (pin.visible) { pin.position.y = pin.userData.y + Math.sin(t * 2.4) * .35; pin.rotation.y = t; }
  movers.allCars.forEach((c, i) => { if (c.fixed) return; c.t = (c.t + c.sp * dt) % 1; let d = c.t * c.per, j = 0, seg; const L = c.loop; for (let g = 0; g < 4; g++) { const a = L[j], b = L[(j + 1) % 4]; seg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= seg) break; d -= seg; j = (j + 1) % 4; }
    const a = L[j], b = L[(j + 1) % 4], f = d / seg; c.x = a[0] + (b[0] - a[0]) * f; c.z = a[1] + (b[1] - a[1]) * f; c.ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); compose(m4, c.x, 0, c.z, c.ry, 1); movers.carIM.forEach(im => im && im.setMatrixAt(i, m4)); });
  movers.carIM.forEach(im => { if (im) im.instanceMatrix.needsUpdate = true; });
  movers.allPeople.forEach((p, i) => { let x, z, ry = 0, bob = 0;
    if (p.player) { x = X(p.player.x) + Math.sin(t * 1.3 + i) * .6; z = Z(p.player.y) + Math.sin(t * 1.8 + i * 2) * p.player.amp * PX * .5; ry = p.player.x < 463 ? Math.PI / 2 : -Math.PI / 2; }
    else if (p.static) { x = p.x; z = p.z; }
    else { p.t = (p.t + p.sp * dt) % 2; const f = p.t < 1 ? p.t : 2 - p.t; const [a, b] = p.path; x = a[0] + (b[0] - a[0]) * f; z = a[1] + (b[1] - a[1]) * f; ry = p.t < 1 ? Math.atan2(b[0] - a[0], b[1] - a[1]) : Math.atan2(a[0] - b[0], a[1] - b[1]); bob = Math.abs(Math.sin(t * 7 + i)) * .05; }
    compose(m4, x, (p.player ? .16 : .06) + bob, z, ry, 1); movers.pBody.setMatrixAt(i, m4); movers.pHead.setMatrixAt(i, m4); });
  movers.pBody.instanceMatrix.needsUpdate = movers.pHead.instanceMatrix.needsUpdate = true;
  const dist = camera.position.distanceTo(controls.target); const op = THREE.MathUtils.clamp((150 - dist) / 50, 0, 1); movers.nums.forEach(s => { const d = s.position.distanceTo(camera.position); const o = Math.min(op, THREE.MathUtils.clamp((75 - d) / 25, 0, 1)); s.material.opacity = o; s.visible = o > .02 && !state.compare; });
  const rc = wrap3.getBoundingClientRect(); labelsEl.forEach((el, i) => { const L = amenLbl[i]; _v.set(X(L.p[0]), L.p[2], Z(L.p[1])).project(camera); const on = _v.z < 1 && !state.compare && i === amHover; el.style.opacity = on ? 1 : 0; el.style.transform = `translate(${(_v.x * .5 + .5) * rc.width}px,${(-_v.y * .5 + .5) * rc.height}px) translate(-50%,-100%)`; });
  document.getElementById('n3d').style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
  if (composer) composer.render(dt); else R.render(scene, camera);
}
function mountLabels() { const box = document.getElementById('lbl3d'); box.innerHTML = amenLbl.map(l => `<span>${l.t}</span>`).join(''); labelsEl = [...box.children]; }

// ---------------------------------------------------------------- 2D/3D toggle
function open3d() { visible = true; window.va && window.va('event', { name: 'n7_3d_open' }); wrap3.classList.add('on'); master.classList.add('off'); document.getElementById('v3d').setAttribute('aria-pressed', 'true'); document.getElementById('v2d').setAttribute('aria-pressed', 'false');
  if (!built) { mountLabels(); document.getElementById('load3d').classList.remove('done'); requestAnimationFrame(() => setTimeout(() => { build(); window.__n7 = { setCompare, setView, applyPreset, controls: () => controls, camera: () => camera, state, paint, go, syncToolbar, overlay: () => overlay }; }, 30)); } else { resize(); paint(); } }
document.getElementById('v3d').onclick = open3d;
document.getElementById('v2d').onclick = () => { wrap3.classList.remove('on'); master.classList.remove('off'); document.getElementById('v2d').setAttribute('aria-pressed', 'true'); document.getElementById('v3d').setAttribute('aria-pressed', 'false'); };
document.addEventListener('fullscreenchange', () => setTimeout(resize, 80));
if (QS.get('open3d')) open3d();

// ================================================================= VILLA BY TYPE (modal)
const modal = document.getElementById('modal'), cT = document.getElementById('cType');
const FLOORS = {
  A: [{ k: 'g', t: 'الأرضي', d: 'مدخل، مجلس، صالة معيشة، مطبخ مجهّز، حمّام ضيوف، حديقة خاصة ومصعد' }, { k: '1', t: 'الأول', d: 'غرفتا نوم بحمّامين، غرفة نوم ثالثة، صالة عائلية' }, { k: '2', t: 'الثاني', d: 'الجناح الرئيسي بغرفة ملابس، غرفة خادمة، صالة' }, { k: 'roof', t: 'السطح', d: 'جلسة خارجية تحت برجولا، غرفة غسيل، شرفة' }],
  B: [{ k: 'g', t: 'الأرضي', d: 'مدخل، مجلس، معيشة ومطبخ مفتوح، حمّام ضيوف، حديقة، مصعد' }, { k: '1', t: 'الأول', d: 'غرفة رئيسية بحمّام وملابس + غرفتا نوم بحمّام مشترك' }, { k: 'roof', t: 'السطح', d: 'جلسة سطح تحت برجولا وغرفة خدمة' }],
  C: [{ k: 'g', t: 'الأرضي', d: 'مدخل، مجلس، معيشة ومطبخ، حمّام ضيوف، حديقة (أكبر في الوحدات الطرفية)، مصعد' }, { k: '1', t: 'الأول', d: 'غرفة رئيسية بحمّام وملابس + غرفتا نوم' }, { k: 'roof', t: 'السطح', d: 'جلسة سطح، شرفة أوسع في الوحدات الطرفية' }],
  D: [{ k: 'g', t: 'الأرضي', d: 'مدخل، مجلس، معيشة ومطبخ، حمّام ضيوف، حديقة، مصعد' }, { k: '1', t: 'الأول', d: 'غرفة رئيسية بحمّام وملابس + غرفتا نوم' }, { k: 'roof', t: 'السطح', d: 'جلسة سطح وغرفة خدمة' }]
};
let tKeys = [], tR, tS, tC, tCtl, tGroups = null, tMode = 'stack', tRaf = 0, tNb;
function tagTex(txt) { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = 'rgba(16,50,45,.9)'; x.beginPath(); if (x.roundRect) x.roundRect(6, 22, 500, 84, 42); else x.rect(6, 22, 500, 84); x.fill(); x.fillStyle = '#f6f1e7'; x.font = '600 44px "IBM Plex Sans Arabic", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.fillText(txt, 256, 66); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function openType(k) {
  const T = TYPES[k]; document.getElementById('mTitle').textContent = `${T.name} · ${T.bed} · ${T.floors}`; document.getElementById('mPlan').src = T.plan;
  document.getElementById('mFloors').innerHTML = FLOORS[k].map(f => `<li><b>${f.t}</b><span>${f.d}</span></li>`).join('');
  [...document.querySelectorAll('#mCtr button')].forEach(b => { b.style.display = (b.dataset.v === '2' && k !== 'A') ? 'none' : ''; });
  modal.classList.add('on'); requestAnimationFrame(() => buildType(k));
}
function buildType(k) {
  const M = mats(); if (!tR) { tR = new THREE.WebGLRenderer({ canvas: cT, antialias: true }); tR.setPixelRatio(Math.min(2, devicePixelRatio || 1)); tR.shadowMap.enabled = true; tR.shadowMap.type = THREE.PCFSoftShadowMap; tR.toneMapping = THREE.NeutralToneMapping; tR.toneMappingExposure = 1; }
  tS = new THREE.Scene(); tC = new THREE.PerspectiveCamera(34, 1, .1, 5000);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(46), THREE.MathUtils.degToRad(32));
  const sk = makeSky(2000); setSky(sk, PRE.day, dir); tS.add(sk);
  const es = new THREE.Scene(); const sk2 = makeSky(20); setSky(sk2, PRE.day, dir); es.add(sk2); const pm = new THREE.PMREMGenerator(tR); tS.environment = pm.fromScene(es).texture;
  const sl = new THREE.DirectionalLight('#fff0d6', 3.4); sl.position.copy(dir).multiplyScalar(80); sl.castShadow = true; sl.shadow.mapSize.set(2048, 2048); Object.assign(sl.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 }); sl.shadow.bias = -.0004; sl.shadow.normalBias = .03; sl.shadow.camera.updateProjectionMatrix(); tS.add(sl);
  tS.add(new THREE.HemisphereLight('#dcecff', '#b39a76', .62)); tS.environmentIntensity = .75;
  const N = FLOORS_N(k), w = 6.3, spec = { w, zw0: 2.4, zw1: 12.2, zf: 20.6, N, hollow: true, seed: 11 };
  const bags = {}; const B = key => bags[key] || (bags[key] = new Bag()); const reg = newRegistry();
  townhouse(B, spec, reg, new THREE.Matrix4());
  const ground = new Bag(); ground.bb(M.sand, -80, -.25, -80, 80, -.05, 80); ground.bb(M.paverL, -14, -.05, -4, 14, .0, 24); ground.bb(M.asphalt, -40, -.05, 24, 40, .02, 31); ground.bb(M.curb, -40, -.05, 23.4, 40, .15, 24); ground.flush(tS);
  tGroups = {}; const floorKeys = FLOORS[k].map(f => f.k); tKeys = floorKeys;
  floorKeys.forEach((fk, i) => { const g = new THREE.Group(); const keys = fk === 'roof' ? ['r'] : ['s' + i, 'i' + i, 'c' + i];
    keys.forEach(key => { if (bags[key]) bags[key].flush(g).forEach(m => m.userData.part = key[0]); });
    if (fk !== 'roof') reg.labels.filter(l => l.k === i).forEach(l => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(l.t), transparent: true, depthTest: false })); sp.scale.set(3.6, .9, 1); sp.position.set(l.x, l.y, l.z); sp.renderOrder = 9; sp.userData.part = 'l'; g.add(sp); });
    tS.add(g); tGroups[fk] = g; });
  tNb = new THREE.Group(); [-1, 1].forEach(sd => { const nb = {}; const Bn = key => nb[key] || (nb[key] = new Bag()); townhouse(Bn, { ...spec, hollow: false, seed: 3 + sd }, newRegistry(), new THREE.Matrix4()); Object.values(nb).forEach(b => b.flush(tNb).forEach(m => { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = .16; m.material.depthWrite = false; m.castShadow = false; m.position.x = sd * w; })); }); tS.add(tNb);
  reg.trees.push({ p: new THREE.Vector3(-7, 0, 22.4), R: 1.8, h: 4.6, c: '#5da33b' }, { p: new THREE.Vector3(8, 0, 22.4), R: 1.6, h: 4.2, c: '#72ad42' });
  buildVegetation(reg, tS, []);
  const cg = carGeos(); const cp = new THREE.Vector3(2, 0, 27.5);
  [[cg.body, new THREE.MeshPhysicalMaterial({ color: '#f2f2f0', roughness: .28, metalness: .55, clearcoat: 1 })], [cg.glass, new THREE.MeshPhysicalMaterial({ color: '#141a1f', roughness: .05, metalness: .6 })], [cg.wheels, new THREE.MeshStandardMaterial({ color: '#1a1a1a' })]].forEach(([g, m]) => { const o = new THREE.Mesh(g, m); o.position.copy(cp); o.castShadow = true; tS.add(o); });
  if (!tCtl) { tCtl = new OrbitControls(tC, cT); tCtl.enableDamping = true; tCtl.maxPolarAngle = 1.5; tCtl.minDistance = 8; tCtl.maxDistance = 90; } else tCtl.object = tC;
  tFit(); setMode(tMode); if (!tRaf) tLoop();
}
function tFit() { const w = cT.clientWidth, h = cT.clientHeight; if (!w || !h) return; tR.setSize(w, h, false); tC.aspect = w / h; tC.updateProjectionMatrix(); }
function setMode(m) {
  tMode = m; [...document.querySelectorAll('#mCtr button')].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === m)); if (!tGroups) return;
  const keys = tKeys, focus = ['g', '1', '2', 'roof'].includes(m);
  keys.forEach((fk, i) => { const g = tGroups[fk]; g.position.y = m === 'explode' ? i * 3.4 : 0; g.visible = !focus || fk === m;
    g.children.forEach(o => { const p = o.userData.part; if (p === 'i' || p === 'l') o.visible = m !== 'stack'; if (p === 'c') o.visible = m === 'stack'; }); });
  if (tNb) tNb.visible = m === 'stack';
  const idx = keys.indexOf(m), N = keys.length - 1; let ty, dist, el;
  if (m === 'stack') { ty = N * FH * .55; dist = 48; el = 12; } else if (m === 'explode') { ty = (N * FH + N * 3.4) * .5; dist = 58; el = 16; } else { ty = (m === 'roof' ? N * FH : idx * FH) + 1; dist = 30; el = 26; }
  tCtl.target.set(0, ty, 11); const d = new THREE.Vector3(.55, 0, .83).normalize().multiplyScalar(dist); tC.position.set(d.x, ty + el, 11 + d.z); tCtl.update();
}
function tLoop() { if (!modal.classList.contains('on')) { tRaf = 0; return; } windU.value = performance.now() / 1000; tCtl.update(); tR.render(tS, tC); tRaf = requestAnimationFrame(tLoop); }
document.getElementById('mCtr').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
document.getElementById('mClose').onclick = () => modal.classList.remove('on'); modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('on'); });
document.addEventListener('click', e => { const t = e.target.closest('[data-3d]'); if (!t) return; e.preventDefault(); openType(t.dataset['3d']); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.remove('on'); const t = document.activeElement; if (e.key === 'Enter' && t && t.dataset && t.dataset['3d']) openType(t.dataset['3d']); });
addEventListener('resize', () => { if (tR && modal.classList.contains('on')) tFit(); });
