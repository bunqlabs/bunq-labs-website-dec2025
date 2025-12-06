import * as THREE from "three";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import gsap from "https://unpkg.com/gsap@3.12.5/index.js?module";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class MountainScene {
  constructor(container, { stats, guiFolder } = {}) {
    this.container = container;
    this.heroEl = document.getElementById("hero");
    this.stats = stats;
    this.guiFolder = guiFolder;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.resizeRenderer();
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.setGradientBackground();

    const aspect = this.getAspect();
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 2000);
    this.camera.position.set(0, 0, 0.65);
    this.scene.add(this.camera);
    this.baseCameraPosition = this.camera.position.clone();

    this.params = {
      mouseInfluence: 0.03,
      scrollInfluence: 0.2,
      bloomStrength: 0.2,
      bloomRadius: 4,
      bloomThreshold: 0.01,
      snowSpeed: 1,
    };

    this.setupScreen();
    this.setupVideo();
    this.setupSnow();

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        this.container.clientWidth,
        this.container.clientHeight
      ),
      this.params.bloomStrength,
      this.params.bloomRadius,
      this.params.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);

    this.mouseOffset = new THREE.Vector2(0, 0);
    this.scrollOffsetY = 0;

    this.clock = new THREE.Clock();
    this.active = false;
    this.animationId = null;

    this.setupGui();

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onScroll = this.onScroll.bind(this);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("scroll", this.onScroll, { passive: true });

    this.onScroll();
  }

  setGradientBackground() {
    if (this.bgTexture) this.bgTexture.dispose();
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#000000");
    grad.addColorStop(1, "#777777");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.bgTexture = new THREE.CanvasTexture(canvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.bgTexture.minFilter = THREE.LinearFilter;
    this.bgTexture.magFilter = THREE.LinearFilter;
    this.scene.background = this.bgTexture;
  }

  setupGui() {
    if (!this.guiFolder) return;
    if (this.settingsFolder) return;
    this.settingsFolder = this.guiFolder.addFolder("Settings");
    const settings = this.settingsFolder;
    const cameraFolder = settings.addFolder("Camera");
    cameraFolder
      .add(this.params, "mouseInfluence", 0, 0.12, 0.005)
      .name("Mouse Influence");
    cameraFolder
      .add(this.params, "scrollInfluence", 0, 0.5, 0.01)
      .name("Scroll Influence");

    const bloomFolder = settings.addFolder("Bloom");
    bloomFolder
      .add(this.params, "bloomStrength", 0, 1, 0.01)
      .name("Strength")
      .onChange((v) => (this.bloomPass.strength = v));
    bloomFolder
      .add(this.params, "bloomRadius", 0, 10, 0.1)
      .name("Radius")
      .onChange((v) => (this.bloomPass.radius = v));
    bloomFolder
      .add(this.params, "bloomThreshold", 0, 0.3, 0.005)
      .name("Threshold")
      .onChange((v) => (this.bloomPass.threshold = v));

    const snowFolder = settings.addFolder("Snow");
    snowFolder.add(this.params, "snowSpeed", 0.2, 2, 0.05).name("Fall Speed");

    this.guiFolder.close();
  }

  setupScreen() {
    const width = 0.192;
    const height = 0.108;
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.scene.add(this.screen);

    this.screenLight = new THREE.RectAreaLight(
      0xffffff,
      1000,
      width,
      height * 2
    );
    this.screenLight.rotation.y = Math.PI;
    this.screen.add(this.screenLight);
  }

  setupVideo() {
    this.video = document.createElement("video");
    this.video.src = "./mountain/showreel/showreel-copy.mp4";
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.autoplay = true;
    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;
    this.screen.material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      toneMapped: false,
    });

    const resume = () => this.video.play().catch(() => {});
    window.addEventListener("click", resume, { once: true, passive: true });
    window.addEventListener("touchstart", resume, {
      once: true,
      passive: true,
    });

    this.loader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    const mountainTex = this.textureLoader.load(
      "./mountain/mountain_texture.webp"
    );
    if ("colorSpace" in mountainTex) {
      mountainTex.colorSpace = THREE.LinearSRGBColorSpace;
    }
    mountainTex.flipY = false;

    this.loader.load(
      "./mountain/mountain_export.glb",
      (gltf) => {
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) return;
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.material = new THREE.MeshStandardMaterial({
              color: 0x222222,
              roughness: 0.5,
              metalness: 0.85,
              metalnessMap: mountainTex,
              bumpMap: mountainTex,
              bumpScale: 2,
              side: THREE.DoubleSide,
            });
          }
        });
        this.scene.add(root);
      },
      undefined,
      (error) => console.error("Failed to load mountain model", error)
    );

    this.sampleCanvas = document.createElement("canvas");
    this.sampleCanvas.width = 16;
    this.sampleCanvas.height = 9;
    this.sampleContext = this.sampleCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.sampleContext.imageSmoothingEnabled = true;

    const updateLight = () => {
      if (
        !this.video.videoWidth ||
        !this.video.videoHeight ||
        this.video.readyState < 2
      )
        return;
      this.sampleContext.drawImage(
        this.video,
        0,
        0,
        this.sampleCanvas.width,
        this.sampleCanvas.height
      );
      const data = this.sampleContext.getImageData(
        0,
        0,
        this.sampleCanvas.width,
        this.sampleCanvas.height
      ).data;
      const count = this.sampleCanvas.width * this.sampleCanvas.height;
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const color = new THREE.Color(
        r / (255 * count),
        g / (255 * count),
        b / (255 * count)
      );
      color.convertSRGBToLinear();
      this.screenLight.color.copy(color);
    };

    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      const onFrame = () => {
        updateLight();
        this.video.requestVideoFrameCallback(onFrame);
      };
      this.video.addEventListener("play", () =>
        this.video.requestVideoFrameCallback(onFrame)
      );
    } else {
      this.video.addEventListener("play", () =>
        window.setInterval(updateLight, 33)
      );
    }
  }

  setupSnow() {
    const snowCount = 500;
    const area = { x: 0.5, y: 0.5, z: 0.5 };
    this.snowArea = area;
    this.snowGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(snowCount * 3);
    const speeds = new Float32Array(snowCount);
    for (let i = 0; i < snowCount; i += 1) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * area.x;
      positions[i * 3 + 1] = Math.random() * area.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * area.z;
      speeds[i] = 0.05 + Math.random() * 5;
    }
    this.snowGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.snowGeometry.setAttribute(
      "aSpeed",
      new THREE.BufferAttribute(speeds, 1)
    );
    this.snowPoints = new THREE.Points(
      this.snowGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.004,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
      })
    );
    this.scene.add(this.snowPoints);
  }

  getAspect() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    return clamp(width / Math.max(height, 1), 0.1, 3);
  }

  resizeRenderer() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.clock.getDelta();
    this.video.play().catch(() => {});
    this.animationId = requestAnimationFrame(this.animate);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.video.pause();
  }

  animate() {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.animate);
    if (this.stats) this.stats.begin();

    const dt = this.clock.getDelta();
    this.camera.lookAt(0, 0, 0);
    this.updateSnow(dt);

    this.composer.render();
    if (this.stats) this.stats.end();
  }

  updateSnow(dt) {
    const positions = this.snowGeometry.getAttribute("position");
    const speeds = this.snowGeometry.getAttribute("aSpeed");
    const time = performance.now() * 0.001;
    for (let i = 0; i < speeds.count; i += 1) {
      let x = positions.getX(i) + Math.sin(i * 12.9898 + time * 0.5) * 0.0005;
      let y =
        positions.getY(i) - speeds.getX(i) * dt * 0.2 * this.params.snowSpeed;
      let z = positions.getZ(i) + Math.cos(i * 78.233 + time * 0.3) * 0.0005;
      if (y < -this.snowArea.y * 0.5) y = this.snowArea.y * 0.5;
      x = clamp(x, -this.snowArea.x * 0.5, this.snowArea.x * 0.5);
      z = clamp(z, -this.snowArea.z * 0.5, this.snowArea.z * 0.5);
      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = clamp(width / Math.max(height, 1), 0.1, 3);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  onMouseMove(event) {
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = (event.clientY / window.innerHeight) * 2 - 1;
    this.mouseOffset.set(nx, -ny);
    this.updateCameraFromOffsets();
  }

  onScroll() {
    const heroHeight = this.heroEl?.clientHeight || window.innerHeight;
    const progress = clamp(
      (window.scrollY || 0) / Math.max(heroHeight, 1),
      0,
      1
    );
    this.scrollOffsetY = -this.params.scrollInfluence * progress;
    this.updateCameraFromOffsets();
  }

  updateCameraFromOffsets() {
    const targetX =
      this.baseCameraPosition.x +
      this.mouseOffset.x * this.params.mouseInfluence;
    const targetY =
      this.baseCameraPosition.y +
      this.mouseOffset.y * this.params.mouseInfluence +
      this.scrollOffsetY;
    gsap.to(this.camera.position, {
      x: targetX,
      y: targetY,
      duration: 0.3,
      ease: "power2.out",
      overwrite: true,
    });
  }
}
