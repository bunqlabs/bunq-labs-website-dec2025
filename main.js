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

// Cache the mountain element's configuration (position relative to document top)
let mountainConfig = { top: 0, height: 0, left: 0, width: 0 };
let currentScrollY = window.scrollY;

function calcMountainConfig() {
    if (!mountainEl) {
        mountainConfig.height = 0;
        return;
    }
    // We get the rect once to know where it is largely
    // But since it's the hero, it's usually at the top. 
    // However, to be safe and generic:
    const rect = mountainEl.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    
    mountainConfig.top = rect.top + scrollTop;
    mountainConfig.left = rect.left; // Assuming no horizontal scroll for main layout
    mountainConfig.width = rect.width;
    mountainConfig.height = rect.height;
    mountainConfig.bottom = mountainConfig.top + rect.height;
}

function updateRouteState(namespace, container) {
    if (namespace === 'home') {
        isHome = true;
        mountainEl = container ? container.querySelector('#mountain-hero') : document.getElementById('mountain-hero');
        
        if (mountainEl) {
            mountainScene.mount();
            calcMountainConfig();
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

// Just track scroll Y, don't do heavy layout Reads
window.addEventListener('scroll', () => {
    currentScrollY = window.scrollY;
}, { passive: true });

window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWindowWidth) < 2) return;
    lastWindowWidth = window.innerWidth;
    
    const w = container.clientWidth;
    const h = container.clientHeight;
    
    renderer.setSize(w, h);
    mountainScene.resize(w, h);
    grassScene.resize(w, h);
    
    // update cache
    calcMountainConfig();
}, { passive: true });

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

    if (isHome && mountainConfig.height > 0) {
        // Calculate current viewport rect for mountain
        // viewportTop = mountainConfig.top - currentScrollY
        const viewTop = mountainConfig.top - currentScrollY;
        const viewBottom = viewTop + mountainConfig.height;

        // Intersection consistency check
        // We only render if it intersects with the viewport (0 to window.innerHeight)
        if (viewBottom > 0 && viewTop < window.innerHeight) { 
             // scissor needs (x, y, w, h) where y is from *bottom*
             // so y_scissor = window.innerHeight - (viewTop + height) NO
             // y_scissor = window.innerHeight - (rect.bottom)
             
             // rect.bottom in viewport coords = viewBottom
             const scissorsBottom = window.innerHeight - viewBottom;
             
             // Ensure we don't pass negative values if it's partially offscreen?
             // THREE handles clipping but scissor parameters must be valid?
             // Typically scissor region:
             // left, bottom, width, height
             
             renderer.setScissor(mountainConfig.left, scissorsBottom, mountainConfig.width, mountainConfig.height);
             renderer.setViewport(mountainConfig.left, scissorsBottom, mountainConfig.width, mountainConfig.height);
             renderer.setScissorTest(true);
             renderer.clearDepth(); 
             mountainScene.update(time, dt);
             mountainScene.render();
        }
    }

    stats.end();
}

animate();
