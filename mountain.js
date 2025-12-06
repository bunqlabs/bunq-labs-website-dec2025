import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import stats from 'three/addons/libs/stats.module.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export class MountainScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    
    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      30,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 0, 0.65);
    // Base position for parallax
    this.baseCam = this.camera.position.clone();

    // --- Controls ---
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.enabled = false;

    // --- State ---
    this.mouseOffsetX = 0;
    this.mouseOffsetY = 0;
    this.scrollOffsetY = 0;
    this.snowCount = 1000;
    this.snowArea = { x: 0.5, y: 0.5, z: 0.5 };
    
    this.init();
  }

  init() {
    this.initBackground();
    this.initScreen();
    this.initPostProcessing();
    this.initLoader();
    this.initSnow();
  }

  initBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#000000'); // grey
    grad.addColorStop(1, '#555555'); // black
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.bgTexture = new THREE.CanvasTexture(canvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.bgTexture.minFilter = THREE.LinearFilter;
    this.bgTexture.magFilter = THREE.LinearFilter;
    this.scene.background = this.bgTexture;
  }

  initScreen() {
    // Light plane
    const screenWidth = 0.192;
    const screenHeight = 0.108;
    const screenLightIntensity = 1000;
    
    this.screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.scene.add(this.screenMesh);

    // Video Texture
    this.video = document.createElement('video');
    this.video.src = './showreel/showreel.mp4';
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.autoplay = true; // Auto-play attempt
    
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

    // Video Sampling Canvas
    this.sampleCanvas = document.createElement('canvas');
    this.sampleW = 16;
    this.sampleH = 9;
    this.sampleCanvas.width = this.sampleW;
    this.sampleCanvas.height = this.sampleH;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    this.sampleCtx.imageSmoothingEnabled = true;
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3, // strength
      3, // radius
      0.01 // threshold
    );
    this.composer.addPass(this.bloomPass);
    
    // Note: If using newer Three.js, we might strictly need OutputPass for tone mapping
    // But since mountain.js manually set toneMapping on renderer, 
    // and Config passes usually handle it, let's stick to simple bloom for now 
    // to match original logic, or add OutputPass if needed. 
    // Original script didn't use OutputPass but set renderer.toneMapping. 
    // EffectComposer overrides renderer output, so we should be careful.
    // For now, mirroring original setup: Render + Bloom.
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

  // --- Logic ---

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    // updateScrollOffset logic is internal
  }

  updateLightFromVideo() {
    if (!this.video || this.video.readyState < 2) return;
    
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

  updateCamera() {
    // GSAP animation would be here if trigged strictly by events,
    // but we can just interpolate manually or use GSAP if we kept the import.
    // Original used GSAP. We imported GSAP, so we can use it.
    const targetX = this.baseCam.x + this.mouseOffsetX;
    const targetY = this.baseCam.y + this.mouseOffsetY + this.scrollOffsetY;
    
    gsap.to(this.camera.position, {
        x: targetX,
        y: targetY,
        duration: 0.1, // smoothed
        overwrite: true,
        ease: 'power2.out',
    });
    this.camera.lookAt(0, 0, 0);
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
    this.controls.update();
    this.updateLightFromVideo();
    this.updateSnow(time, dt);
    this.updateCamera(); // Sync camera with GSAP/Offsets
  }

  render() {
    this.composer.render();
  }

  // --- Events ---

  mount() {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('click', this.resumeVideo, { once: true });
    window.addEventListener('touchstart', this.resumeVideo, { once: true });
    if (this.video && this.video.paused) this.video.play().catch(() => {});
    
    // Initial sync
    this.onScroll();
  }

  unmount() {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('scroll', this.onScroll);
    if (this.video) this.video.pause();
  }

  onMouseMove = (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    this.mouseOffsetX = nx * 0.03;
    this.mouseOffsetY = -ny * 0.03;
  }

  onScroll = () => {
    // Assuming 100vh hero height for parallax calc
    const heroH = window.innerHeight; 
    const progress = Math.max(0, Math.min(1, window.scrollY / heroH));
    this.scrollOffsetY = -0.2 * progress;
  }

  resumeVideo = () => {
    if (this.video) this.video.play().catch(() => {});
  }

  dispose() {
      // Inputs
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('click', this.resumeVideo);
      window.removeEventListener('touchstart', this.resumeVideo);
      
      // Video
      if (this.video) {
          this.video.pause();
          this.video.src = '';
          this.video.load();
      }
      
      // Objects
      if (this.screenMesh) {
          this.screenMesh.geometry.dispose();
          this.screenMesh.material.dispose();
      }
      
      // Post-processing
      if (this.composer) {
          // Dispose passes if they have methods (EffectComposer passes usually don't have standard dispose, 
          // but we can clear the render targets)
          this.composer.renderTarget1.dispose();
          this.composer.renderTarget2.dispose();
      }
      
      // Scene
      if (this.scene.background) this.scene.background.dispose();
  }
}
