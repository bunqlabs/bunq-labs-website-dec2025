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

        this.snowCount = Config.Mountain.snowCount;
        this.snowArea = Config.Mountain.snowArea;
        this.lightUpdateFrame = 0;

        this.mixer = null;
        this.snowSystem = null;
        this.video = null;

        // Persistent color object (GC Fix)
        this.tempColor = new THREE.Color();
        this.pixelBuffer = new Uint8Array(4); // For reading 1 pixel from RT

        // Performance State
        this.perfMonitor = new PerformanceMonitor(this.onPerformanceDrop.bind(this));
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

        if (this.lightRT) this.lightRT.dispose();
        if (this.lightScene) {
            this.lightMesh.geometry.dispose();
            this.lightMaterial.dispose();
        }

        if (this.scene.background) this.scene.background.dispose();
    }

    mount() {
        console.log('[Mountain] mount() called');
        window.addEventListener('click', this.resumeVideo, { once: true });
        window.addEventListener('touchstart', this.resumeVideo, { once: true });
        if (this.video && this.video.paused) this.video.play().catch(() => { });
    }

    unmount() {
        console.log('[Mountain] unmount() called');
        window.removeEventListener('click', this.resumeVideo);
        window.removeEventListener('touchstart', this.resumeVideo);
        if (this.video) this.video.pause();
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
        const screenWidth = Config.Mountain.screenWidth;
        const screenHeight = Config.Mountain.screenHeight;
        const screenLightIntensity = Config.Mountain.screenLightIntensity;

        this.screenMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(screenWidth, screenHeight),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        this.scene.add(this.screenMesh);

        this.video = document.createElement('video');
        this.video.src = './assets/video/showreel.mp4';
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
            0xffffff,
            screenLightIntensity,
            screenWidth,
            screenHeight * 2
        );
        this.screenLight.rotation.y = Math.PI;
        this.screenMesh.add(this.screenLight);

        // WEBGL LIGHT SAMPLING SETUP (Replaces Canvas2D)
        // We render the video to a tiny 1x1 render target to average the colors via cheap mipmapping (linear filter)
        this.lightRT = new THREE.WebGLRenderTarget(1, 1, {
            type: THREE.UnsignedByteType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        });

        this.lightScene = new THREE.Scene();
        this.lightCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.lightMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture });
        this.lightMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lightMaterial);
        this.lightScene.add(this.lightMesh);
    }

    // === SCENE SETUP & UTILS ===

    initLoader() {
        const loader = new GLTFLoader();
        const texLoader = new THREE.TextureLoader();

        const mountainTex = texLoader.load('./assets/textures/mountain_texture.webp', () => { });

        mountainTex.colorSpace = THREE.LinearSRGBColorSpace;
        mountainTex.flipY = false;

        loader.load(
            './assets/models/mountain_export.glb',
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
                this.scene.add(root);
            },
            undefined,
            (err) => console.error('[Mountain] Failed to load mountain GLB:', err)
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

    updatePerformanceConfig(width, height) {
        const aspect = width / height;
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
        this.updatePerformanceConfig(width, height);
    }

    updateLightFromVideo(dt) {
        if (!this.video || this.video.readyState < 2) return;

        // Skip if laggy
        if (dt > Config.Mountain.lightUpdateSkipThreshold) return;

        this.lightUpdateFrame++;
        if (this.lightUpdateFrame % 10 !== 0) return;

        // 1. Save current state
        const prevRT = this.renderer.getRenderTarget();
        const prevXR = this.renderer.xr.enabled;
        this.renderer.xr.enabled = false; // Disable XR for safe separate render

        // 2. Render video to 1x1 RT
        this.renderer.setRenderTarget(this.lightRT);
        this.renderer.render(this.lightScene, this.lightCamera);

        // 3. Read the single pixel
        this.renderer.readRenderTargetPixels(this.lightRT, 0, 0, 1, 1, this.pixelBuffer);

        // 4. Restore state
        this.renderer.setRenderTarget(prevRT);
        this.renderer.xr.enabled = prevXR;

        // Calculate color (normalized)
        const r = this.pixelBuffer[0] / 255;
        const g = this.pixelBuffer[1] / 255;
        const b = this.pixelBuffer[2] / 255;

        this.tempColor.setRGB(r, g, b);
        this.tempColor.convertSRGBToLinear();
        this.screenLight.color.copy(this.tempColor);
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
        this.updateLightFromVideo(dt);
        this.updateSnow(time, dt);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // === EVENTS ===

    resumeVideo = () => {
        if (this.video) this.video.play().catch(() => { });
    }
}
