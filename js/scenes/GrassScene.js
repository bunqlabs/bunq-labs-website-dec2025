import * as THREE from 'three';
import { WindField } from '../components/WindField.js';
import { Config } from '../settings.js';

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
  
  // Clumping Uniforms
  uniform float uClumpSpread;

  attribute float aRandomSeed;
  attribute vec2 aBladeOffset; // Offset of this blade within the clump

  varying float vHeight;
  varying float vRandomSeed;
  varying float vGlow;

  // Rotation Matrix function
  mat2 rotate2d(float angle) {
      return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  }

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
    
    // 1. Apply Clump Spread (xy offset)
    // We apply this BEFORE bending so the blade stays rooted relative to its offset
    pos.x += aBladeOffset.x * uClumpSpread;
    pos.z += aBladeOffset.y * uClumpSpread;

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

    vec3 glowColor = vec3(0.6, 0.6, 0.6);
    vec3 color = baseColor + vGlow * glowColor;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// === SCENE CLASS ===

export class GrassScene {
  // === LIFECYCLE ===

  constructor(renderer, qualityManager) {
    this.renderer = renderer;
    this.qm = qualityManager;

    this.scene = new THREE.Scene();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isHovering = false;
    this.lastGroundPoint = null;

    // Scroll Smoothing
    this.targetScrollY = 0;
    this.currentScrollY = 0;
    this.scrollOffsetNormZ = 0;

    // Grass Data
    this.grassBasePositions = [];

    // Pre-allocated temporaries
    this.tempVec2 = new THREE.Vector2();
    this.tempVec3 = new THREE.Vector3();
    this.lastGroundPointVec = new THREE.Vector3();

    this.currentScaleDPR = 1.0;

    // Config values (set by QualityManager)
    this.maxGrassCount = Config.Grass.maxGrassCount;
    this.windResolution = 256;

    this.initCamera();
    this.init();
  }

  init() {
    this.initSystems();
    // OPTIMIZATION: Defer initGrass & layoutGrass until onQualityChange
    // This prevents building with default settings then immediately rebuilding
    // with correct Quality settings, which causes a CPU spike during load.
    this.updateGroundToViewport();

    // Subscribe to quality changes
    if (this.qm) {
      this.qm.subscribe(this.onQualityChange.bind(this));
    }
  }

  onQualityChange(profile) {
    console.log('[GrassScene] Quality update:', profile.tier);

    // 0. Enable/Disable
    this.isEnabled = profile.enableGrass !== false; // Default to true if undefined
    if (this.grass) {
      this.grass.visible = this.isEnabled;
    }

    if (!this.isEnabled) return; // Skip other updates if disabled

    // 1. Update Grass Count & Geometry (if Clump Size Changed)
    // NOTE: Changing clump size requires rebuilding the geometry
    const newClumpSize = profile.clumpSize || 10;
    const needRebuild = this.currentClumpSize !== newClumpSize;

    // Store for next time
    this.currentClumpSize = newClumpSize;

    // Use profile spread directly
    if (this.uniforms && this.uniforms.uClumpSpread) {
      this.uniforms.uClumpSpread.value = profile.clumpSpread || 3.0;
    }

    if (needRebuild) {
      console.log(
        '[GrassScene] Clump Size changed to',
        newClumpSize,
        '- Rebuilding Geometry...'
      );
      // Clean up old mesh
      if (this.grass) {
        this.scene.remove(this.grass);
        this.grass.geometry.dispose();
        // Material can be reused usually, but let's be safe if shader defines change (they don't here)
      }
      // Re-run init
      this.initGrass();
      // CRITICAL: Must re-layout instances, otherwise they all stack at (0,0,0)
      this.layoutGrass();
    } else if (this.grass) {
      // Just update count if geometry didn't change
      const targetTotalBlades = Math.min(
        profile.grassCount,
        this.maxGrassCount
      );
      const targetClumps = Math.floor(
        targetTotalBlades / this.currentClumpSize
      );
      this.grass.count = targetClumps;
    }

    // 2. Update Wind Resolution (Requires Re-init if changed)
    if (this.windResolution !== profile.windResolution) {
      this.windResolution = profile.windResolution;
      this.reinitWind(profile.windResolution);
    }

    // 2. Update Wind Resolution (Requires Re-init if changed)
    if (this.windResolution !== profile.windResolution) {
      this.windResolution = profile.windResolution;
      this.reinitWind(profile.windResolution);
    }

    // 3. Update DPR
    this.targetDPR = profile.maxDPR;
    this.applyDPR(profile.maxDPR);

    // 4. Toggle Shadows (if implemented)
    // this.grass.castShadow = profile.shadows;
  }

  reinitWind(resolution) {
    if (this.windField) {
      this.windField.dispose();
    }

    const u = Config.Grass.uniforms;
    this.windField = new WindField(this.renderer, resolution, {
      decay: u.decay,
      diffusion: u.diffusion,
      advection: u.advection,
      injectionRadius: u.injectionRadius,
      injectionStrength: u.injectionStrength,
      injectionStrengthMax: u.injectionStrengthMax,
    });

    if (this.uniforms) {
      this.uniforms.windTex.value = this.windField.texture;
    }
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
    window.addEventListener('pointermove', this.onPointerMove, {
      capture: true,
    });
    window.addEventListener('touchstart', this.onTouchMove, { capture: true });
    window.addEventListener('touchmove', this.onTouchMove, { capture: true });
    window.addEventListener('pointerout', this.onPointerOut);
  }

  unmount() {
    window.removeEventListener('pointermove', this.onPointerMove, {
      capture: true,
    });
    window.removeEventListener('pointerout', this.onPointerOut);
    window.removeEventListener('touchstart', this.onTouchMove, {
      capture: true,
    });
    window.removeEventListener('touchmove', this.onTouchMove, {
      capture: true,
    });
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
      uClumpSpread: { value: 0.5 }, // Default
    };

    // Use dynamic resolution from QualityManager
    const simRes = this.windResolution;

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
    // Default if not set yet (e.g. first init)
    if (!this.currentClumpSize) this.currentClumpSize = 10;

    console.log(
      '[Grass] initGrass() with Clumping started. Size:',
      this.currentClumpSize
    );
    const bladeWidth = Config.Grass.bladeWidth;
    const bladeHeight = Config.Grass.bladeHeight;
    const bladeSegments = Config.Grass.bladeSegments;
    const taperFactor = Config.Grass.taperFactor;
    const clumpSize = this.currentClumpSize;

    // --- 1. Base Single Blade Geometry ---
    const baseBladeGeo = new THREE.PlaneGeometry(
      bladeWidth,
      bladeHeight,
      1,
      bladeSegments
    );
    // Taper
    const verts = baseBladeGeo.attributes.position.array;
    for (let i = 0; i < verts.length; i += 3) {
      if (verts[i + 1] > bladeHeight / 2 - 0.001) {
        verts[i] *= taperFactor;
      }
    }
    baseBladeGeo.attributes.position.needsUpdate = true;
    baseBladeGeo.translate(0, bladeHeight / 2, 0); // Pivot at bottom

    // --- 2. Create Merged Clump Geometry ---
    const bladeGeometries = [];

    for (let i = 0; i < clumpSize; i++) {
      // Clone base
      const blade = baseBladeGeo.clone();

      // Random Rotation around Y (baked)
      const rot = Math.random() * Math.PI * 2;
      blade.rotateY(rot);

      // Blade Offset (stored in attribute)
      // We generate a random offset in circle
      const r = 0.5 * Math.sqrt(Math.random()); // Radius 0.5 approx
      const theta = Math.random() * 2 * Math.PI;
      const ox = r * Math.cos(theta);
      const oz = r * Math.sin(theta);

      // Add attribute to this blade's geometry
      const count = blade.attributes.position.count;
      const offsets = new Float32Array(count * 2);
      for (let k = 0; k < count; k++) {
        offsets[k * 2 + 0] = ox;
        offsets[k * 2 + 1] = oz;
      }
      blade.setAttribute('aBladeOffset', new THREE.BufferAttribute(offsets, 2));

      bladeGeometries.push(blade);
    }

    // Merge all blades into one geometry
    // Note: mergeBufferGeometries comes from 'three/addons/utils/BufferGeometryUtils.js'
    // But since we are in vanilla JS modules without import map for utils often,
    // we can manual merge OR use the loop to construct a single geometry from scratch.

    // Manual merge is safer given our import setup:
    const mergedGeo = new THREE.BufferGeometry();
    // Calculate total counts
    let totalVerts = 0;
    let totalIndices = 0;
    bladeGeometries.forEach((g) => {
      totalVerts += g.attributes.position.count;
      totalIndices += g.index.count;
    });

    const mergedPos = new Float32Array(totalVerts * 3);
    const mergedOffset = new Float32Array(totalVerts * 2);
    const mergedUV = new Float32Array(totalVerts * 2);
    const mergedIndex = new Uint16Array(totalIndices); // 16-bit sufficient? yes

    let vOffset = 0;
    let iOffset = 0;

    bladeGeometries.forEach((g) => {
      const p = g.attributes.position.array;
      const o = g.attributes.aBladeOffset.array;
      const uv = g.attributes.uv.array;
      const idx = g.index.array;
      const count = g.attributes.position.count;

      // Copy attributes
      mergedPos.set(p, vOffset * 3);
      mergedOffset.set(o, vOffset * 2);
      mergedUV.set(uv, vOffset * 2);

      // Copy indices (adjusted)
      for (let j = 0; j < idx.length; j++) {
        mergedIndex[iOffset + j] = idx[j] + vOffset;
      }

      vOffset += count;
      iOffset += idx.length;
    });

    mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    mergedGeo.setAttribute(
      'aBladeOffset',
      new THREE.BufferAttribute(mergedOffset, 2)
    );
    mergedGeo.setAttribute('uv', new THREE.BufferAttribute(mergedUV, 2));
    mergedGeo.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
    mergedGeo.computeVertexNormals();

    const isMobile = window.innerWidth < 768;
    const maxTotalBlades = isMobile
      ? Config.Grass.mobileMaxGrassCount
      : Config.Grass.maxGrassCount;

    const maxClumpCount = Math.ceil(maxTotalBlades / clumpSize);

    console.log(
      `[Grass Init] Clumping: Size=${clumpSize}, TotalBlades=${maxTotalBlades}, ClumpInstances=${maxClumpCount}`
    );

    const randomSeeds = new Float32Array(maxClumpCount);
    for (let i = 0; i < maxClumpCount; i++) randomSeeds[i] = Math.random();
    mergedGeo.setAttribute(
      'aRandomSeed',
      new THREE.InstancedBufferAttribute(randomSeeds, 1)
    );

    const grassMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.DoubleSide,
    });

    this.grass = new THREE.InstancedMesh(
      mergedGeo,
      grassMaterial,
      maxClumpCount
    );
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);

    this.grassBasePositions = new Array(maxClumpCount);
    for (let i = 0; i < maxClumpCount; i++) {
      // Clumps are placed randomly
      this.grassBasePositions[i] = {
        x: Math.random() - 0.5,
        z: Math.random() - 0.5,
        rot: Math.random() * Math.PI * 2,
      };
    }
    this.dummy = new THREE.Object3D();
  }

  updatePerformanceConfig(width, height) {
    // Deprecated by QualityManager, but kept for resize updates if needed
    // We just re-apply current quality DPR logic here if we were using dynamic scaling
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
    // this.updatePerformanceConfig(width, height); // Deprecated
  }

  updateGroundToViewport() {
    const isMobile = window.innerWidth < 768;
    const aspect = isMobile ? this.initialAspect : this.camera.aspect;
    this.ground.scale.set(aspect, 1, 1);
  }

  updateScrollState(scrollY) {
    // Just store target, we smooth in update()
    this.targetScrollY = scrollY;
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
    // 1. Scroll Sync (Direct Lenis Value)
    // We removed the manual lerp to prevent "double smoothing" lag.
    this.currentScrollY = this.targetScrollY;

    // 2. Apply Scroll to Uniforms
    const aspect = window.innerWidth / window.innerHeight;
    const effectiveAspect = Math.min(aspect, 1.5);

    this.scrollOffsetNormZ =
      this.currentScrollY * Config.Grass.scrollNormPerPixel * effectiveAspect;
    this.scrollOffsetNormZ = this.scrollOffsetNormZ % 1;

    const planeSize = Config.Grass.planeSize;
    const extentZ = planeSize * this.ground.scale.z;

    this.uniforms.scrollOffsetZ.value = this.scrollOffsetNormZ * extentZ;
    this.uniforms.scrollOffsetNorm.value = this.scrollOffsetNormZ;
    this.uniforms.planeExtent.value.set(
      planeSize * this.ground.scale.x,
      extentZ
    );

    // 3. System Updates
    this.uniforms.time.value = time;
    // this.perfMonitor.update(dt); // Handled globally now

    let mouseUv = null;
    this.tempVec2.set(0, 0);
    const dir = this.tempVec2;

    if (this.isHovering) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = this.raycaster.intersectObject(this.ground, false);

      if (hit.length > 0) {
        const p = hit[0].point;
        const extentX = planeSize * this.ground.scale.x;
        const extentZReal = planeSize * this.ground.scale.z; // Renovated var name to avoid conflict

        const u = Math.min(Math.max(p.x / extentX + 0.5, 0), 1);
        const v = Math.min(Math.max(p.z / extentZReal + 0.5, 0), 1);

        mouseUv = { x: u, y: v };

        if (this.lastGroundPoint) {
          dir.set(p.x - this.lastGroundPoint.x, p.z - this.lastGroundPoint.z);
          const maxLen = Config.Grass.bladeHeight * Config.Grass.maxWindOffset;
          if (dir.length() > maxLen) {
            dir.setLength(maxLen);
          }
        } else {
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
    // Disable interaction on mobile/tablet (Portrait & Landscape)
    if (window.innerWidth <= 1024) return;

    const t =
      (e.touches && e.touches[0]) ||
      (e.changedTouches && e.changedTouches[0]) ||
      e;
    this.updateMousePosition(t.clientX, t.clientY);
  };

  onTouchMove = (e) => {
    // Disable interaction on mobile/tablet
    if (window.innerWidth <= 1024) return;

    const t = e.touches[0];
    if (t) {
      this.updateMousePosition(t.clientX, t.clientY);
    }
  };

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
  };
}
