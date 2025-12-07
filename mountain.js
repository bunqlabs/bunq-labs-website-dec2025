import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// === HELPERS ===

class PerformanceMonitor {
  constructor(onDrop) {
    this.onDrop = onDrop;
    this.frames = 0;
    this.timeAccum = 0;
    this.checkInterval = 5.0; // Check every 5s
    this.warmupTime = 3.0; // Ignore first 3s
    this.totalTime = 0;
  }

  update(dt) {
    this.totalTime += dt;
    if (this.totalTime < this.warmupTime) return;

    this.frames++;
    this.timeAccum += dt;

    if (this.timeAccum >= this.checkInterval) {
      const avgFps = this.frames / this.timeAccum;
      if (avgFps < 30) {
        this.onDrop(avgFps);
      }
      // Reset for next interval
      this.frames = 0;
      this.timeAccum = 0;
    }
  }
}

export class MountainScene {
  
  // === LIFECYCLE ===

  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    
    this.snowCount = 1000;
    this.snowArea = { x: 0.5, y: 0.5, z: 0.5 };
    this.lightUpdateFrame = 0;
    
    // Performance State
    this.perfMonitor = new PerformanceMonitor(this.onPerformanceDrop.bind(this));
    this.currentScaleDPR = 1.0;

    this.initCamera();
    this.init();
  }

  init() {
    this.initBackground();
    this.initScreen();
    this.initLoader();
    this.initSnow();
    
    // Initial performance setup
    this.updatePerformanceConfig(window.innerWidth, window.innerHeight);
  }

  dispose() {
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
    
    if (this.scene.background) this.scene.background.dispose();
  }

  mount() {
    window.addEventListener('click', this.resumeVideo, { once: true });
    window.addEventListener('touchstart', this.resumeVideo, { once: true });
    if (this.video && this.video.paused) this.video.play().catch(() => {});
  }

  unmount() {
    window.removeEventListener('click', this.resumeVideo);
    window.removeEventListener('touchstart', this.resumeVideo);
    if (this.video) this.video.pause();
  }

  // === INITIALIZATION ===

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      30,
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
    grad.addColorStop(1, '#555555');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.bgTexture = new THREE.CanvasTexture(canvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.bgTexture.minFilter = THREE.LinearFilter;
    this.bgTexture.magFilter = THREE.LinearFilter;
    this.scene.background = this.bgTexture;
  }

  initScreen() {
    const screenWidth = 0.192;
    const screenHeight = 0.108;
    const screenLightIntensity = 1000;
    
    this.screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.scene.add(this.screenMesh);

    this.video = document.createElement('video');
    this.video.src = './showreel/showreel.mp4';
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.autoplay = true; 
    
    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    this.screenMesh.material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      toneMapped: false,
    });

    this.screenLight = new THREE.RectAreaLight(
      0xffffff,
      screenLightIntensity,
      screenWidth,
      screenHeight * 2
    );
    this.screenLight.rotation.y = Math.PI;
    this.screenMesh.add(this.screenLight);

    this.sampleCanvas = document.createElement('canvas');
    this.sampleW = 16;
    this.sampleH = 9;
    this.sampleCanvas.width = this.sampleW;
    this.sampleCanvas.height = this.sampleH;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    this.sampleCtx.imageSmoothingEnabled = true;
  }

  initLoader() {
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    
    const mountainTex = texLoader.load('./mountain_texture.webp');
    mountainTex.colorSpace = THREE.LinearSRGBColorSpace;
    mountainTex.flipY = false;

    loader.load(
      './mountain_export.glb',
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
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
        this.scene.add(root);
      },
      undefined,
      (err) => console.error('Failed to load mountain GLB:', err)
    );
  }

  initSnow() {
    const snowGeo = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(this.snowCount * 3);
    const snowSpeeds = new Float32Array(this.snowCount);
    
    for (let i = 0; i < this.snowCount; i++) {
        snowPositions[i * 3 + 0] = (Math.random() - 0.5) * this.snowArea.x;
        snowPositions[i * 3 + 1] = Math.random() * this.snowArea.y; 
        snowPositions[i * 3 + 2] = (Math.random() - 0.5) * this.snowArea.z;
        snowSpeeds[i] = 0.05 + Math.random() * 1; 
    }
    
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    snowGeo.setAttribute('aSpeed', new THREE.BufferAttribute(snowSpeeds, 1));
    
    const snowMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.004,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
    });
    
    this.snow = new THREE.Points(snowGeo, snowMat);
    this.scene.add(this.snow);
    this.snowGeo = snowGeo;
  }

  // === PERFORMANCE & UPDATES ===

  updatePerformanceConfig(width, height) {
    const aspect = width / height;

    // Base DPR Logic: min(aspectRatio, 1), with 0.6 floor
    const baseDPR = Math.max(0.6, Math.min(aspect, 1.0));
    
    // Apply current scaling from potential FPS drops
    this.applyDPR(baseDPR * this.currentScaleDPR);
  }

  applyDPR(targetDPR) {
      const dpr = Math.min(window.devicePixelRatio || 1, targetDPR);
      if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) {
          this.renderer.setPixelRatio(dpr);
          console.log(`[Mountain Performance] DPR set to ${dpr.toFixed(2)} (Target: ${targetDPR.toFixed(2)})`);
      }
  }

  onPerformanceDrop(fps) {
      console.warn(`[Mountain Performance] FPS drop detected (${fps.toFixed(1)}). Scaling down DPR.`);
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

    // Update performance settings on resize
    this.updatePerformanceConfig(width, height);
  }

  updateLightFromVideo() {
    if (!this.video || this.video.readyState < 2) return;
    
    this.lightUpdateFrame++;
    if (this.lightUpdateFrame % 10 !== 0) return;

    this.sampleCtx.clearRect(0, 0, this.sampleW, this.sampleH);
    this.sampleCtx.drawImage(this.video, 0, 0, this.sampleW, this.sampleH);
    const data = this.sampleCtx.getImageData(0, 0, this.sampleW, this.sampleH).data;
    
    let r = 0, g = 0, b = 0;
    const count = this.sampleW * this.sampleH;
    
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }
    
    r = r / (255 * count);
    g = g / (255 * count);
    b = b / (255 * count);
    
    const c = new THREE.Color(r, g, b);
    c.convertSRGBToLinear();
    this.screenLight.color.copy(c);
  }

  updateSnow(time, dt) {
    if (!this.snowGeo) return;
    const pos = this.snowGeo.getAttribute('position');
    const spd = this.snowGeo.getAttribute('aSpeed');
    
    for (let i = 0; i < this.snowCount; i++) {
        let x = pos.getX(i) + Math.sin(i * 12.9898 + time * 0.5) * 0.0005;
        let y = pos.getY(i) - spd.getX(i) * dt * 0.2;
        let z = pos.getZ(i) + Math.cos(i * 78.233 + time * 0.3) * 0.0005;
        
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
    this.updateLightFromVideo();
    this.updateSnow(time, dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // === EVENTS ===

  resumeVideo = () => {
    if (this.video) this.video.play().catch(() => {});
  }
}
