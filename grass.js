import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';

// ==========================================
// CONFIGURATION
// ==========================================

const planeSize = 30;
const MAX_GRASS_COUNT = 50000;
const INITIAL_GRASS_COUNT = 30000;
const grassCount = MAX_GRASS_COUNT; 

const bladeWidth = 0.4;
const bladeHeight = 1.2;
const bladeSegments = 1;
const taperFactor = 0.0;

const initialUniforms = {
  turbulenceAmplitude: 0.4,
  turbulenceFrequency: 0.2,
  damping: 0.3,
  windStrength: 1.2,
  trailDecay: 0.98,
  diffusion: 0.25,
  advection: 1.0,
  injectionRadius: 0.02,
  injectionStrength: 1.0,
  injectionStrengthMax: 1.0,
  fieldResolution: 32,
  glowThreshold: 0.05,
  glowBoost: 0.2,
};

const conveyorConfig = {
  loops: 0.4,
};

const cameraConfig = {
  fov: 75,
  near: 0.1,
  far: 1000,
  position: [0, 20, 0],
  lookAt: [0, 0, 0],
};

// ==========================================
// SHADERS
// ==========================================

const grassVertexShader = `
  uniform float time;
  uniform float turbulenceAmplitude;
  uniform float turbulenceFrequency;
  uniform float damping;
  uniform float windStrength;
  uniform vec2 planeExtent;
  uniform sampler2D windTex;
  uniform float glowThreshold;
  uniform float glowBoost;
  uniform float scrollOffsetZ;
  uniform float scrollOffsetNorm;
  attribute float aRandomSeed;
  varying float vHeight;
  varying float vRandomSeed;
  varying float vGlow;
  void main() {
    vec3 basePos = instanceMatrix[3].xyz;

    float extentZ = planeExtent.y;
    float zNorm = basePos.z / max(extentZ, 1e-5);
    zNorm = fract(zNorm - scrollOffsetNorm + 0.5) - 0.5;
    float newZBase = zNorm * extentZ;
    float deltaZ = newZBase - basePos.z;

    vec2 uv = vec2(basePos.x, newZBase) / planeExtent + 0.5;
    uv = vec2(clamp(uv.x, 0.0, 1.0), clamp(uv.y, 0.0, 1.0));
    
    vec2 wind = texture2D(windTex, uv).xy;
    float windMag = length(wind);

    vec3 pos = position;
    float heightFactor = pos.y;
    vHeight = heightFactor;

    float randomSeed = aRandomSeed;
    vRandomSeed = aRandomSeed;

    float randomAngle = randomSeed * 2.0 * 3.14159265359;
    vec2 bendDir = vec2(cos(randomAngle), sin(randomAngle));
    float bendAmount = damping * heightFactor;
    pos.x += bendDir.x * bendAmount;
    pos.z += bendDir.y * bendAmount;

    pos.x += wind.x * windStrength * heightFactor;
    pos.z += wind.y * windStrength * heightFactor;

    float glow = smoothstep(glowThreshold, glowThreshold * 3.0, windMag) * glowBoost;
    vGlow = glow * heightFactor;

    float tx = basePos.x;
    float tz = newZBase; 
    float turbulence = sin(tx * turbulenceFrequency + time) *
                       sin(tz * turbulenceFrequency + time) *
                       turbulenceAmplitude * heightFactor;
    pos.x += turbulence;
    pos.z += turbulence;

    vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
    worldPos.z += deltaZ;
    
    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
  }
`;

const grassFragmentShader = `
  varying float vHeight;
  varying float vRandomSeed;
  varying float vGlow;
  void main() {
    vec3 bottomColor = vec3(0.0, 0.0, 0.0);
    float grayValue = vRandomSeed * 0.15 + 0.1;
    vec3 topColor = vec3(grayValue, grayValue, grayValue);
    vec3 baseColor = mix(bottomColor, topColor + 0.1, vHeight);

    vec3 glowColor = vec3(0.5, 0.5, 0.5);
    vec3 color = baseColor + vGlow * glowColor;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ==========================================
// WIND FIELD
// ==========================================

class WindField {
  constructor(renderer, size = 256, params = {}) {
    this.renderer = renderer;
    this.size = size;
    this.params = {
      decay: params.decay ?? 0.95,
      diffusion: params.diffusion ?? 0.2,
      advection: params.advection ?? 1.0,
      injectionRadius: params.injectionRadius ?? 0.08,
      injectionStrength: params.injectionStrength ?? 1.0,
      injectionStrengthMax: params.injectionStrengthMax ?? 1.0,
    };

    const isWebGL2 = renderer.capabilities.isWebGL2 === true;
    const hasHalfFloat = isWebGL2 || renderer.extensions.has('OES_texture_half_float');
    const hasHalfFloatLinear = isWebGL2 || renderer.extensions.has('OES_texture_half_float_linear');
    const hasCBHalfFloat = renderer.extensions.has('EXT_color_buffer_half_float');
    const hasCBFloat = (isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')) || renderer.extensions.has('WEBGL_color_buffer_float');

    let rtType = THREE.HalfFloatType;
    if (!hasHalfFloat || !(hasCBHalfFloat || isWebGL2)) {
      rtType = hasCBFloat ? THREE.FloatType : THREE.HalfFloatType;
    }
    const filter = hasHalfFloatLinear ? THREE.LinearFilter : THREE.NearestFilter;

    const options = {
      minFilter: filter,
      magFilter: filter,
      format: THREE.RGBAFormat,
      type: rtType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(size, size, options);
    this.rtB = new THREE.WebGLRenderTarget(size, size, options);
    this.read = this.rtA;
    this.write = this.rtB;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tVelocity: { value: this.read.texture },
        resolution: { value: new THREE.Vector2(size, size) },
        decay: { value: this.params.decay },
        diffusion: { value: this.params.diffusion },
        advection: { value: this.params.advection },
        dt: { value: 0.016 },
        brushPos: { value: new THREE.Vector2(-1, -1) },
        brushDir: { value: new THREE.Vector2(0, 0) },
        injectionRadius: { value: this.params.injectionRadius },
        injectionStrength: { value: this.params.injectionStrength },
        injectionStrengthMax: { value: this.params.injectionStrengthMax },
        texelSize: { value: new THREE.Vector2(1.0 / size, 1.0 / size) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tVelocity;
        uniform vec2 resolution;
        uniform vec2 texelSize;
        uniform float decay;
        uniform float diffusion;
        uniform float advection;
        uniform float dt;
        uniform vec2 brushPos;
        uniform vec2 brushDir;
        uniform float injectionRadius;
        uniform float injectionStrength;
        uniform float injectionStrengthMax;

        vec2 sampleVel(vec2 uv) {
          return texture2D(tVelocity, uv).xy;
        }

        void main() {
          vec2 velPrev = sampleVel(vUv);
          vec2 advUV = vUv - advection * dt * velPrev;
          vec2 adv = sampleVel(advUV);

          vec2 sum = adv;
          sum += sampleVel(vUv + vec2(texelSize.x, 0.0));
          sum += sampleVel(vUv - vec2(texelSize.x, 0.0));
          sum += sampleVel(vUv + vec2(0.0, texelSize.y));
          sum += sampleVel(vUv - vec2(0.0, texelSize.y));
          vec2 blurred = sum / 5.0;
          vec2 vel = mix(adv, blurred, clamp(diffusion, 0.0, 1.0));

          vel *= clamp(decay, 0.0, 1.0);

          if (brushPos.x >= 0.0 && brushPos.x <= 1.0 && brushPos.y >= 0.0 && brushPos.y <= 1.0) {
            vec2 diff = vUv - brushPos;
            float distSq = dot(diff, diff);
            float r = max(injectionRadius, 1e-5);
            float rSq = r * r;
            float w = exp(-0.5 * distSq / rSq);
            float s = min(injectionStrength, injectionStrengthMax);
            vel += brushDir * (s * w);
          }

          gl_FragColor = vec4(vel, 0.0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);
    this.clear();
  }

  clear() {
    const prevRT = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rtA);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(prevRT);
  }

  update(mouseUv, mouseDir, dt) {
    this.material.uniforms.tVelocity.value = this.read.texture;
    this.material.uniforms.dt.value = dt;
    if (mouseUv && mouseUv.x >= 0.0 && mouseUv.y >= 0.0) {
      this.material.uniforms.brushPos.value.set(mouseUv.x, mouseUv.y);
      this.material.uniforms.brushDir.value.set(mouseDir.x, mouseDir.y);
    } else {
      this.material.uniforms.brushPos.value.set(-1, -1);
      this.material.uniforms.brushDir.value.set(0, 0);
    }

    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);

    const tmp = this.read; this.read = this.write; this.write = tmp;
  }

  get texture() {
    return this.read.texture;
  }
}

// ==========================================
// GRASS SCENE
// ==========================================

export class GrassScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    
    // --- Camera Setup ---
    this.camera = new THREE.PerspectiveCamera(
      cameraConfig.fov,
      window.innerWidth / window.innerHeight,
      cameraConfig.near,
      cameraConfig.far
    );
    this.camera.position.set(...cameraConfig.position);
    this.camera.lookAt(...cameraConfig.lookAt);
    this.camera.up.set(0, 0, -1); 

    // --- State ---
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isHovering = false;
    this.lastGroundPoint = null;
    this.scrollOffsetNormZ = 0;
    this.grassBasePositions = [];
    
    // --- Performance State ---
    this.QUALITY_TIERS = [
      { count: MAX_GRASS_COUNT, dprMax: 1.5, name: 'High' },
      { count: 40000, dprMax: 1.25, name: 'Medium-High' },
      { count: INITIAL_GRASS_COUNT, dprMax: 1.0, name: 'Medium' },
      { count: 20000, dprMax: 1.0, name: 'Low' },
      { count: 10000, dprMax: 0.8, name: 'Very Low' }
    ];
    this.currentTierIndex = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 3 : 2;

    this.init();
  }

  init() {
    this.initSystems();
    this.initGrass();
    
    this.updateGroundToViewport();
    this.applyGrassPositions();
    this.applyQualityTier(this.currentTierIndex);
  }

  initSystems() {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.scene.add(this.ground);

    // Uniforms
    this.uniforms = {
      time: { value: 0.0 },
      turbulenceAmplitude: { value: initialUniforms.turbulenceAmplitude },
      turbulenceFrequency: { value: initialUniforms.turbulenceFrequency },
      damping: { value: initialUniforms.damping },
      windStrength: { value: initialUniforms.windStrength },
      planeExtent: { value: new THREE.Vector2(planeSize, planeSize) },
      scrollOffsetZ: { value: 0.0 },
      scrollOffsetNorm: { value: 0.0 },
      windTex: { value: null },
      glowThreshold: { value: initialUniforms.glowThreshold },
      glowBoost: { value: initialUniforms.glowBoost },
    };

    // Wind Field
    this.windField = new WindField(this.renderer, initialUniforms.fieldResolution, {
      decay: initialUniforms.trailDecay,
      diffusion: initialUniforms.diffusion,
      advection: initialUniforms.advection,
      injectionRadius: initialUniforms.injectionRadius,
      injectionStrength: initialUniforms.injectionStrength,
      injectionStrengthMax: initialUniforms.injectionStrengthMax,
    });
    this.uniforms.windTex.value = this.windField.texture;
  }

  initGrass() {
    const grassGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, bladeSegments);
    
    // Taper
    const verts = grassGeometry.attributes.position.array;
    for (let i = 0; i < verts.length; i += 3) {
      if (verts[i + 1] > bladeHeight / 2 - 0.001) {
        verts[i] *= taperFactor;
      }
    }
    grassGeometry.attributes.position.needsUpdate = true;
    grassGeometry.translate(0, bladeHeight / 2, 0);

    // Random Seeds
    const randomSeeds = new Float32Array(grassCount);
    for (let i = 0; i < grassCount; i++) randomSeeds[i] = Math.random();
    grassGeometry.setAttribute('aRandomSeed', new THREE.InstancedBufferAttribute(randomSeeds, 1));

    const grassMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.DoubleSide,
    });

    this.grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);

    // Base Positions
    this.grassBasePositions = new Array(grassCount);
    for (let i = 0; i < grassCount; i++) {
      this.grassBasePositions[i] = {
        x: Math.random() - 0.5,
        z: Math.random() - 0.5,
        rot: Math.random() * Math.PI * 2,
      };
    }
    this.dummy = new THREE.Object3D();
  }

  applyQualityTier(tierIndex) {
    const tier = this.QUALITY_TIERS[tierIndex];
    if (this.grass) {
      this.grass.count = Math.min(grassCount, tier.count);
    }
    const targetDPR = Math.min(window.devicePixelRatio || 1, tier.dprMax);
    if (this.renderer.getPixelRatio() !== targetDPR) {
       this.renderer.setPixelRatio(targetDPR);
    }
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateGroundToViewport();
    this.updateScrollState(window.scrollY);
  }

  updateGroundToViewport() {
    const aspect = this.camera.aspect;
    this.ground.scale.set(aspect, 1, 1);
  }

  updateScrollState(currentY) {
    const vh = window.innerHeight;
    const progress = vh > 0 ? currentY / vh : 0;
    this.scrollOffsetNormZ = progress * conveyorConfig.loops;

    const extentZ = planeSize * this.ground.scale.z;
    this.uniforms.scrollOffsetZ.value = this.scrollOffsetNormZ * extentZ;
    this.uniforms.scrollOffsetNorm.value = this.scrollOffsetNormZ;
    this.uniforms.planeExtent.value.set(planeSize * this.ground.scale.x, extentZ);

    this.updateBendElements();
  }

  updateBendElements() {
    const BEND_MAX_DEG = -8;
    const centerY = window.innerHeight / 2;
    const els = document.querySelectorAll('[data-bend-on-scroll]');
    
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height / 2;
      const t = (elCenter - centerY) / centerY;
      const onlyBottom = Math.max(0, Math.min(1, t));
      const maxDeg = isNaN(parseFloat(el.dataset.bendMax)) ? BEND_MAX_DEG : parseFloat(el.dataset.bendMax);
      const angle = -onlyBottom * maxDeg;
      el.style.transform = `perspective(1000px) rotateX(${angle}deg)`;
    });
  }

  applyGrassPositions() {
    const extentX = planeSize * this.ground.scale.x;
    const extentZ = planeSize * this.ground.scale.z;
    
    for (let i = 0; i < grassCount; i++) {
        const base = this.grassBasePositions[i];
        const x = base.x * extentX;
        
        let zNorm = base.z - this.scrollOffsetNormZ;
        zNorm = ((((zNorm + 0.5) % 1) + 1) % 1) - 0.5;
        
        const z = zNorm * extentZ;
        this.dummy.position.set(x, 0, z);
        this.dummy.rotation.y = base.rot;
        this.dummy.updateMatrix();
        this.grass.setMatrixAt(i, this.dummy.matrix);
    }
    this.grass.instanceMatrix.needsUpdate = true;
  }

  update(time, dt) {
    this.uniforms.time.value = time;

    // Interaction Logic
    let mouseUv = null;
    const dir = new THREE.Vector2(0, 0);

    if (this.isHovering) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hit = this.raycaster.intersectObject(this.ground, false);
        
        if (hit.length > 0) {
            const p = hit[0].point;
            const extentX = planeSize * this.ground.scale.x;
            const extentZ = planeSize * this.ground.scale.z;
            
            const u = Math.min(Math.max(p.x / extentX + 0.5, 0), 1);
            const v = Math.min(Math.max(p.z / extentZ + 0.5, 0), 1);
            mouseUv = new THREE.Vector2(u, v);
            
            if (this.lastGroundPoint) {
                dir.set(p.x - this.lastGroundPoint.x, p.z - this.lastGroundPoint.z);
            } else {
                this.lastGroundPoint = new THREE.Vector3();
            }
            this.lastGroundPoint.copy(p);
        } else {
            this.lastGroundPoint = null;
        }
    } else {
        this.lastGroundPoint = null;
    }

    this.windField.update(mouseUv, dir, dt);
    this.uniforms.windTex.value = this.windField.texture;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  mount() {
    window.addEventListener('pointermove', this.onPointerMove, { capture: true });
    window.addEventListener('pointerout', this.onPointerOut);
    window.addEventListener('scroll', this.onScroll);
  }

  unmount() {
    window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
    window.removeEventListener('pointerout', this.onPointerOut);
    window.removeEventListener('scroll', this.onScroll);
  }

  dispose() {
      // Clean up GPU resources
      this.ground.geometry.dispose();
      this.ground.material.dispose();
      this.grass.geometry.dispose();
      this.grass.material.dispose();
      this.windField.rtA.dispose();
      this.windField.rtB.dispose();
      this.windField.mesh.geometry.dispose();
      this.windField.material.dispose();
  }

  onPointerMove = (e) => {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    this.mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
    this.isHovering = true;
  }

  onPointerOut = (e) => {
    if (!e.relatedTarget) {
        this.isHovering = false;
        this.lastGroundPoint = null;
    }
  }

  onScroll = () => {
      this.updateScrollState(window.scrollY);
  }
}
