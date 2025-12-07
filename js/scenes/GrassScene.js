import * as THREE from 'three';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { WindField } from '../components/WindField.js';

// === SHADERS ===

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

    vRandomSeed = aRandomSeed;

    float randomAngle = aRandomSeed * 2.0 * 3.14159265359;
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

// === CONFIGURATION ===

const planeSize = 30;
const MAX_GRASS_COUNT = 25000;
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

const cameraConfig = {
    fov: 75,
    near: 0.1,
    far: 1000,
    position: [0, 20, 0],
    lookAt: [0, 0, 0],
};

// === SCENE CLASS ===

export class GrassScene {

    // === LIFECYCLE ===

    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isHovering = false;
        this.lastGroundPoint = null;
        this.scrollOffsetNormZ = 0;
        this.grassBasePositions = [];

        // Performance State
        this.perfMonitor = new PerformanceMonitor(this.onPerformanceDrop.bind(this));
        this.currentScaleDPR = 1.0;

        this.initCamera();
        this.init();
    }

    init() {
        this.initSystems();
        this.initGrass();

        this.updateGroundToViewport();
        this.applyGrassPositions();

        this.updatePerformanceConfig(window.innerWidth, window.innerHeight);
    }

    dispose() {
        if (this.ground) {
            this.ground.geometry.dispose();
            this.ground.material.dispose();
        }
        if (this.grass) {
            this.grass.geometry.dispose();
            this.grass.material.dispose();
        }
        if (this.windField) {
            this.windField.dispose();
        }
    }

    mount() {
        window.addEventListener('pointermove', this.onPointerMove, { capture: true });
        window.addEventListener('touchstart', this.onTouchMove, { capture: true });
        window.addEventListener('touchmove', this.onTouchMove, { capture: true });
        window.addEventListener('pointerout', this.onPointerOut);

        this.cacheBendElements();
    }

    unmount() {
        window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
        window.removeEventListener('pointerout', this.onPointerOut);
        window.removeEventListener('touchstart', this.onTouchMove, { capture: true });
        window.removeEventListener('touchmove', this.onTouchMove, { capture: true });
    }

    // === INITIALIZATION ===

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            cameraConfig.fov,
            window.innerWidth / window.innerHeight,
            cameraConfig.near,
            cameraConfig.far
        );
        this.camera.position.set(...cameraConfig.position);
        this.camera.lookAt(...cameraConfig.lookAt);
        this.camera.up.set(0, 0, -1);
    }

    initSystems() {
        console.log('[Grass] initSystems()');
        const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
        groundGeometry.rotateX(-Math.PI / 2);
        // ... (rest)
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.scene.add(this.ground);

        this.initialAspect = window.innerWidth / window.innerHeight;

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
        console.log('[Grass] initGrass() started');
        const grassGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, bladeSegments);

        const verts = grassGeometry.attributes.position.array;
        // ...
        for (let i = 0; i < verts.length; i += 3) {
            if (verts[i + 1] > bladeHeight / 2 - 0.001) {
                verts[i] *= taperFactor;
            }
        }
        grassGeometry.attributes.position.needsUpdate = true;
        grassGeometry.translate(0, bladeHeight / 2, 0);

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

    // === PERFORMANCE & UPDATES ===

    updatePerformanceConfig(width, height) {
        const aspect = width / height;

        const rawCount = Math.floor(aspect * 15000);
        const targetCount = Math.min(MAX_GRASS_COUNT, rawCount);

        if (this.grass) {
            this.grass.count = targetCount;
        }

        const baseDPR = Math.max(0.6, Math.min(aspect, 1.0));
        this.applyDPR(baseDPR * this.currentScaleDPR);
    }

    applyDPR(targetDPR) {
        const dpr = Math.min(window.devicePixelRatio || 1, targetDPR);
        if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) {
            this.renderer.setPixelRatio(dpr);
        }
    }

    onPerformanceDrop(fps) {
        this.currentScaleDPR *= 0.8;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;
        const baseDPR = Math.max(0.6, Math.min(aspect, 1.0));

        this.applyDPR(baseDPR * this.currentScaleDPR);
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.updateGroundToViewport();

        this.cacheBendElements();
        this.updatePerformanceConfig(width, height);
    }

    updateGroundToViewport() {
        const isMobile = window.innerWidth < 768;
        const aspect = isMobile ? this.initialAspect : this.camera.aspect;
        this.ground.scale.set(aspect, 1, 1);
    }

    updateScrollState(currentY) {
        const SCROLL_NORM_PER_PIXEL = 0.0005;
        this.scrollOffsetNormZ = currentY * SCROLL_NORM_PER_PIXEL;

        const extentZ = planeSize * this.ground.scale.z;
        this.uniforms.scrollOffsetZ.value = this.scrollOffsetNormZ * extentZ;
        this.uniforms.scrollOffsetNorm.value = this.scrollOffsetNormZ;
        this.uniforms.planeExtent.value.set(planeSize * this.ground.scale.x, extentZ);

        this.updateBendElements(currentY);
    }

    cacheBendElements() {
        this.bendCache = [];
        const els = document.querySelectorAll('[data-bend-on-scroll]');
        const scrollTop = window.scrollY || document.documentElement.scrollTop;

        els.forEach(el => {
            const rect = el.getBoundingClientRect();
            const maxDeg = isNaN(parseFloat(el.dataset.bendMax)) ? -8 : parseFloat(el.dataset.bendMax);
            this.bendCache.push({
                el: el,
                top: rect.top + scrollTop,
                height: rect.height,
                maxDeg: maxDeg
            });
        });
    }

    updateBendElements(currentY) {
        if (!this.bendCache) return;

        const centerY = window.innerHeight / 2;

        for (let i = 0; i < this.bendCache.length; i++) {
            const item = this.bendCache[i];
            const rectTop = item.top - currentY;
            const elCenter = rectTop + item.height / 2;

            const t = (elCenter - centerY) / centerY;
            const onlyBottom = Math.max(0, Math.min(1, t));
            const angle = -onlyBottom * item.maxDeg;

            item.el.style.transform = `perspective(1000px) rotateX(${angle}deg)`;
        }
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
        this.perfMonitor.update(dt);

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

    // === EVENTS ===

    onPointerMove = (e) => {
        const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        this.updateMousePosition(t.clientX, t.clientY);
    }

    onTouchMove = (e) => {
        const t = e.touches[0];
        if (t) {
            this.updateMousePosition(t.clientX, t.clientY);
        }
    }

    updateMousePosition(clientX, clientY) {
        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        this.isHovering = true;
    }

    onPointerOut = (e) => {
        if (!e.relatedTarget) {
            this.isHovering = false;
            this.lastGroundPoint = null;
        }
    }

}
