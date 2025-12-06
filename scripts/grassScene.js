import * as THREE from "three";

import {
  planeSize,
  grassCount,
  bladeWidth,
  bladeHeight,
  bladeSegments,
  taperFactor,
  initialUniforms,
  cameraConfig,
  conveyorConfig,
} from "../grass/config.js";
import { grassVertexShader, grassFragmentShader } from "../grass/shaders.js";
import {
  loadObjectsFromData,
  updateImportedObjectConveyor,
  objects as objectsData,
} from "../grass/objects.js";
import { WindField } from "../grass/windField.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class GrassScene {
  constructor(container, { stats, guiFolder } = {}) {
    this.container = container;
    this.active = false;
    this.animationId = null;
    this.lastTime = performance.now();
    this.scrollOffsetNormZ = 0;
    this.scrollLoops = conveyorConfig?.loops ?? 4;
    this.stats = stats || null;
    this.guiFolder = guiFolder || null;

    this.scene = new THREE.Scene();
    const aspect = this.getAspect();
    this.camera = new THREE.PerspectiveCamera(
      cameraConfig.fov,
      aspect,
      cameraConfig.near,
      cameraConfig.far
    );
    this.camera.position.set(...cameraConfig.position);
    this.camera.lookAt(...cameraConfig.lookAt);

    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.resizeRenderer();
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.scene.add(this.ground);

    this.grassBasePositions = new Array(grassCount);
    this.dummy = new THREE.Object3D();

    this.createGrass();

    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.mouseUv = new THREE.Vector2(-1, -1);
    this.pointerDir = new THREE.Vector2();
    this.zeroVec = new THREE.Vector2(0, 0);
    this.isHovering = false;
    this.lastGroundPoint = null;
    this.frameCount = 0;

    this.windField = new WindField(
      this.renderer,
      initialUniforms.fieldResolution,
      {
        decay: initialUniforms.trailDecay,
        diffusion: initialUniforms.diffusion,
        advection: initialUniforms.advection,
        injectionRadius: initialUniforms.injectionRadius,
        injectionStrength: initialUniforms.injectionStrength,
        injectionStrengthMax: initialUniforms.injectionStrengthMax,
      }
    );
    this.uniforms.windTex.value = this.windField.texture;

    this.loadSceneObjects();

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerOut = this.handlePointerOut.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pointermove", this.handlePointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerout", this.handlePointerOut);
    window.addEventListener("blur", this.handleWindowBlur);

    this.setupGui();

    this.handleResize();
    this.handleScroll();
  }

  setupGui() {
    if (!this.guiFolder || this.settingsFolder) return;

    this.settingsFolder = this.guiFolder.addFolder("Settings");

    const turbulence = this.settingsFolder.addFolder("Turbulence");
    turbulence
      .add(this.uniforms.turbulenceAmplitude, "value", 0.0, 2.0, 0.1)
      .name("Amplitude");
    turbulence
      .add(this.uniforms.turbulenceFrequency, "value", 0.0, 5.0, 0.1)
      .name("Frequency");
    turbulence
      .add(this.uniforms.damping, "value", 0.0, 2.0, 0.01)
      .name("Damping");

    const wind = this.settingsFolder.addFolder("Wind Field");
    wind
      .add(this.uniforms.windStrength, "value", 0.0, 5.0, 0.05)
      .name("Strength");
    this.debugWind = {
      trailDecay: initialUniforms.trailDecay,
      diffusion: initialUniforms.diffusion,
      advection: initialUniforms.advection,
      injectionRadius: initialUniforms.injectionRadius,
      injectionStrength: initialUniforms.injectionStrength,
    };
    if (this.windField) {
      wind
        .add(this.debugWind, "trailDecay", 0.9, 0.999, 0.001)
        .name("Decay")
        .onChange((v) => this.windField.setParams({ decay: v }));
      wind
        .add(this.debugWind, "diffusion", 0.0, 1.0, 0.01)
        .name("Diffusion")
        .onChange((v) => this.windField.setParams({ diffusion: v }));
      wind
        .add(this.debugWind, "advection", 0.0, 3.0, 0.05)
        .name("Advection")
        .onChange((v) => this.windField.setParams({ advection: v }));
      wind
        .add(this.debugWind, "injectionRadius", 0.005, 0.2, 0.001)
        .name("Brush Radius")
        .onChange((v) => this.windField.setParams({ injectionRadius: v }));
      wind
        .add(this.debugWind, "injectionStrength", 0.1, 5.0, 0.05)
        .name("Brush Strength")
        .onChange((v) => this.windField.setParams({ injectionStrength: v }));
    }

    const camera = this.settingsFolder.addFolder("Camera");
    this.debugCamera = { scrollLoops: this.scrollLoops };
    camera
      .add(this.debugCamera, "scrollLoops", 1, 12, 0.5)
      .name("Scroll Loops")
      .onChange((v) => this.updateScrollLoops(v));

    const glow = this.settingsFolder.addFolder("Glow");
    glow
      .add(this.uniforms.glowThreshold, "value", 0.0, 10.0, 0.1)
      .name("Threshold");
    glow.add(this.uniforms.glowBoost, "value", 0.0, 2.0, 0.05).name("Boost");

    this.guiFolder.close();
  }

  getAspect() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    return clamp(width / Math.max(height, 1), 0.1, 4);
  }

  resizeRenderer() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
  }

  createGrass() {
    const grassGeometry = new THREE.PlaneGeometry(
      bladeWidth,
      bladeHeight,
      1,
      bladeSegments
    );
    const vertices = grassGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      const y = vertices[i + 1];
      if (y > bladeHeight / 2 - 0.001) vertices[i] *= taperFactor;
    }
    grassGeometry.attributes.position.needsUpdate = true;
    grassGeometry.translate(0, bladeHeight / 2, 0);

    const randomSeeds = new Float32Array(grassCount);
    for (let i = 0; i < grassCount; i += 1) randomSeeds[i] = Math.random();
    grassGeometry.setAttribute(
      "aRandomSeed",
      new THREE.InstancedBufferAttribute(randomSeeds, 1)
    );

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

    this.grassMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.DoubleSide,
    });

    this.grass = new THREE.InstancedMesh(
      grassGeometry,
      this.grassMaterial,
      grassCount
    );
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);

    this.populateGrassBasePositions();

    this.applyGrassPositions();
    this.updatePlaneExtentUniform();
    this.updateScrollUniform();
  }

  populateGrassBasePositions() {
    const zSpread = 1 + this.scrollLoops;
    for (let i = 0; i < grassCount; i += 1) {
      const holder = this.grassBasePositions[i] || { x: 0, z: 0, rot: 0 };
      holder.x = Math.random() - 0.5;
      holder.z = Math.random() * zSpread - 0.5;
      holder.rot = Math.random() * Math.PI * 2;
      this.grassBasePositions[i] = holder;
    }
  }

  loadSceneObjects() {
    const remapped = JSON.parse(JSON.stringify(objectsData));
    const prefix = (path) => {
      if (!path) return path;
      if (/^https?:/i.test(path)) return path;
      return `./grass/${path.replace(/^\.\//, "")}`;
    };
    Object.values(remapped).forEach((cfg) => {
      cfg.model_location = prefix(cfg.model_location);
      if (cfg.normal_map_location)
        cfg.normal_map_location = prefix(cfg.normal_map_location);
      if (cfg.shadow_map_location)
        cfg.shadow_map_location = prefix(cfg.shadow_map_location);
    });

    loadObjectsFromData(this.scene, { objects: remapped }).then(() =>
      this.syncImportedObjects()
    );
  }

  updatePlaneExtentUniform() {
    this.uniforms.planeExtent.value.set(
      planeSize * this.ground.scale.x,
      planeSize * this.ground.scale.z
    );
  }

  updateScrollUniform() {
    const extentZ = planeSize * this.ground.scale.z;
    this.uniforms.scrollOffsetZ.value = this.scrollOffsetNormZ * extentZ;
    this.uniforms.scrollOffsetNorm.value = this.scrollOffsetNormZ;
  }

  applyGrassPositions() {
    const extentX = planeSize * this.ground.scale.x;
    const extentZ = planeSize * this.ground.scale.z;
    for (let i = 0; i < grassCount; i += 1) {
      const base = this.grassBasePositions[i];
      const x = base.x * extentX;
      const z = (base.z - this.scrollOffsetNormZ) * extentZ;
      this.dummy.position.set(x, 0, z);
      this.dummy.rotation.y = base.rot;
      this.dummy.updateMatrix();
      this.grass.setMatrixAt(i, this.dummy.matrix);
    }
    this.grass.instanceMatrix.needsUpdate = true;
  }

  syncImportedObjects() {
    updateImportedObjectConveyor(
      this.scrollOffsetNormZ,
      planeSize * this.ground.scale.z
    );
  }

  handleScroll() {
    const scrollable = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1
    );
    const ratio = clamp((window.scrollY || 0) / scrollable, 0, 1);
    this.scrollOffsetNormZ = ratio * this.scrollLoops;
    this.updateScrollUniform();
    this.applyGrassPositions();
    this.syncImportedObjects();
  }

  updateScrollLoops(value) {
    const next = clamp(value, 1, 12);
    if (Math.abs(next - this.scrollLoops) < 1e-6) return;
    this.scrollLoops = next;
    if (this.debugCamera) this.debugCamera.scrollLoops = next;
    this.populateGrassBasePositions();
    this.handleScroll();
  }

  handleResize() {
    const aspect = this.getAspect();
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.resizeRenderer();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ratio = vh > 0 ? vw / vh : 1;
    this.ground.scale.set(ratio, 1, 1);
    this.updatePlaneExtentUniform();
    this.updateScrollUniform();
    this.applyGrassPositions();
    this.syncImportedObjects();
  }

  handlePointerMove(event) {
    this.updatePointerFromEvent(event);
    this.isHovering = true;
  }

  handlePointerOut(event) {
    if (!event.relatedTarget) {
      this.isHovering = false;
      this.lastGroundPoint = null;
      this.mouseUv.set(-1, -1);
    }
  }

  handleWindowBlur() {
    this.isHovering = false;
    this.lastGroundPoint = null;
    this.mouseUv.set(-1, -1);
  }

  updatePointerFromEvent(event) {
    let cx = 0;
    let cy = 0;
    if (event.touches && event.touches.length > 0) {
      cx = event.touches[0].clientX;
      cy = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      cx = event.changedTouches[0].clientX;
      cy = event.changedTouches[0].clientY;
    } else {
      cx = event.clientX || 0;
      cy = event.clientY || 0;
    }
    this.mouse.x = (cx / window.innerWidth) * 2 - 1;
    this.mouse.y = -(cy / window.innerHeight) * 2 + 1;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.lastTime = performance.now();
    this.handleResize();
    this.handleScroll();
    this.renderer.render(this.scene, this.camera);
    this.animationId = requestAnimationFrame(this.animate);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.animate);
    if (this.stats) this.stats.begin();

    const now = performance.now();
    const dt = Math.max((now - this.lastTime) * 0.001, 0.00016);
    this.lastTime = now;
    this.uniforms.time.value += dt;
    this.frameCount += 1;

    const extentX = planeSize * this.ground.scale.x;
    const extentZ = planeSize * this.ground.scale.z;
    this.pointerDir.set(0, 0);
    if (this.isHovering) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = this.raycaster.intersectObject(this.ground, false);
      if (hit.length > 0) {
        const point = hit[0].point;
        const u = clamp(point.x / extentX + 0.5, 0, 1);
        const v = clamp(point.z / extentZ + 0.5, 0, 1);
        this.mouseUv.set(u, v);
        if (this.lastGroundPoint) {
          this.pointerDir.set(
            point.x - this.lastGroundPoint.x,
            point.z - this.lastGroundPoint.z
          );
        }
        if (!this.lastGroundPoint) this.lastGroundPoint = new THREE.Vector3();
        this.lastGroundPoint.copy(point);
      } else {
        this.mouseUv.set(-1, -1);
        this.lastGroundPoint = null;
      }
    } else {
      this.mouseUv.set(-1, -1);
      this.lastGroundPoint = null;
    }

    const hasDir = this.pointerDir.lengthSq() > 1e-6;
    const injectionDir = hasDir ? this.pointerDir : this.zeroVec;
    this.windField.update(
      this.mouseUv.x >= 0 ? this.mouseUv : null,
      injectionDir,
      dt
    );
    this.uniforms.windTex.value = this.windField.texture;

    this.renderer.render(this.scene, this.camera);
    if (this.stats) this.stats.end();
  }
}
