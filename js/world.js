import * as THREE from '../vendor/three.module.min.js';

export const RANGE = 280;     // profondità del mondo davanti all'aereo
const BEHIND = 16;            // oltre la camera gli oggetti vengono riciclati
const CLOUDS = 42;
const PUFFS = 7;
const ORBS = 90;

const WHITE = new THREE.Color(1, 1, 1);
const MOONLIT = new THREE.Color(0x6b7bb8);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.16, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.38, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(scene) {
    this.bounds = { x: 8, yMin: -4, yMax: 5 };
    this.glow = 1;

    // Nuvole: tanti "sbuffi" low-poly in un'unica InstancedMesh
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
    });
    this.cloudMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      this.cloudMat,
      CLOUDS * PUFFS,
    );
    this.cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cloudMesh.frustumCulled = false;
    scene.add(this.cloudMesh);

    const shade = new THREE.Color();
    this.clouds = [];
    for (let i = 0; i < CLOUDS; i++) {
      const c = { puffs: Array.from({ length: PUFFS }, () => ({ x: 0, y: 0, z: 0, s: 1 })) };
      this.shapeCloud(c, rand(-RANGE, 5));
      // niente nuvole proprio sopra l'aereo all'avvio
      if (c.near && c.z > -40) c.z -= 60;
      this.clouds.push(c);
      for (let j = 0; j < PUFFS; j++) {
        shade.setScalar(rand(0.84, 1));
        this.cloudMesh.setColorAt(i * PUFFS + j, shade);
      }
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();

    // Lucine
    const tex = glowTexture();
    const mat = color => new THREE.SpriteMaterial({
      map: tex,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.orbMat = mat(0xfff0b8);
    this.goldMat = mat(0xffb627);
    this.orbs = [];
    for (let i = 0; i < ORBS; i++) {
      const sprite = new THREE.Sprite(this.orbMat);
      sprite.visible = false;
      scene.add(sprite);
      this.orbs.push({ sprite, active: false, golden: false, x: 0, y: 0, z: 0, phase: 0 });
    }
    this.untilNext = 0;
    for (let z = -45; z > -RANGE + 10; z -= rand(28, 42)) this.spawnPattern(z);
    this.untilNext = 20;

    // Pulviscolo che sfreccia: dà il senso di velocità
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-35, 35);
      pos[i * 3 + 1] = rand(-20, 20);
      pos[i * 3 + 2] = rand(-RANGE, BEHIND);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }));
    this.motes.frustumCulled = false;
    scene.add(this.motes);
  }

  setBounds(bx) {
    this.bounds.x = bx;
  }

  setLook(horizon, night) {
    // le nuvole prendono il colore dell'orizzonte, così non sembrano sassi
    this.cloudMat.emissive.copy(horizon).lerp(WHITE, 0.35 * (1 - night)).lerp(MOONLIT, night * 0.7);
    this.cloudMat.emissiveIntensity = 0.5 - night * 0.08;
    this.glow = 1 + night * 0.5;
    this.motes.material.opacity = 0.4 + night * 0.3;
  }

  shapeCloud(c, z) {
    const b = this.bounds;
    const near = Math.random() < 0.42;
    c.near = near;
    c.x = near ? rand(-b.x - 3, b.x + 3) : (Math.random() < 0.5 ? -1 : 1) * rand(b.x + 8, 60);
    c.y = near ? rand(b.yMin - 1, b.yMax + 1) : rand(-24, 20);
    c.z = z;
    const w = near ? rand(2.5, 5.5) : rand(5, 12);
    const big = near ? 1 : rand(1.4, 2.4);
    c.puffs.forEach((p, j) => {
      const t = j / (PUFFS - 1) - 0.5;
      p.x = t * w * 2 + rand(-0.6, 0.6) * big;
      p.y = rand(-0.3, 0.8) * big * (1 - Math.abs(t));
      p.z = rand(-1.5, 1.5) * big;
      p.s = rand(1.1, 2.0) * big * (1.15 - Math.abs(t) * 0.9);
    });
    c.rx = w + 1.6 * big;
    c.ry = 1.8 * big;
    c.rz = 2.4 * big;
  }

  freeOrb() {
    return this.orbs.find(o => !o.active);
  }

  spawnPattern(z) {
    const b = this.bounds;
    const X = Math.max(1, b.x - 1.2);
    const yLo = b.yMin + 0.8;
    const yHi = b.yMax - 0.8;
    const cx = rand(-X, X);
    const cy = rand(yLo, yHi);
    const pts = [];

    switch (Math.floor(Math.random() * 4)) {
      case 0: { // fila dritta
        const n = 5 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) pts.push([cx, cy, z - i * 3.2]);
        break;
      }
      case 1: { // onda
        const amp = Math.min(3, X - Math.abs(cx) + 1);
        for (let i = 0; i < 9; i++) pts.push([cx + Math.sin(i * 0.7) * amp, cy, z - i * 3]);
        break;
      }
      case 2: { // diagonale
        const x1 = rand(-X, X);
        const y1 = rand(yLo, yHi);
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          pts.push([cx + (x1 - cx) * t, cy + (y1 - cy) * t, z - i * 3.4]);
        }
        break;
      }
      default: { // spirale
        const r = 1.6;
        const sx = clamp(cx, -X + r, X - r);
        const sy = clamp(cy, yLo + r, yHi - r);
        for (let i = 0; i < 12; i++) {
          pts.push([sx + Math.cos(i * 0.6) * r, sy + Math.sin(i * 0.6) * r, z - i * 2.6]);
        }
      }
    }

    pts.forEach(p => this.placeOrb(p[0], p[1], p[2], false));
    if (Math.random() < 0.14) {
      const last = pts[pts.length - 1];
      this.placeOrb(last[0], last[1], last[2] - 5, true);
    }
  }

  placeOrb(x, y, z, golden) {
    const o = this.freeOrb();
    if (!o) return;
    Object.assign(o, { active: true, golden, x, y, z, phase: Math.random() * 6.28 });
    o.sprite.material = golden ? this.goldMat : this.orbMat;
    o.sprite.visible = true;
  }

  update(dt, speed, time, spawning) {
    const dz = speed * dt;

    // nuvole
    let idx = 0;
    for (const c of this.clouds) {
      c.z += dz;
      if (c.z > BEHIND) this.shapeCloud(c, c.z - RANGE - rand(0, 20));
      for (const p of c.puffs) {
        this._p.set(c.x + p.x, c.y + p.y, c.z + p.z);
        this._s.set(p.s, p.s * 0.78, p.s);
        this._m.compose(this._p, this._q, this._s);
        this.cloudMesh.setMatrixAt(idx++, this._m);
      }
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;

    // lucine
    if (spawning) {
      this.untilNext -= dz;
      if (this.untilNext <= 0) {
        this.spawnPattern(-RANGE + rand(0, 10));
        this.untilNext = rand(24, 42);
      }
    }
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.z += dz;
      if (o.z > BEHIND) {
        o.active = false;
        o.sprite.visible = false;
        continue;
      }
      o.sprite.position.set(o.x, o.y + Math.sin(time * 2 + o.phase) * 0.15, o.z);
      const s = (o.golden ? 2.6 : 1.7) * this.glow * (1 + 0.12 * Math.sin(time * 5 + o.phase));
      o.sprite.scale.set(s, s, 1);
    }

    // pulviscolo
    const arr = this.motes.geometry.attributes.position.array;
    for (let i = 2; i < arr.length; i += 3) {
      arr[i] += dz * 1.15;
      if (arr[i] > BEHIND) arr[i] -= RANGE + BEHIND;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }

  collect(pos, out) {
    out.length = 0;
    for (const o of this.orbs) {
      if (!o.active) continue;
      const dx = o.x - pos.x;
      const dy = o.sprite.position.y - pos.y;
      const dz = o.z - pos.z;
      const r = o.golden ? 1.9 : 1.5;
      if (dx * dx + dy * dy + dz * dz < r * r) {
        o.active = false;
        o.sprite.visible = false;
        out.push({ golden: o.golden, x: o.x, y: o.sprite.position.y, z: o.z });
      }
    }
    return out;
  }

  // 0 = cielo libero, 1 = dentro una nuvola
  cloudAt(pos) {
    let best = 0;
    for (const c of this.clouds) {
      if (!c.near) continue;
      const dz = (pos.z - c.z) / c.rz;
      if (dz > 1 || dz < -1) continue;
      const dx = (pos.x - c.x) / c.rx;
      const dy = (pos.y - c.y - 0.3) / c.ry;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (1 - d > best) best = 1 - d;
    }
    return clamp(best * 1.6, 0, 1);
  }
}
