import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { MountainScene } from './mountain.js';
import { GrassScene } from './grass.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

// === CONFIGURATION & STATE ===

const barba = window.barba;
const container = document.getElementById('webgl');
const clock = new THREE.Clock();
const stats = new Stats();

let isHome = false;
let mountainEl = null;
let lastWindowWidth = window.innerWidth;
let mountainRect = { left: 0, top: 0, bottom: 0, width: 0, height: 0 };

// === INITIALIZATION ===

stats.showPanel(0);
stats.dom.style.position = 'fixed';
stats.dom.style.left = '8px';
stats.dom.style.top = '8px';
stats.dom.style.zIndex = '2000';
document.body.appendChild(stats.dom);

const renderer = new THREE.WebGLRenderer({
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
  alpha: false, 
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(false);
container.appendChild(renderer.domElement);

const mountainScene = new MountainScene(renderer);
const grassScene = new GrassScene(renderer);


renderer.setSize(container.clientWidth, container.clientHeight);
mountainScene.resize(container.clientWidth, container.clientHeight);
grassScene.resize(container.clientWidth, container.clientHeight);

// === LOGIC ===

function scanMountainRect() {
    if (!mountainEl) return;
    const rect = mountainEl.getBoundingClientRect();
    mountainRect.left = rect.left;
    mountainRect.top = rect.top;
    mountainRect.bottom = rect.bottom;
    mountainRect.width = rect.width;
    mountainRect.height = rect.height;
}

function updateRouteState(namespace, container) {
    if (namespace === 'home') {
        isHome = true;
        mountainEl = container ? container.querySelector('#mountain-hero') : document.getElementById('mountain-hero');
        
        if (mountainEl) {
            mountainScene.mount();
            scanMountainRect();
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.0;
        } else {
            console.warn('[Route] Home detected but #mountain-hero not found');
        }
        grassScene.mount(); 
    } else {
        isHome = false;
        mountainEl = null;
        mountainScene.unmount();
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setScissorTest(false); 
        grassScene.mount();
    }
}

// === EVENTS ===

window.addEventListener('scroll', scanMountainRect, { passive: true });
window.addEventListener('resize', scanMountainRect, { passive: true });

window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWindowWidth) < 2) return;
    lastWindowWidth = window.innerWidth;
    
    const w = container.clientWidth;
    const h = container.clientHeight;
    

    renderer.setSize(w, h);
    mountainScene.resize(w, h);
    grassScene.resize(w, h);
});

// === BARBA SETUP ===

if (barba) {
    barba.init({
        transitions: [{
            name: 'fade',
            leave(data) {
                return gsap.to(data.current.container, { opacity: 0 });
            },
            enter(data) {
                window.scrollTo(0, 0);
                const ns = data.next.namespace || data.next.container.dataset.namespace;
                updateRouteState(ns, data.next.container);
                return gsap.from(data.next.container, { opacity: 0 });
            }
        }]
    });
}

// === BOOTSTRAP ===

const initialNamespace = document.querySelector('[data-barba="container"]').dataset.namespace;
updateRouteState(initialNamespace);

// === RENDER LOOP ===

function animate() {
    requestAnimationFrame(animate);
    stats.begin();

    const time = performance.now() * 0.001;
    const dt = clock.getDelta();

    renderer.setScissorTest(false);
    const width = renderer.domElement.width / renderer.getPixelRatio();
    const height = renderer.domElement.height / renderer.getPixelRatio();
    renderer.setViewport(0, 0, width, height);
    
    grassScene.update(time, dt);
    grassScene.render();

    if (isHome && mountainEl && mountainRect.height > 0) {
        const { left, bottom, width, height, top } = mountainRect;

        if (bottom > 0 && top < window.innerHeight) { 
            renderer.setScissor(left, window.innerHeight - bottom, width, height);
            renderer.setViewport(left, window.innerHeight - bottom, width, height);
            renderer.setScissorTest(true);
            renderer.clearDepth(); 
            mountainScene.update(time, dt);
            mountainScene.render();
        }
    }

    stats.end();
}

animate();
