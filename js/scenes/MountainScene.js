import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Config } from '../settings.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

export class MountainScene {
  // === LIFECYCLE ===

  constructor(renderer, qualityManager) {
    console.log('[Mountain] Constructor called');
    this.renderer = renderer;
    this.qm = qualityManager;
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

    // Snow Uniforms
    this.snowUniforms = {
      time: { value: 0 },
      area: { value: new THREE.Vector3(this.snowArea.x, this.snowArea.y, this.snowArea.z) },
      fallSpeed: { value: this.snowFallSpeed },
      sway: { value: this.snowSway },
      wind: { value: new THREE.Vector3(this.snowWindX, 0, this.snowWindZ) }
    };


    this.mixer = null;
    this.snowSystem = null;
    this.video = null;

    // Persistent color object (GC Fix)
    this.tempColor = new THREE.Color();
    this.targetColor = new THREE.Color();
    this.pixelBuffer = new Uint8ClampedArray(4 * 4 * 4); // 4x4 RGBA

    // Performance State
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

    // Subscribe
    if (this.qm) {
      this.qm.subscribe(this.onQualityChange.bind(this));
    }

    console.log('[Mountain] init() completed');
  }

  onQualityChange(profile) {
    // 1. Update DPR
    this.targetDPR = profile.maxDPR;
    this.applyDPR(profile.maxDPR);

    // 2. Adjust Snow Count (Simulated via DrawRange)
    if (this.snow && this.snow.geometry) {
      // Scale snow count by quality tier roughly
      let ratio = 1.0;
      if (profile.tier === 'LOW') ratio = 0.5;
      if (profile.tier === 'POTATO') ratio = 0.0;

      const drawCount = Math.floor(this.snowCount * ratio);
      this.snow.geometry.setDrawRange(0, drawCount);
      this.snow.visible = drawCount > 0;
    }
  }

  dispose() {
    console.log('[Mountain] dispose() called');
    window.removeEventListener('click', this.resumeVideo);
    window.removeEventListener('touchstart', this.resumeVideo);

    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video.load();
      if (this.video.parentNode) {
          this.video.parentNode.removeChild(this.video);
      }
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
    const isMobile = window.innerWidth < 768;
    const fov = isMobile
      ? Config.Mountain.cameraFovMobile
      : Config.Mountain.cameraFovDesktop;

    this.camera = new THREE.PerspectiveCamera(
      fov,
      window.innerWidth / window.innerHeight,
      0.01,
      2000
    );
    this.camera.position.set(0, 0, 0.01); // Start zoomed in
  }

  initBackground() {
    // Replace scene.background (fixed) with a regular Mesh (scrollable)
    // Adjust plane size/position to cover viewport at z=0 (approximately)
    // With FOV 40 and Camera Z 0.65, height at Z=0 is approx 0.47 units
    // We make it slightly larger to be safe.
    
    const isMobile = window.innerWidth < 768;
    const planeH = isMobile ? Config.Mountain.bgPlaneHeightMobile : Config.Mountain.bgPlaneHeightDesktop;
    const planeW = planeH * (window.innerWidth / window.innerHeight);

    // Dithered Gradient Shader
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform float uFade;

      // Simple pseudo-random noise function
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        // Gradient
        vec3 gradient = mix(colorB, colorA, vUv.y);
        
        // Dithering
        float noise = random(gl_FragCoord.xy) * (1.0/255.0) - (0.5/255.0);
        
        // Apply fade and output
        gl_FragColor = vec4((gradient + noise) * uFade, 1.0);
      }
    `;

    // Colors
    const colorBlack = new THREE.Color(0x000000);
    const colorGrey = new THREE.Color(0xbbbbbb);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        colorA: { value: colorBlack }, // Top
        colorB: { value: colorGrey },  // Bottom
        uFade: { value: 0.0 }         // Start fully black (faded out)
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // Use 1x1 geometry and scale it so we can easily resize it later
    this.bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      material
    );
    this.bgMesh.scale.set(planeW, planeH, 1);

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
    this.video.preload = 'auto';
    // this.video.autoplay = true; // Manual control only
    
    // SAFETY: Ensure loop works even if browser feels quirky
    this.video.addEventListener('ended', () => {
        this.video.currentTime = 0;
        this.video.play().catch(() => {});
    });

    // PREVENTION: Attach to DOM to avoid background throttling
    this.video.style.position = 'absolute';
    this.video.style.top = '0';
    this.video.style.left = '0';
    this.video.style.width = '1px';
    this.video.style.height = '1px';
    this.video.style.opacity = '0';
    this.video.style.pointerEvents = 'none';
    this.video.style.zIndex = '-1000';
    document.body.appendChild(this.video);

    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    this.screenMesh.material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      toneMapped: false,
    });

    // --- GPU LIGHT SAMPLING SETUP (No CPU Readback) ---

    // 1. Create a 1x1 RenderTarget for "Average Color"
    this.avgColorRT = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType, // High precision
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false
    });

    // 2. Aux video sampling scene
    this.lightCvtScene = new THREE.Scene();
    this.lightCvtCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    
    // 3. Simple Plane displaying the video
    // This allows us to render just the video to the 1x1 RT
    // We use a custom shader to sample multiple points for a better average
    this.lightCvtMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
            uniforms: { map: { value: this.videoTexture } },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                varying vec2 vUv;
                void main() {
                    vec4 color = vec4(0.0);
                    // Sample 5x5 grid
                    for(float x = 0.1; x < 1.0; x += 0.2) {
                        for(float y = 0.1; y < 1.0; y += 0.2) {
                            color += texture2D(map, vec2(x, y));
                        }
                    }
                    gl_FragColor = color / 25.0;
                }
            `
        })
    );
    this.lightCvtScene.add(this.lightCvtMesh);

    this.lightUpdateInterval = 0.05; // 20 updates per second (very cheap now)
  }

  // === SCENE SETUP & UTILS ===

  initLoader() {
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
    );
    loader.setDRACOLoader(dracoLoader);

    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');

    const mountainTex = texLoader.load(
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/textures/mountain_texture_optimised_bw.webp',
      () => { }
    );

    mountainTex.colorSpace = THREE.LinearSRGBColorSpace;
    mountainTex.flipY = false;

    loader.load(
      'https://bunqlabs.github.io/bunq-labs-website-dec2025/assets/models/mountain_export_optimised.glb',
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
            // GPU-Optimized Unlit Material
            // Instead of expensive PBR, we just multiply the texture by the average video color.
            obj.material = new THREE.ShaderMaterial({
              uniforms: {
                tDiffuse: { value: mountainTex },
                tVideoAvg: { value: this.avgColorRT.texture },
                uStrength: { value: 1.2 } // Brightness boost
              },
              vertexShader: `
                varying vec2 vUv;
                void main() {
                  vUv = uv;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `,
              fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform sampler2D tVideoAvg;
                uniform float uStrength;
                varying vec2 vUv;

                void main() {
                  // 1. Read Mountain Texture (Grayscale/Base)
                  vec4 texColor = texture2D(tDiffuse, vUv);

                  // 2. Read Average Video Color (1x1 Pixel)
                  vec4 lightColor = texture2D(tVideoAvg, vec2(0.5));

                  // 3. Multiply logic (tinting)
                  // We add a small base floor to lightColor so it's never pitch black
                  vec3 finalLight = lightColor.rgb + vec3(0.15); 
                  
                  // Combine
                  gl_FragColor = vec4(texColor.rgb * finalLight * uStrength, 1.0);
                }
              `,
              side: THREE.DoubleSide
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
    const snowOffsets = new Float32Array(this.snowCount); // Random offset for sway

    for (let i = 0; i < this.snowCount; i++) {
        snowPositions[i * 3 + 0] = (Math.random() - 0.5) * this.snowArea.x;
        snowPositions[i * 3 + 1] = (Math.random() - 0.5) * this.snowArea.y; // Centered at 0
        snowPositions[i * 3 + 2] = (Math.random() - 0.5) * this.snowArea.z;
        snowSpeeds[i] = 0.5 + Math.random(); // Varied speed factor
        snowOffsets[i] = Math.random() * 100;
    }

    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    snowGeo.setAttribute('aSpeed', new THREE.BufferAttribute(snowSpeeds, 1));
    snowGeo.setAttribute('aOffset', new THREE.BufferAttribute(snowOffsets, 1));

    // Custom Shader for GPU Animation
    const snowMat = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float time;
        uniform vec3 area;
        uniform float fallSpeed;
        uniform float sway;
        uniform vec3 wind;
        
        attribute float aSpeed;
        attribute float aOffset;
        
        void main() {
          vec3 pos = position;
          
          // 1. Gravity (Push Down)
          float yOffset = time * fallSpeed * aSpeed * 0.2; // 0.2 scaling to match previous feel
          
          // Wrap Y
          // We want pos.y to go from -area.y/2 to area.y/2
          float h = area.y;
          float y = pos.y - yOffset;
          y = mod(y + h * 0.5, h) - h * 0.5;
          pos.y = y;

          // 2. Sway (Sine wave based on time + offset)
          float swayVal = sin(time * 0.5 + aOffset) * sway;
          pos.x += swayVal + wind.x * time * 0.1;
          pos.z += cos(time * 0.3 + aOffset) * sway + wind.z * time * 0.1;

          // Wrap X/Z strictly to area? 
          // previous CPU code clamped them. 
          // For simplicity in shader, let's just let them drift or wrap them if needed.
          // Wrapping X/Z creates "popping", clamping makes them pile up.
          // Let's implement soft wrapping for X/Z if wind is strong, but for light sway it's fine.
          // WITH WIND: needed.
          
          if (wind.x != 0.0) {
             pos.x = mod(pos.x + area.x * 0.5, area.x) - area.x * 0.5;
          }
          if (wind.z != 0.0) {
             pos.z = mod(pos.z + area.z * 0.5, area.z) - area.z * 0.5;
          }

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (1.5 * (1.0 / -mvPosition.z)); // Scale by distance
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        void main() {
          // Simple circular particle
          vec2 coord = gl_PointCoord - vec2(0.5);
          if(length(coord) > 0.5) discard;
          
          gl_FragColor = vec4(1.0, 1.0, 1.0, 0.4); // White, 0.4 opacity
        }
      `
    });

    this.snow = new THREE.Points(snowGeo, snowMat);
    this.contentGroup.add(this.snow);
    this.snowGeo = snowGeo;
  }

  updatePerformanceConfig(width, height) {
    // Handled by QualityManager
  }

  applyDPR(targetDPR) {
    const dpr = Math.min(window.devicePixelRatio || 1, targetDPR);
    if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) {
      this.renderer.setPixelRatio(dpr);
    }
  }

  // onPerformanceDrop removed (Legacy)

  resize(width, height) {
    const isMobile = width < 768;
    this.camera.fov = isMobile
      ? Config.Mountain.cameraFovMobile
      : Config.Mountain.cameraFovDesktop;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Update Background Scale
    if (this.bgMesh) {
        const planeH = isMobile ? Config.Mountain.bgPlaneHeightMobile : Config.Mountain.bgPlaneHeightDesktop;
        const planeW = planeH * (width / height);
        this.bgMesh.scale.set(planeW, planeH, 1);
    }
    // this.updatePerformanceConfig(width, height);
  }

  updateLightFromVideo(dt) {
    if (!this.video || this.video.paused) return;
    
    // Render video to 1x1 texture (GPU Downsample)
    // No CPU readback, no buffer transfer. Extremely fast.
    const oldTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.avgColorRT);
    this.renderer.render(this.lightCvtScene, this.lightCvtCamera);
    this.renderer.setRenderTarget(oldTarget);

    // That's it! The 'tVideoAvg' uniform in the shader now holds the current frame's average color.
  }

  updateSnow(time, dt) {
     if (this.snowUniforms) {
       this.snowUniforms.time.value = time;
     }
  }

  update(time, dt) {
    // this.perfMonitor.update(dt);
    // this.perfMonitor.update(dt);
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
      this.video.play().catch(() => { });
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
    // Only resume if explicitly allowed (handled by main.js logic ideally, but as a fallback)
    // If we are strictly controlled by main.js, this might be redundant or conflicting.
    // keeping it simple:
    this.playVideo();
  };

  animateEntry() {
    console.log('[Mountain] animateEntry()');

    // 1. Camera Zoom
    gsap.to(this.camera.position, {
      z: 0.65,
      duration: 3.0,
      ease: 'power3.out',
      onUpdate: () => {
        // any constant updates if needed
      },
    });

    // 2. Background Color Fade (Black -> White (modulates texture))
    // The texture has the gradient. Modulating with White shows texture as is.
    // Modulating with Black shows black.
    // 2. Background Color Fade (Black -> Target Gradient)
    // We typically want to start black.
    // The shader now uses 'uFade' or we can just assume the shader implementation handles it.
    // Let's add a uFade uniform to the material in initBackground for this purpose.
    if (this.bgMesh && this.bgMesh.material && this.bgMesh.material.uniforms.uFade) {
      gsap.to(this.bgMesh.material.uniforms.uFade, {
        value: 1.0,
        duration: 3.0,
        ease: 'linear',
      });
    }

    // 3. Play Video
    this.playVideo();
  }

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
