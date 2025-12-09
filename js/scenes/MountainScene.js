import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { Config } from '../Config.js';

export class MountainScene {
  // === LIFECYCLE ===

  constructor(renderer) {
    console.log('[Mountain] Constructor called');
    this.renderer = renderer;
    this.scene = new THREE.Scene();

    // Create a root group for all scrolling content
    this.contentGroup = new THREE.Group();
    this.scene.add(this.contentGroup);

    this.snowCount = Config.Mountain.snowCount;
    this.snowArea = Config.Mountain.snowArea;
    this.snowFallSpeed = Config.Mountain.snowFallSpeed || 0.2;
    this.snowSway = Config.Mountain.snowSway || 0.0005;
    this.snowWindX = Config.Mountain.snowWindX || 0.0;
    this.snowWindZ = Config.Mountain.snowWindZ || 0.0;
    this.lightUpdateFrame = 0;

    this.mixer = null;
    this.snowSystem = null;
    this.video = null;

    // Persistent color object (GC Fix)
    this.tempColor = new THREE.Color();
    this.targetColor = new THREE.Color();
    this.pixelBuffer = new Uint8ClampedArray(4 * 4 * 4); // 4x4 RGBA

    // Performance State
    this.perfMonitor = new PerformanceMonitor(
      this.onPerformanceDrop.bind(this)
    );
    this.currentScaleDPR = 1.0;

    this.initCamera();
    this.init();
  }

  init() {
    console.log('[Mountain] init() started');
    this.initBackground();
    this.initScreen();
    this.initLoader();
    this.initSnow();

    // Initial performance setup
    this.updatePerformanceConfig(window.innerWidth, window.innerHeight);
    console.log('[Mountain] init() completed');
  }

  dispose() {
    console.log('[Mountain] dispose() called');
    window.removeEventListener('click', this.resumeVideo);
    window.removeEventListener('touchstart', this.resumeVideo);

    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video.load();
    }

    if (this.screenMesh) {
      this.screenMesh.geometry.dispose();
      this.screenMesh.material.dispose();
    }

    // if (this.lightRT) this.lightRT.dispose();
    // if (this.lightScene) {
    //     this.lightMesh.geometry.dispose();
    //     this.lightMaterial.dispose();
    // }

    if (this.scene.background) this.scene.background.dispose();
  }

  mount() {
    console.log('[Mountain] mount() called');
    window.addEventListener('click', this.resumeVideo, { once: true });
    window.addEventListener('touchstart', this.resumeVideo, { once: true });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.playVideo();
  }

  unmount() {
    console.log('[Mountain] unmount() called');
    window.removeEventListener('click', this.resumeVideo);
    window.removeEventListener('touchstart', this.resumeVideo);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    this.pauseVideo();
  }

  // === INITIALIZATION ===

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 0, 0.65);
  }

  initBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(1, '#aaaaaa');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.bgTexture = new THREE.CanvasTexture(canvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.bgTexture.minFilter = THREE.LinearFilter;
    this.bgTexture.magFilter = THREE.LinearFilter;

    // Replace scene.background (fixed) with a regular Mesh (scrollable)
    // Adjust plane size/position to cover viewport at z=0 (approximately)
    // With FOV 40 and Camera Z 0.65, height at Z=0 is approx 0.47 units
    // We make it slightly larger to be safe.
    const planeH = 2.0;
    const planeW = planeH * (window.innerWidth / window.innerHeight);

    this.bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(planeW, planeH),
      new THREE.MeshBasicMaterial({
        map: this.bgTexture,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    // Push it slightly back so other objects are in front
    this.bgMesh.position.z = -0.5;
    this.contentGroup.add(this.bgMesh);
  }

  initScreen() {
    const screenWidth = Config.Mountain.screenWidth;
    const screenHeight = Config.Mountain.screenHeight;
    const screenLightIntensity = Config.Mountain.screenLightIntensity;

    this.screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.contentGroup.add(this.screenMesh);

    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.src =
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/video/showreel_optimised.mp4';
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.autoplay = true;

    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    this.screenMesh.material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      toneMapped: false,
    });

    this.screenLight = new THREE.RectAreaLight(
      0x808080, // Static Grey Light
      screenLightIntensity,
      screenWidth,
      screenHeight * 2
    );
    this.screenLight.rotation.y = Math.PI;
    this.screenMesh.add(this.screenLight);

    // WEBGL LIGHT SAMPLING - OPTIMIZED
    this.lightSamplerCanvas = document.createElement('canvas');
    this.lightSamplerCanvas.width = 4;
    this.lightSamplerCanvas.height = 4;
    this.lightSamplerCtx = this.lightSamplerCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    this.lastLightUpdate = 0;
    this.lightUpdateInterval = 0.25; // 4 updates per second
  }

  // === SCENE SETUP & UTILS ===

  initLoader() {
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');
    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');

    const mountainTex = texLoader.load(
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/textures/mountain_texture.webp',
      () => {}
    );

    mountainTex.colorSpace = THREE.LinearSRGBColorSpace;
    mountainTex.flipY = false;

    loader.load(
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/models/mountain_export.glb',
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
            obj.material = new THREE.MeshStandardMaterial({
              color: 0x222222,
              roughness: 0.5,
              metalness: 0.8,
              metalnessMap: mountainTex,
              bumpMap: mountainTex,
              bumpScale: -1,
              side: THREE.DoubleSide,
            });
          }
        });

        this.contentGroup.add(root);
      },
      undefined,
      (err) => console.error('[Mountain] Failed to load mountain GLB:', err)
    );
  }

  initSnow() {
    if (window.innerWidth < 768) {
      console.log('[Mountain] Snow disabled on mobile');
      return;
    }

    const snowGeo = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(this.snowCount * 3);
    const snowSpeeds = new Float32Array(this.snowCount);

    for (let i = 0; i < this.snowCount; i++) {
      snowPositions[i * 3 + 0] = (Math.random() - 0.5) * this.snowArea.x;
      snowPositions[i * 3 + 1] = Math.random() * this.snowArea.y;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * this.snowArea.z;
      snowSpeeds[i] = 0.05 + Math.random() * 1;
    }

    snowGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(snowPositions, 3)
    );
    snowGeo.setAttribute('aSpeed', new THREE.BufferAttribute(snowSpeeds, 1));

    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.002,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    this.snow = new THREE.Points(snowGeo, snowMat);
    this.contentGroup.add(this.snow);
    this.snowGeo = snowGeo;
  }

  updatePerformanceConfig(width, height) {
    const aspect = width / height;
    const isMobile = width < 768;

    let maxDPR = 1.0;
    if (isMobile) {
      maxDPR = Config.Grass.mobileDPR;
    }

    // Standardized Base DPR logic
    const minDPR = Config.Grass.minDPR || 0.5;
    const baseDPR = Math.max(minDPR, Math.min(aspect, maxDPR));
    let finalDPR = baseDPR * this.currentScaleDPR;

    // Enforce absolute minimum even after performance scaling
    finalDPR = Math.max(minDPR, finalDPR);

    if (Math.abs(this.renderer.getPixelRatio() - finalDPR) > 0.05) {
      console.log(
        `[Mountain] Applying DPR. Mobile: ${isMobile}, ConfigMax: ${
          Config.Grass.mobileDPR
        }, Calculated: ${finalDPR.toFixed(2)}`
      );
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
    this.updatePerformanceConfig(width, height);
  }

  updateLightFromVideo(dt) {
    if (!this.video || this.video.paused || !this.lightSamplerCtx) return;

    this.lastLightUpdate += dt;
    if (this.lastLightUpdate > this.lightUpdateInterval) {
      this.lastLightUpdate = 0;

      // Draw small 4d frame
      this.lightSamplerCtx.drawImage(this.video, 0, 0, 4, 4);
      const frame = this.lightSamplerCtx.getImageData(0, 0, 4, 4);
      const data = frame.data;

      let r = 0,
        g = 0,
        b = 0;
      const len = data.length;
      const pixelCount = len / 4;

      for (let i = 0; i < len; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }

      // SRGB -> Linear approximation (roughly pow 2.2, but simplified here)
      // Just normalize 0-1
      this.targetColor.setRGB(
        r / pixelCount / 255,
        g / pixelCount / 255,
        b / pixelCount / 255
      );
    }

    // Smooth interpolation for every frame
    const lerpFactor = 5 * dt; // Adjust speed of color change
    this.screenLight.color.lerp(this.targetColor, lerpFactor);
  }

  updateSnow(time, dt) {
    if (!this.snowGeo) return;
    const pos = this.snowGeo.getAttribute('position');
    const spd = this.snowGeo.getAttribute('aSpeed');

    for (let i = 0; i < this.snowCount; i++) {
      let x =
        pos.getX(i) +
        Math.sin(i * 12.9898 + time * 0.5) * this.snowSway +
        this.snowWindX * dt;
      let y = pos.getY(i) - spd.getX(i) * dt * this.snowFallSpeed;
      let z =
        pos.getZ(i) +
        Math.cos(i * 78.233 + time * 0.3) * this.snowSway +
        this.snowWindZ * dt;

      if (y < -this.snowArea.y * 0.5) y = this.snowArea.y * 0.5;
      if (x < -this.snowArea.x * 0.5) x = -this.snowArea.x * 0.5;
      if (x > this.snowArea.x * 0.5) x = this.snowArea.x * 0.5;
      if (z < -this.snowArea.z * 0.5) z = -this.snowArea.z * 0.5;
      if (z > this.snowArea.z * 0.5) z = this.snowArea.z * 0.5;

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  update(time, dt) {
    this.perfMonitor.update(dt);
    this.perfMonitor.update(dt);
    this.updateLightFromVideo(dt);

    this.updateSnow(time, dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // === EVENTS ===

  // === VISIBILITY CONTROL ===

  playVideo() {
    if (this.video && this.video.paused && !document.hidden) {
      this.video.play().catch(() => {});
    }
  }

  pauseVideo() {
    if (this.video && !this.video.paused) {
      this.video.pause();
    }
  }

  handleVisibilityChange = () => {
    if (document.hidden) {
      this.pauseVideo();
    } else {
      // Only resume if we are "active" (mounted and supposedly visible)
      // Ideally main.js controls this, but for tab Switching, if we are effectively active, we resume.
      // But we don't know the exact "mountainVisible" state here easily without observing.
      // Safe fallback: If we are mounted, we assume we might be visible.
      // Better: Let main.js handle the "became visible" logic from its loop,
      // OR checks if video SHOULD be playing.

      // Actually, if we just pause on hide, main.js loop will call playVideo() next frame if visible?
      // No, main.js usually calls methods based on state change.

      if (this.video && this.video.paused) {
        // We rely on external controller or user interaction to resume usually?
        // Let's just try to resume if we are mounted.
        this.playVideo();
      }
    }
  };

  // === EVENTS ===

  resumeVideo = () => {
    this.playVideo();
  };

  updateScroll(scrollY) {
    // approximate visible height conversion
    // At camera Z=0.65, FOV=40:
    // Visible Height = 2 * tan(20deg) * 0.65 ~= 0.473
    // So 1 unit height is window.innerHeight pixels

    // This factor needs to be calibrated visually.
    // If the viewport height is "H" pixels, that maps to ~0.473 world units at distance 0
    // Wait, camera is at 0.65, objects are at 0. Distance is 0.65.
    // h = 2 * 0.65 * tan(20deg) = 1.3 * 0.364 = 0.473

    const visibleHeightAtDist0 = 0.3;
    const scrollRatio = scrollY / window.innerHeight;

    // We move the GROUP UP (positive Y) as we scroll DOWN.
    // Parallax: 100vh scroll -> Move UP by 50vh (0.5 factor)
    // This makes it look like it's scrolling slower than the foreground.
    this.contentGroup.position.y = scrollRatio * visibleHeightAtDist0 * 0.5;
  }
}
