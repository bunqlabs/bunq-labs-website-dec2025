import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { MountainScene } from './scenes/MountainScene.js';
import { GrassScene } from './scenes/GrassScene.js';
import { ScrollBender } from './components/ScrollBender.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';

// === CONFIGURATION & STATE ===

const barba = window.barba;
const container = document.getElementById('webgl');
const clock = new THREE.Clock();
const stats = new Stats();

let isHome = false;
let mountainEl = null;
let lastWindowWidth = window.innerWidth;
let mountainVisible = false;
let transitionGlobalFade = false;
let isTransitioning = false;

// Scroll State
let currentScrollY = window.scrollY;
let virtualScrollY = window.scrollY;
let lastRawScrollY = window.scrollY;

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
const scrollBender = new ScrollBender();


renderer.setSize(container.clientWidth, container.clientHeight);
mountainScene.resize(container.clientWidth, container.clientHeight);
grassScene.resize(container.clientWidth, container.clientHeight);

// === LOGIC ===

// Cache the mountain element's configuration (position relative to document top)
let mountainConfig = { top: 0, height: 0, left: 0, width: 0 };

function calcMountainConfig() {
    if (!mountainEl) {
        mountainConfig.height = 0;
        return;
    }
    const rect = mountainEl.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    mountainConfig.top = rect.top + scrollTop;
    mountainConfig.left = rect.left;
    mountainConfig.width = rect.width;
    mountainConfig.height = rect.height;
    mountainConfig.bottom = mountainConfig.top + rect.height;
}

const mountainObserver = new ResizeObserver(() => {
    calcMountainConfig();
    // Force a render if needed, but the loop handles it.
});

function updateRouteState(namespace, container) {
    console.log('[Route] Updating state for:', namespace);
    if (namespace === 'home') {
        isHome = true;
        // Try finding the element in the new container first, then global fallback
        mountainEl = container ? container.querySelector('#mountain-hero') : document.getElementById('mountain-hero');

        if (mountainEl) {
            console.log('[Route] Mountain Element found, mounting scene.');
            mountainScene.mount();
            // Start observing for size changes (handles transition/load timing)
            mountainObserver.observe(mountainEl);
            // Also call once immediately in case it's already stable
            calcMountainConfig();

            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.0;
        }
        grassScene.mount();
    } else {
        isHome = false;

        // Cleanup observer
        if (mountainEl) {
            mountainObserver.unobserve(mountainEl);
        }
        mountainEl = null;

        mountainScene.unmount();
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setScissorTest(false);
        grassScene.mount();
    }
}

// === EVENTS ===

function updateVirtualScroll() {
    const raw = window.scrollY;
    const delta = raw - lastRawScrollY;

    if (!window.isNavigatingReset) {
        virtualScrollY += delta;
    }

    lastRawScrollY = raw;
    currentScrollY = raw;
}

window.addEventListener('scroll', () => {
    updateVirtualScroll();
}, { passive: true });

let resizeTimeout;
window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWindowWidth) < 2) return;
    lastWindowWidth = window.innerWidth;

    // Clear debounce
    if (resizeTimeout) clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;

        renderer.setSize(w, h);
        mountainScene.resize(w, h);
        grassScene.resize(w, h);
        scrollBender.resize();

        // update cache
        calcMountainConfig();
    }, 100); // 100ms debounce
}, { passive: true });

// === BARBA SETUP ===

if (barba) {
    barba.init({
        debug: false,
        transitions: [{
            name: 'fade',
            leave(data) {
                try {
                    // Try getting namespace, but fallback to URL analysis if module not loaded yet
                    let nextNs = data.next.namespace;

                    // Fallback to checking URL if namespace is missing (common in Barba sync mode or pre-fetch timing)
                    if (!nextNs && data.next.url) {
                        const path = data.next.url.path || data.next.url.href;
                        // Assuming home is '/' or '/index.html' or ends with '/'
                        if (path === '/' || path.endsWith('index.html') || path.endsWith('/')) {
                            nextNs = 'home';
                        }
                    }

                    const goingToMountain = (nextNs === 'home');
                    const comingFromMountain = mountainVisible;

                    // Global fade if we interact with Mountain scene at all
                    transitionGlobalFade = goingToMountain || comingFromMountain;

                    if (transitionGlobalFade) {
                        // Fade out both content and the WebGL canvas (scene)
                        return gsap.to([data.current.container, container], { opacity: 0, duration: 1 });
                    } else {
                        // Only fade content, leave canvas (grass) visible
                        return gsap.to(data.current.container, { opacity: 0, duration: 1 });
                    }
                } catch (err) {
                    console.error(err);
                }
            },
            enter(data) {
                try {
                    // FLag start of reset
                    window.isNavigatingReset = true;
                    isTransitioning = true; // Force render during transition

                    window.scrollTo(0, 0);

                    // Immediately update our raw tracking so we accept 0 as the new baseline
                    lastRawScrollY = 0;
                    currentScrollY = 0;

                    // Re-enable tracking next frame/tick
                    requestAnimationFrame(() => {
                        window.isNavigatingReset = false;
                    });

                    const ns = data.next.namespace || (data.next.container && data.next.container.dataset.namespace);

                    updateRouteState(ns, data.next.container);

                    if (transitionGlobalFade) {
                        // Ensure opacity starts at 0 before fading in
                        gsap.set([data.next.container, container], { opacity: 0 });
                        // Fade in both
                        return gsap.to([data.next.container, container], { opacity: 1, duration: 1 });
                    } else {
                        // Ensure opacity starts at 0 before fading in
                        gsap.set(data.next.container, { opacity: 0 });
                        // Fade in content only
                        return gsap.to(data.next.container, { opacity: 1, duration: 1 });
                    }
                } catch (err) {
                    console.error(err);
                }
            },
            after(data) {
                // (e.g. after previous container is removed and new one shifts up)
                isTransitioning = false;
                calcMountainConfig();
                scrollBender.resize(); // Re-cache elements after new content loaded
            }
        }]
    });
}


// === BOOTSTRAP ===

const initialNamespace = document.querySelector('[data-barba="container"]').dataset.namespace;
updateRouteState(initialNamespace);

// === ANIMATION LOOP ===

function animate() {
    stats.begin();
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;
    const dt = clock.getDelta();

    // Default viewport for full screen
    // Default viewport for full screen
    renderer.setViewport(0, 0, container.clientWidth, container.clientHeight);
    renderer.setScissorTest(false);

    // Update MountainScene "Relative Scroll" position
    mountainScene.updateScroll(currentScrollY);

    // Visibility Check
    mountainVisible = false;
    if (isHome && mountainConfig.height > 0) {
        // Simple check: is it effectively on screen? (Since it scrolls up, we just check if top < window height)
        const elTop = mountainConfig.top - currentScrollY;
        if (elTop + mountainConfig.height > 0 && elTop < window.innerHeight) {
            mountainVisible = true;
        }
    }

    // RENDER ORDER:
    // 1. Grass (Background)

    // Push the VIRTUAL (continuous) scroll state to grass
    grassScene.updateScrollState(virtualScrollY);
    grassScene.update(time, dt);
    grassScene.render();

    // 2. Mountain (Foreground / relative scroll overlay)
    if (mountainVisible) {
        // No scissor needed, it moves naturally via updateScroll()
        // We do NOT clear depth, as we want to draw Over/With grass if transparency exists
        // But Mountain has its own background mesh, so it will occlude grass naturally.

        // However, if we want Mountain to be "atop", we should clear depth or rely on Z-buffer
        // Since Mountain is at Z ~0.65 to 0 (camera relative), and Grass is... ?
        // Grass camera is at 0, 20, 0 looking at 0,0,0.
        // They are separate scenes/cameras. Z-buffer is cleared between renders unless autoClear=false.

        // Default Three.js renderer.render() clears buffer if autoClear=true.
        // We want to Overlay.

        renderer.autoClear = false;
        renderer.clearDepth(); // Clear depth so Mountain draws on top of Grass

        mountainScene.update(time, dt);
        mountainScene.render();

        renderer.autoClear = true; // Restore for next frame
    }



    // Update scroll bending effect independently of scenes
    scrollBender.update(currentScrollY);

    stats.end();
}

animate();
