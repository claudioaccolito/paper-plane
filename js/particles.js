import * as THREE from '../vendor/three.module.min.js';

const vertexShader = /* glsl */`
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }
`;

// Scintille: scie dell'aereo ed esplosioni di luce quando si raccoglie qualcosa.
export class Particles {
  constructor(scene, cap = 900) {
    this.cap = cap;
    this.next = 0;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.alpha = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.base = new Float32Array(cap);

    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.pos, 3));
    geo.setAttribute('aColor', attr(this.col, 3));
    geo.setAttribute('aAlpha', attr(this.alpha, 1));
    geo.setAttribute('aSize', attr(this.size, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setScale(s) {
    this.material.uniforms.uScale.value = s;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, alpha = 1) {
    const i = this.next;
    this.next = (i + 1) % this.cap;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.life[i] = life;
    this.max[i] = life;
    this.base[i] = alpha;
    this.alpha[i] = alpha;
  }

  burst(x, y, z, color, count, power) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const s = power * (0.5 + Math.random() * 0.5);
      this.emit(
        x, y, z,
        Math.sin(b) * Math.cos(a) * s,
        Math.sin(b) * Math.sin(a) * s,
        Math.cos(b) * s,
        color,
        0.25 + Math.random() * 0.25,
        0.6 + Math.random() * 0.5,
      );
    }
  }

  update(dt, speed) {
    const drag = Math.max(0, 1 - 2.2 * dt);
    const dz = speed * dt;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j] *= drag;
      this.vel[j + 1] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt + dz;
      this.alpha[i] = Math.max(0, this.life[i] / this.max[i]) * this.base[i];
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
  }
}
