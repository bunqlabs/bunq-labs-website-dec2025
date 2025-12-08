import * as THREE from 'three';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { WindField } from '../components/WindField.js';
import { Config } from '../Config.js';

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

// === SCENE CLASS ===

export class GrassScene {

    // === LIFECYCLE ===

    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isHovering = false;
        this.lastGroundPoint = null; // Will hold a Vector3
        this.scrollOffsetNormZ = 0;
        this.grassBasePositions = [];

        // Pre-allocated temporaries for GC optimization
        this.tempVec2 = new THREE.Vector2();
        this.tempVec3 = new THREE.Vector3();
        this.lastGroundPointVec = new THREE.Vector3();

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
        this.layoutGrass();

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
    }

    unmount() {
        window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
        window.removeEventListener('pointerout', this.onPointerOut);
        window.removeEventListener('touchstart', this.onTouchMove, { capture: true });
        window.removeEventListener('touchmove', this.onTouchMove, { capture: true });
    }

    initCamera() {
        const cfg = Config.Grass.camera;
        this.camera = new THREE.PerspectiveCamera(
            cfg.fov,
            window.innerWidth / window.innerHeight,
            cfg.near,
            cfg.far
        );
        this.camera.position.set(...cfg.position);
        this.camera.lookAt(...cfg.lookAt);
        this.camera.up.set(0, 0, -1);
    }

    initSystems() {
        console.log('[Grass] initSystems()');
        const planeSize = Config.Grass.planeSize;
        const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
        groundGeometry.rotateX(-Math.PI / 2);

        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.scene.add(this.ground);

        this.initialAspect = window.innerWidth / window.innerHeight;

        const u = Config.Grass.uniforms;
        this.uniforms = {
            time: { value: 0.0 },
            turbulenceAmplitude: { value: u.turbulenceAmplitude },
            turbulenceFrequency: { value: u.turbulenceFrequency },
            damping: { value: u.damping },
            windStrength: { value: u.windStrength },
            planeExtent: { value: new THREE.Vector2(planeSize, planeSize) },
            scrollOffsetZ: { value: 0.0 },
            scrollOffsetNorm: { value: 0.0 },
            windTex: { value: null },
            glowThreshold: { value: u.glowThreshold },
            glowBoost: { value: u.glowBoost },
        };

        const isMobile = window.innerWidth < 768;
        // Use lower resolution for fluid sim on mobile
        const simRes = isMobile ? 128 : 256;

        this.windField = new WindField(this.renderer, simRes, {
            decay: Config.Grass.uniforms.decay,
            diffusion: Config.Grass.uniforms.diffusion,
            advection: u.advection,
            injectionRadius: u.injectionRadius,
            injectionStrength: u.injectionStrength,
            injectionStrengthMax: u.injectionStrengthMax,
        });
        this.uniforms.windTex.value = this.windField.texture;
    }

    initGrass() {
        console.log('[Grass] initGrass() started');
        const bladeWidth = Config.Grass.bladeWidth;
        const bladeHeight = Config.Grass.bladeHeight;
        const bladeSegments = Config.Grass.bladeSegments;
        const taperFactor = Config.Grass.taperFactor;

        const isMobile = window.innerWidth < 768;
        const max = isMobile ? Config.Grass.mobileMaxGrassCount : Config.Grass.maxGrassCount;
        const grassCount = max;

        console.log(`[Grass Init] WindowWidth: ${window.innerWidth}, isMobile: ${isMobile}, ConfigMax: ${Config.Grass.mobileMaxGrassCount}, AppliedCount: ${grassCount}`);

        const grassGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, bladeSegments);

        const verts = grassGeometry.attributes.position.array;
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

    updatePerformanceConfig(width, height) {
        const aspect = width / height;
        const isMobile = width < 768;
        const max = isMobile ? Config.Grass.mobileMaxGrassCount : Config.Grass.maxGrassCount;

        console.log(`[Grasss Debug] Width: ${width}, isMobile: ${isMobile}, Max: ${max}, MobileMaxConfig: ${Config.Grass.mobileMaxGrassCount}`);

        // Dynamic reduce based on aspect
        const rawCount = Math.floor(aspect * max);
        const targetCount = Math.min(max, rawCount);

        if (this.grass) {
            this.grass.count = targetCount;
        }

        let maxDPR = 1.0;
        if (isMobile) {
            maxDPR = Config.Grass.mobileDPR;
        }

        // Standardized Base DPR logic: Clamp to [minDPR, maxDPR]
        const minDPR = Config.Grass.minDPR || 0.5;
        const baseDPR = Math.max(minDPR, Math.min(aspect, maxDPR));
        let finalDPR = baseDPR * this.currentScaleDPR;

        // Enforce absolute minimum even after performance scaling
        finalDPR = Math.max(minDPR, finalDPR);

        // Log only if changed significantly to avoid spam, or one-off
        if (Math.abs(this.renderer.getPixelRatio() - finalDPR) > 0.05) {
            console.log(`[Grass] Applying DPR. Mobile: ${isMobile}, ConfigMax: ${Config.Grass.mobileDPR}, Calculated: ${finalDPR.toFixed(2)}`);
        }

        this.applyDPR(finalDPR);
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
        this.layoutGrass();
        this.updatePerformanceConfig(width, height);
    }

    updateGroundToViewport() {
        const isMobile = window.innerWidth < 768;
        const aspect = isMobile ? this.initialAspect : this.camera.aspect;
        this.ground.scale.set(aspect, 1, 1);
    }

    updateScrollState(currentY) {


        const aspect = window.innerWidth / window.innerHeight;
        // Clamp aspect influence for ultrawide fix (so it doesn't move too fast)
        const effectiveAspect = Math.min(aspect, 1.5);

        // Calculate scroll offset based on Normalized units
        this.scrollOffsetNormZ = (currentY * Config.Grass.scrollNormPerPixel) * effectiveAspect;

        // Wrap value to [0,1] for looping
        this.scrollOffsetNormZ = this.scrollOffsetNormZ % 1;

        // OPTIMIZATION: Removed this.applyGrassPositions()
        // We do NOT update 15k matrices on CPU per frame. 
        // The shader uses scrollOffsetNorm and scrollOffsetZ to do it cheaply.

        const planeSize = Config.Grass.planeSize;
        const extentZ = planeSize * this.ground.scale.z;

        this.uniforms.scrollOffsetZ.value = this.scrollOffsetNormZ * extentZ;
        this.uniforms.scrollOffsetNorm.value = this.scrollOffsetNormZ;
        this.uniforms.planeExtent.value.set(planeSize * this.ground.scale.x, extentZ);
    }



    layoutGrass() {
        const planeSize = Config.Grass.planeSize;
        const extentX = planeSize * this.ground.scale.x;
        const extentZ = planeSize * this.ground.scale.z;
        // Use the actual count of instances we created/are using
        const grassCount = this.grass.count;

        for (let i = 0; i < grassCount; i++) {
            const base = this.grassBasePositions[i];
            const x = base.x * extentX;
            // Static Z position relative to the plane center
            // Shader handles the "scroll" offset
            const z = base.z * extentZ;

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
        // Reuse temp vector for direction
        this.tempVec2.set(0, 0);
        const dir = this.tempVec2;

        if (this.isHovering) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hit = this.raycaster.intersectObject(this.ground, false);

            if (hit.length > 0) {
                const p = hit[0].point;
                const planeSize = Config.Grass.planeSize;
                const extentX = planeSize * this.ground.scale.x;
                const extentZ = planeSize * this.ground.scale.z;

                const u = Math.min(Math.max(p.x / extentX + 0.5, 0), 1);
                const v = Math.min(Math.max(p.z / extentZ + 0.5, 0), 1);

                // Still creating one tiny object for API requirement, or we could change WindField API
                // But let's at least avoid the direction creation
                mouseUv = { x: u, y: v }; // Using raw object is cheaper than THREE.Vector2

                if (this.lastGroundPoint) {
                    dir.set(p.x - this.lastGroundPoint.x, p.z - this.lastGroundPoint.z);

                    // CLAMP VELOCITY to avoid "big grass" Glitch
                    // Cap the displacement vector length
                    const maxLen = Config.Grass.bladeHeight * Config.Grass.maxWindOffset;
                    if (dir.length() > maxLen) {
                        dir.setLength(maxLen);
                    }
                } else {
                    // Reuse stored vector
                    this.lastGroundPoint = this.lastGroundPointVec;
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
