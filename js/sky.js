import * as THREE from '../vendor/three.module.min.js';

// Colori del cielo lungo la giornata (ora 0-24).
const KEYS = [
  { h: 0,    top: '#070b1f', hor: '#1a2247', bot: '#060918', sun: '#9fb2ff', li: 0.6, hemi: 0.5,  night: 1 },
  { h: 4.8,  top: '#0b1030', hor: '#232a55', bot: '#080b1e', sun: '#9fb2ff', li: 0.6, hemi: 0.55, night: 1 },
  { h: 6.0,  top: '#3d4b8a', hor: '#f4a58a', bot: '#5d5480', sun: '#ffb08a', li: 1.3, hemi: 0.85, night: 0.35 },
  { h: 7.5,  top: '#5f9be0', hor: '#f7dcc0', bot: '#a6bfdc', sun: '#ffeeda', li: 2.0, hemi: 1.1,  night: 0 },
  { h: 12,   top: '#3a86da', hor: '#c4e4ff', bot: '#9cc4ea', sun: '#ffffff', li: 2.4, hemi: 1.25, night: 0 },
  { h: 16.5, top: '#4584d2', hor: '#e9e6d4', bot: '#a7c0dc', sun: '#fff0d6', li: 2.2, hemi: 1.15, night: 0 },
  { h: 18.3, top: '#34428a', hor: '#ff9466', bot: '#6a4c78', sun: '#ff9a5a', li: 1.7, hemi: 0.9,  night: 0.1 },
  { h: 19.4, top: '#1a1f4c', hor: '#b8607a', bot: '#2a2546', sun: '#d48aa6', li: 1.0, hemi: 0.65, night: 0.6 },
  { h: 20.6, top: '#070b1f', hor: '#1a2247', bot: '#060918', sun: '#9fb2ff', li: 0.6, hemi: 0.5,  night: 1 },
  { h: 24,   top: '#070b1f', hor: '#1a2247', bot: '#060918', sun: '#9fb2ff', li: 0.6, hemi: 0.5,  night: 1 },
].map(k => ({
  ...k,
  top: new THREE.Color(k.top),
  hor: new THREE.Color(k.hor),
  bot: new THREE.Color(k.bot),
  sun: new THREE.Color(k.sun),
}));

const WHITE = new THREE.Color(1, 1, 1);

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uHor;
  uniform vec3 uBot;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uNight;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHor, uTop, pow(h, 0.55))
      : mix(uHor, uBot, pow(-h, 0.45));

    float s = max(dot(d, uSunDir), 0.0);
    float sunVis = smoothstep(-0.25, 0.05, uSunDir.y);
    col += uSunColor * (pow(s, 8.0) * 0.22 + pow(s, 140.0) * 0.6) * sunVis;
    col = mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.9993, 0.9996, s) * sunVis);

    float m = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.55, 0.65, 1.0) * pow(m, 90.0) * 0.18 * uNight;
    col = mix(col, vec3(0.93, 0.94, 1.0), smoothstep(0.99982, 0.99992, m) * uNight);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function celestialDir(hour, target) {
  // Arco da sinistra (mattina) a destra (sera), sempre davanti all'aereo.
  const a = ((hour - 6.2) / 12.4) * Math.PI;
  return target.set(-Math.cos(a) * 0.8, Math.sin(a) * 0.9, -1).normalize();
}

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uBot: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, -1).normalize() },
      uMoonDir: { value: new THREE.Vector3(0, 1, -1).normalize() },
      uNight: { value: 0 },
    };

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.dome.renderOrder = -2;
    scene.add(this.dome);

    // Stelle
    const n = 1100;
    const pos = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection();
      v.y = Math.abs(v.y) * 0.95 + 0.02;
      v.normalize().multiplyScalar(460);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.renderOrder = -1;
    scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8899bb, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    scene.add(this.hemi, this.sun);

    this.fogColor = new THREE.Color();
    this.horizon = new THREE.Color();
    this.night = 0;
    this._tmp = new THREE.Vector3();
  }

  setHour(hour) {
    let i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    let t = (hour - a.h) / (b.h - a.h);
    t = t * t * (3 - 2 * t);

    const u = this.uniforms;
    u.uTop.value.lerpColors(a.top, b.top, t);
    u.uHor.value.lerpColors(a.hor, b.hor, t);
    u.uBot.value.lerpColors(a.bot, b.bot, t);
    u.uSunColor.value.lerpColors(a.sun, b.sun, t);
    this.night = a.night + (b.night - a.night) * t;
    u.uNight.value = this.night;

    celestialDir(hour, u.uSunDir.value);
    celestialDir((hour + 12) % 24, u.uMoonDir.value);

    this.horizon.copy(u.uHor.value);
    this.fogColor.copy(u.uHor.value);

    this.hemi.color.copy(u.uTop.value).lerp(WHITE, 0.55);
    this.hemi.groundColor.copy(u.uBot.value).lerp(this.horizon, 0.5);
    this.hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;

    this.sun.color.copy(u.uSunColor.value);
    this.sun.intensity = a.li + (b.li - a.li) * t;
    const lightDir = u.uSunDir.value.y > -0.05 ? u.uSunDir.value : u.uMoonDir.value;
    this.sun.position.copy(lightDir).multiplyScalar(100);

    this.starMat.opacity = Math.max(0, this.night - 0.15) * 1.0;
  }

  follow(camera, time) {
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = time * 0.004;
  }
}
