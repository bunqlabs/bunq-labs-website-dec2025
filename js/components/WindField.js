import * as THREE from 'three';

export class WindField {
    constructor(renderer, size = 256, params = {}) {
        this.renderer = renderer;
        this.size = size;
        this.params = {
            decay: params.decay ?? 0.95,
            diffusion: params.diffusion ?? 0.2,
            advection: params.advection ?? 1.0,
            injectionRadius: params.injectionRadius ?? 0.08,
            injectionStrength: params.injectionStrength ?? 1.0,
            injectionStrengthMax: params.injectionStrengthMax ?? 1.0,
        };

        const isWebGL2 = renderer.capabilities.isWebGL2 === true;
        const hasHalfFloat = isWebGL2 || renderer.extensions.has('OES_texture_half_float');
        const hasHalfFloatLinear = isWebGL2 || renderer.extensions.has('OES_texture_half_float_linear');
        const hasCBHalfFloat = renderer.extensions.has('EXT_color_buffer_half_float');
        const hasCBFloat = (isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')) || renderer.extensions.has('WEBGL_color_buffer_float');

        let rtType = THREE.HalfFloatType;
        if (!hasHalfFloat || !(hasCBHalfFloat || isWebGL2)) {
            rtType = hasCBFloat ? THREE.FloatType : THREE.HalfFloatType;
        }
        const filter = hasHalfFloatLinear ? THREE.LinearFilter : THREE.NearestFilter;

        const options = {
            minFilter: filter,
            magFilter: filter,
            format: THREE.RGBAFormat,
            type: rtType,
            depthBuffer: false,
            stencilBuffer: false,
        };
        this.rtA = new THREE.WebGLRenderTarget(size, size, options);
        this.rtB = new THREE.WebGLRenderTarget(size, size, options);
        this.read = this.rtA;
        this.write = this.rtB;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                tVelocity: { value: this.read.texture },
                resolution: { value: new THREE.Vector2(size, size) },
                decay: { value: this.params.decay },
                diffusion: { value: this.params.diffusion },
                advection: { value: this.params.advection },
                dt: { value: 0.016 },
                brushPos: { value: new THREE.Vector2(-1, -1) },
                brushDir: { value: new THREE.Vector2(0, 0) },
                injectionRadius: { value: this.params.injectionRadius },
                injectionStrength: { value: this.params.injectionStrength },
                injectionStrengthMax: { value: this.params.injectionStrengthMax },
                texelSize: { value: new THREE.Vector2(1.0 / size, 1.0 / size) },
            },
            vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
            fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tVelocity;
        uniform vec2 resolution;
        uniform vec2 texelSize;
        uniform float decay;
        uniform float diffusion;
        uniform float advection;
        uniform float dt;
        uniform vec2 brushPos;
        uniform vec2 brushDir;
        uniform float injectionRadius;
        uniform float injectionStrength;
        uniform float injectionStrengthMax;

        vec2 sampleVel(vec2 uv) {
          return texture2D(tVelocity, uv).xy;
        }

        void main() {
          vec2 velPrev = sampleVel(vUv);
          vec2 advUV = vUv - advection * dt * velPrev;
          vec2 adv = sampleVel(advUV);

          vec2 sum = adv;
          sum += sampleVel(vUv + vec2(texelSize.x, 0.0));
          sum += sampleVel(vUv - vec2(texelSize.x, 0.0));
          sum += sampleVel(vUv + vec2(0.0, texelSize.y));
          sum += sampleVel(vUv - vec2(0.0, texelSize.y));
          vec2 blurred = sum / 5.0;
          vec2 vel = mix(adv, blurred, clamp(diffusion, 0.0, 1.0));

          vel *= clamp(decay, 0.0, 1.0);

          if (brushPos.x >= 0.0 && brushPos.x <= 1.0 && brushPos.y >= 0.0 && brushPos.y <= 1.0) {
            vec2 diff = vUv - brushPos;
            float distSq = dot(diff, diff);
            float r = max(injectionRadius, 1e-5);
            float rSq = r * r;
            float w = exp(-0.5 * distSq / rSq);
            float s = min(injectionStrength, injectionStrengthMax);
            vel += brushDir * (s * w);
          }

          gl_FragColor = vec4(vel, 0.0, 1.0);
        }
      `,
            depthTest: false,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.mesh);
        this.clear();
    }

    clear() {
        const prevRT = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.rtA);
        this.renderer.clear(true, false, false);
        this.renderer.setRenderTarget(this.rtB);
        this.renderer.clear(true, false, false);
        this.renderer.setRenderTarget(prevRT);
    }

    update(mouseUv, mouseDir, dt) {
        this.material.uniforms.tVelocity.value = this.read.texture;
        this.material.uniforms.dt.value = dt;
        if (mouseUv && mouseUv.x >= 0.0 && mouseUv.y >= 0.0) {
            this.material.uniforms.brushPos.value.set(mouseUv.x, mouseUv.y);
            this.material.uniforms.brushDir.value.set(mouseDir.x, mouseDir.y);
        } else {
            this.material.uniforms.brushPos.value.set(-1, -1);
            this.material.uniforms.brushDir.value.set(0, 0);
        }

        const prev = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.write);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(prev);

        const tmp = this.read; this.read = this.write; this.write = tmp;
    }

    get texture() {
        return this.read.texture;
    }

    dispose() {
        this.rtA.dispose();
        this.rtB.dispose();
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
