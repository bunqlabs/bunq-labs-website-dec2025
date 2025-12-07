import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { MountainScene } from './mountain.js';
import { GrassScene } from './grass.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

// Barba.js should be available globally via CDN logic, or imported if using bundles. 
// Since we used CDN in HTML, 'barba' is on window.
const barba = window.barba;

// --- Shared Setup ---
const container = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
  alpha: false, 
});

// Mobile Optimization: Global DPR Cap
const isMobile = window.innerWidth < 768;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5));

// Mobile Optimization: Size to container (fixed CSS height) to prevent stretching
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Enable scissor test logic
renderer.setScissorTest(false); 

container.appendChild(renderer.domElement);

// --- Stats ---
const stats = new Stats();
stats.showPanel(0);
stats.dom.style.position = 'fixed';
stats.dom.style.left = '8px';
stats.dom.style.top = '8px';
stats.dom.style.zIndex = '2000';
document.body.appendChild(stats.dom);

// --- Scenes ---
const mountainScene = new MountainScene(renderer);
const grassScene = new GrassScene(renderer);

// Initial sizing to match container (100lvh)
// This ensures camera aspect ratios match the renderer viewport immediately
mountainScene.resize(container.clientWidth, container.clientHeight);
grassScene.resize(container.clientWidth, container.clientHeight);

// State
let isHome = false; // "home" namespace has mountain
let mountainEl = null;

// --- Optimization: Cache Mountain Rect ---
let mountainRect = { left: 0, top: 0, bottom: 0, width: 0, height: 0 };

function scanMountainRect() {
    if (!mountainEl) return;
    const rect = mountainEl.getBoundingClientRect();
    mountainRect.left = rect.left;
    mountainRect.top = rect.top;
    mountainRect.bottom = rect.bottom;
    mountainRect.width = rect.width;
    mountainRect.height = rect.height;
}

window.addEventListener('scroll', scanMountainRect, { passive: true });
window.addEventListener('resize', scanMountainRect, { passive: true });

// --- Logic ---

function updateRouteState(namespace, container) {
    console.log(`[Route] Updating to: ${namespace}`);
    if (namespace === 'home') {
        isHome = true;
        // Search in new container if provided, else fallback to document
        mountainEl = container ? container.querySelector('#mountain-hero') : document.getElementById('mountain-hero');
        
        if (mountainEl) {
            console.log('[Route] Found mountain element');
            mountainScene.mount();
            scanMountainRect(); // Ensure rect is active immediately
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.0;
        } else {
            console.warn('[Route] Home detected but #mountain-hero not found');
        }
        
        grassScene.mount(); 
    } else {
        console.log('[Route] Non-home route, unmounting mountain');
        isHome = false;
        mountainEl = null;
        mountainScene.unmount();
        
        // Reset renderer for grass-only
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setScissorTest(false); 
        grassScene.mount();
    }
}

// Initial check
const initialNamespace = document.querySelector('[data-barba="container"]').dataset.namespace;
updateRouteState(initialNamespace);

// Barba Init
if (barba) {
    barba.init({
        transitions: [{
            name: 'fade',
            leave(data) {
                return gsap.to(data.current.container, { opacity: 0 });
            },
            enter(data) {
                // Scroll to top
                window.scrollTo(0, 0);

                // Check DOM logic immediately upon enter (container is in DOM)
                // Use fallback to dataset if Barba doesn't parse namespace automatically
                const ns = data.next.namespace || data.next.container.dataset.namespace;
                updateRouteState(ns, data.next.container);
                return gsap.from(data.next.container, { opacity: 0 });
            },
            after(data) {
                // Cleanup or final checks
            }
        }]
    });
}

// --- Resize ---
let lastWindowWidth = window.innerWidth;

window.addEventListener('resize', () => {
    // Mobile optimization: Only resize if width changes significantly (>1px).
    // This prevents canvas thrashing when the URL bar shows/hides on mobile scroll.
    if (Math.abs(window.innerWidth - lastWindowWidth) < 2) {
        return;
    }
    
    lastWindowWidth = window.innerWidth;
    
    // Resize based on container dimensions to match CSS (100lvh)
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    mountainScene.resize(w, h);
    grassScene.resize(w, h);
});

// --- Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    stats.begin();

    const time = performance.now() * 0.001;
    const dt = clock.getDelta();

    // 1. Render Grass (Background, Full Screen)
    // Ensure scissor is OFF for background
    renderer.setScissorTest(false);
    // Use stored canvas size or container size, keeping viewport clean
    const width = renderer.domElement.width / renderer.getPixelRatio();
    const height = renderer.domElement.height / renderer.getPixelRatio();
    renderer.setViewport(0, 0, width, height);
    
    grassScene.update(time, dt);
    grassScene.render();

    // 2. Render Mountain (Foreground, Scissored)
    if (isHome && mountainEl) {
        // Optimization: Use cached rect updated on scroll/resize
        // Using cachedMountainRect injected via shared state or checking if we need to measure
        // To keep it simple and clean in one file without too much global state refactoring:
        
        // We will read from a global or outer-scope rect that is updated via scroll listener
        // But since we didn't set up the scroll listener yet, let's do it right here.
    } 
    
    // ... Actually, let's just use the rect variable we are about to add to the top level scope
    if (isHome && mountainEl && mountainRect.height > 0) {
        const { left, bottom, width, height, top } = mountainRect;

        // Optimization: Only update/render if physically visible on screen
        if (bottom > 0 && top < window.innerHeight) { 
             // Note: bottom here is window-relative (rect.bottom). 
             // In our cached rect logic below, we'll need to compute this correctly.
             // Actually, let's store the raw clientRect properties we need or re-compute.
             // Standard getBoundingClientRect is relative to viewport.
             
             // The rect is updated in scanMountainRect() which we call on scroll.
             
            renderer.setScissor(left, window.innerHeight - bottom, width, height); // Correct GL scissor math
            renderer.setViewport(left, window.innerHeight - bottom, width, height);
            renderer.setScissorTest(true);
            
            // Clear depth so mountain draws over grass cleanly in that region
            renderer.clearDepth(); 
            
            mountainScene.update(time, dt);
            mountainScene.render();
        }
    }

    stats.end();
}



// Initial scan
// We also need to hook into the route update to scan immediately when home is mounted
const _originalUpdateRouteState = updateRouteState;
// We can't easily hook the function reference above without changing it in place.
// Let's just add a call to scanMountainRect inside updateRouteState manually.
// Proceeding to apply these changes.

animate();
