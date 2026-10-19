import * as THREE from '../vendor/three.module.min.js';

const NOSE = [0, 0, -1.6];
const TAIL = [0, 0.03, 1.0];
const TIP_L = [-1.05, 0.2, 1.0];
const TIP_R = [1.05, 0.2, 1.0];
const KEEL_L = [-0.05, -0.38, 1.0];
const KEEL_R = [0.05, -0.38, 1.0];

const PAPER_GLOW = new THREE.Color(0xb8c4ff);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Plane {
  constructor(scene) {
    const verts = [
      ...NOSE, ...TAIL, ...TIP_L,   // ala sinistra
      ...NOSE, ...TIP_R, ...TAIL,   // ala destra
      ...NOSE, ...KEEL_L, ...TAIL,  // chiglia sinistra
      ...NOSE, ...TAIL, ...KEEL_R,  // chiglia destra
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();

    this.material = new THREE.MeshStandardMaterial({
      color: 0xfdfbf4,
      roughness: 0.8,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
      emissive: 0x8090c0,
      emissiveIntensity: 0.12,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.group.add(this.mesh);
    this.group.scale.setScalar(0.8);
    scene.add(this.group);

    this.position = this.group.position;
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    this._tipL = new THREE.Vector3(...TIP_L);
    this._tipR = new THREE.Vector3(...TIP_R);
  }

  update(dt, tx, ty, time, shake) {
    const p = this.position;
    const k = 1 - Math.exp(-dt * 3.2);
    const nx = p.x + (tx - p.x) * k;
    const ny = p.y + (ty - p.y) * k;
    const vx = dt > 0 ? (nx - p.x) / dt : 0;
    const vy = dt > 0 ? (ny - p.y) / dt : 0;
    p.x = nx;
    p.y = ny;

    const r = 1 - Math.exp(-dt * 6);
    this.roll += (clamp(-vx * 0.11, -0.95, 0.95) - this.roll) * r;
    this.pitch += (clamp(vy * 0.07, -0.5, 0.5) - this.pitch) * r;
    this.yaw += (clamp(-vx * 0.025, -0.25, 0.25) - this.yaw) * r;

    const sway = Math.sin(time * 1.3) * 0.04;
    const jitter = shake ? (Math.random() - 0.5) * shake : 0;
    this.group.rotation.set(
      this.pitch + Math.sin(time * 1.7) * 0.025 + jitter,
      this.yaw,
      this.roll + sway + jitter,
    );
    this.group.position.y += Math.sin(time * 2.1) * 0.004;
  }

  setLook(horizon, night) {
    this.material.emissive.copy(horizon).lerp(PAPER_GLOW, 0.5 + night * 0.3);
    this.material.emissiveIntensity = 0.3 + night * 0.25;
  }

  wingtips(outL, outR) {
    this.group.updateMatrixWorld();
    outL.copy(this._tipL).applyMatrix4(this.group.matrixWorld);
    outR.copy(this._tipR).applyMatrix4(this.group.matrixWorld);
  }
}
