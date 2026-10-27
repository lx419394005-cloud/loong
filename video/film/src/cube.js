// 3D 小方块：磨砂半透明外壳 + 内部 LED 透光 + USB-C 线，带 bloom。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const GREEN = new THREE.Color(0.04, 1.0, 0.32);
export const BLUE = new THREE.Color(0.06, 0.32, 1.0);

const SIZE = 1.84;     // 边长（不含倒角）
const CHAMFER = 0.2;   // 四角切角
const DEPTH = 0.42;    // 厚度（不含倒角）
const BEVEL = 0.08;
const HALF_H = DEPTH / 2 + BEVEL;

function chamferShape(s, c) {
  const h = s / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-h + c, -h);
  sh.lineTo(h - c, -h);
  sh.lineTo(h, -h + c);
  sh.lineTo(h, h - c);
  sh.lineTo(h - c, h);
  sh.lineTo(-h + c, h);
  sh.lineTo(-h, h - c);
  sh.lineTo(-h, -h + c);
  sh.closePath();
  return sh;
}

// 外壳材质：在标准 PBR 上叠加按 LED 距离衰减的自发光，模拟光透过磨砂外壳；闪粉款再加闪点。
function shellMaterial(opts) {
  const u = {
    uLedPos: { value: [new THREE.Vector3(0.22, 0.12, 0.28), new THREE.Vector3(-0.05, 0.1, -0.7)] },
    uLedCol: { value: [GREEN.clone(), GREEN.clone()] },
    uLedInt: { value: [0, 0] },
    uSparkle: { value: opts.sparkle || 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: opts.color,
    roughness: opts.roughness,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.55,
    sheen: 0.25,
    sheenColor: new THREE.Color(0.6, 1.0, 0.92),
    sheenRoughness: 0.6,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLPos = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLPos;
uniform vec3 uLedPos[2];
uniform vec3 uLedCol[2];
uniform float uLedInt[2];
uniform float uSparkle;
uniform float uTime;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
for (int i = 0; i < 2; i++) {
  vec3 dv = vLPos - uLedPos[i];
  float d2 = dot(dv, dv);
  totalEmissiveRadiance += uLedCol[i] * uLedInt[i] * (exp(-d2 / 0.07) * 1.05 + exp(-d2 / 0.5) * 0.35 + 0.03);
}
if (uSparkle > 0.0) {
  vec3 p = floor(vLPos * 85.0);
  float h = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float tw = fract(h * 17.3 + uTime * 0.9);
  float s = step(0.982, h) * pow(max(0.0, sin(tw * 6.2831)), 10.0);
  totalEmissiveRadiance += vec3(0.8, 1.0, 0.96) * s * uSparkle * 4.0;
}`);
  };
  mat.userData.u = u;
  return mat;
}

function cableMaterial() {
  const u = { uPulse: { value: -1 }, uPulseCol: { value: BLUE.clone() }, uPulseInt: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.55, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCUv;\nuniform float uPulse;\nuniform vec3 uPulseCol;\nuniform float uPulseInt;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float pd = (vCUv.x - uPulse) / 0.025;
totalEmissiveRadiance += uPulseCol * uPulseInt * exp(-pd * pd);`);
  };
  mat.userData.u = u;
  return mat;
}

function makeCube(variant) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(chamferShape(SIZE, CHAMFER), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL,
    bevelSegments: 4, curveSegments: 1,
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const mat = variant === 'glitter'
    ? shellMaterial({ color: new THREE.Color(0x12a594), roughness: 0.5, sparkle: 1 })
    : shellMaterial({ color: new THREE.Color(0x3cc2ae), roughness: 0.45, sparkle: 0 });
  const shell = new THREE.Mesh(geo, mat);
  g.add(shell);

  // USB-C 插头 + 线：从 -Z 面伸出，落到地面后延伸出画面
  const plug = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.2, 0.62, 3, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x101011, roughness: 0.45 }));
  plug.position.set(-0.05, -0.03, -SIZE / 2 - BEVEL - 0.31);
  g.add(plug);
  const pts = [
    new THREE.Vector3(-0.05, -0.03, -1.55),
    new THREE.Vector3(-0.04, -0.08, -2.2),
    new THREE.Vector3(0.15, -0.2, -3.2),
    new THREE.Vector3(0.7, -HALF_H + 0.07, -4.6),
    new THREE.Vector3(1.8, -HALF_H + 0.07, -6.8),
    new THREE.Vector3(3.6, -HALF_H + 0.07, -10),
  ];
  const cmat = cableMaterial();
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.075, 12), cmat);
  g.add(cable);

  const light = new THREE.PointLight(GREEN, 0, 6, 1.1);
  light.position.set(0.12, 0.0, 0.18);
  g.add(light);

  return { group: g, shellU: mat.userData.u, cableU: cmat.userData.u, light };
}

export function createStage(canvas, W, H) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030505);
  scene.fog = new THREE.Fog(0x030505, 12, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;

  const key = new THREE.DirectionalLight(0xdff7ff, 0.6);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fffe0, 0.9);
  rim.position.set(3, 2, -5);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x060808, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.25 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -HALF_H;
  scene.add(floor);

  const cubes = [makeCube('frosted'), makeCube('glitter')];
  cubes.forEach((c) => scene.add(c.group));

  const camera = new THREE.PerspectiveCamera(28, W / H, 0.05, 100);

  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.9, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const tmpCol = new THREE.Color();

  // shot: { cam:{pos:[x,y,z], target:[x,y,z], fov}, cubes:[{pos, rotY, led:{color, int}, pulse, sparkleTime}], bg, exposure, bloom, floor }
  function render(shot, t) {
    camera.position.set(...shot.cam.pos);
    camera.fov = shot.cam.fov || 28;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(...shot.cam.target));
    if (shot.cam.roll) camera.rotateZ(shot.cam.roll);
    scene.background.set(shot.bg ?? 0x030505);
    scene.fog.color.set(shot.bg ?? 0x030505);
    scene.fog.near = shot.fogNear ?? 12;
    scene.fog.far = shot.fogFar ?? 30;
    floor.visible = shot.floor !== false;
    renderer.toneMappingExposure = shot.exposure ?? 1.0;
    bloom.strength = shot.bloom ?? 0.9;
    key.intensity = shot.key ?? 0.6;
    rim.intensity = shot.rim ?? 0.9;
    scene.environmentIntensity = shot.env ?? 0.32;

    cubes.forEach((c, i) => {
      const s = shot.cubes[i];
      c.group.visible = !!s;
      if (!s) return;
      c.group.position.set(...(s.pos || [0, 0, 0]));
      c.group.rotation.set(0, s.rotY || 0, 0);
      const col = s.led.color;
      const int = s.led.int;
      c.shellU.uLedCol.value[0].copy(col);
      c.shellU.uLedCol.value[1].copy(s.led.color2 || col);
      c.shellU.uLedInt.value[0] = int;
      c.shellU.uLedInt.value[1] = int * (s.led.portRatio ?? 0.35);
      c.shellU.uTime.value = t;
      tmpCol.copy(col);
      c.light.color.copy(tmpCol);
      c.light.intensity = int * 0.8;
      c.cableU.uPulse.value = s.pulse ?? -1;
      c.cableU.uPulseCol.value.copy(s.pulseColor || BLUE);
      c.cableU.uPulseInt.value = s.pulse != null ? (s.pulseInt ?? 4) : 0;
    });
    composer.render();
  }

  return { render };
}
