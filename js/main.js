import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { MountainScene } from './scenes/MountainScene.js';
import { GrassScene } from './scenes/GrassScene.js';
import { ScrollBender } from './components/ScrollBender.js';
import { AudioManager } from './components/AudioManager.js';
import { ClientLogoCycler } from './components/ClientLogoCycler.js';
import { AcceleratingGlobe } from './components/AcceleratingGlobe.js';
import { FlickCards } from './components/FlickCards.js';
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
let lastMountainVisible = false; // Track previous state for transitions
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
const audioManager = new AudioManager();
const clientLogoCycler = new ClientLogoCycler();
const acceleratingGlobe = new AcceleratingGlobe();
const flickCards = new FlickCards();

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
    mountainEl = container
      ? container.querySelector('#mountain-hero')
      : document.getElementById('mountain-hero');

    if (mountainEl) {
      console.log('[Route] Mountain Element found, mounting scene.');
      mountainScene.mount();
      // Start observing for size changes (handles transition/load timing)
      mountainObserver.observe(mountainEl);
      // Also call once immediately in case it's already stable
      calcMountainConfig();

      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;

      // Force visibility immediately to prevent "Grass flash"
      mountainVisible = true;
    }
    // DO NOT mount grass if we are on home and mountain is covering everything
    // But since mountain scrolls, we might need grass later.
    // For now, let's keep grass mounted but control RENDER loop strictly.
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

// window.addEventListener('scroll', () => {
//    updateVirtualScroll();
// }, { passive: true });

let resizeTimeout;
window.addEventListener(
  'resize',
  () => {
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
  },
  { passive: true }
);

// === BARBA SETUP ===

// === EVENTS & INTERACTION ===

// Intercept clicks to prevent reloading same page
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link && link.href) {
    // Normalize URLs for comparison (strip hash if needed, but strict is fine for now)
    if (link.href === window.location.href) {
      console.log('[Nav] Blocked reload on same link');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
});

// Audio Toggle
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'audio-toggle') {
    audioManager.toggleMute();
  }
});

if (barba) {
  barba.init({
    debug: false,
    prevent: ({ el }) => {
      // Prevent transition if clicking same link
      if (el && el.href && el.href === window.location.href) {
        return true;
      }
    },
    transitions: [
      {
        name: 'fade',
        sync: false, // Ensure strictly sequential (Leave -> Remove -> Enter)
        leave(data) {
          // Lock Interaction
          document.body.classList.add('is-transitioning');
          clientLogoCycler.destroy(); // Stop cycler
          acceleratingGlobe.destroy(); // Stop globe animation
          flickCards.destroy(); // Stop flick cards

          // Return a Promise to force Barba to wait
          return new Promise((resolve) => {
            try {
              let nextNs = data.next.namespace;
              if (!nextNs && data.next.url) {
                const path = data.next.url.path || data.next.url.href;
                if (
                  path === '/' ||
                  path.endsWith('index.html') ||
                  path.endsWith('/')
                ) {
                  nextNs = 'home';
                }
              }

              const goingToMountain = nextNs === 'home';
              const comingFromMountain = mountainVisible; // Global state check

              transitionGlobalFade = goingToMountain || comingFromMountain;

              // TARGET STRATEGY: wrapper (explicit style opacity)
              const wrapper = document.querySelector('.main-wrapper');

              // Action: Set opacity to 0 (Triggers CSS Transition 1s)
              if (wrapper) wrapper.style.opacity = '0';

              // If Global, also fade WebGL (using CSS opacity)
              if (transitionGlobalFade) {
                const webgl = document.getElementById('webgl');
                if (webgl) webgl.style.opacity = '0';
              }

              // Wait for transition to finish (1.0s)
              setTimeout(() => {
                resolve();
              }, 1000);
            } catch (err) {
              console.error(err);
              resolve();
            }
          });
        },
        beforeEnter(data) {
          // Wrapper is already 0 from leave().
          // No action needed specifically for container.
        },
        enter(data) {
          return new Promise((resolve) => {
            try {
              // Reset Scroll
              window.isNavigatingReset = true;
              isTransitioning = true;
              window.scrollTo(0, 0);
              lastRawScrollY = 0;
              currentScrollY = 0;
              requestAnimationFrame(() => {
                window.isNavigatingReset = false;
              });

              const ns =
                data.next.namespace ||
                (data.next.container && data.next.container.dataset.namespace);
              updateRouteState(ns, data.next.container);

              const delay = ns === 'home' ? 2000 : 1000; // ms

              // TARGET STRATEGY: Target wrapper
              const wrapper = document.querySelector('.main-wrapper');

              // MANUAL CLEANUP: Ensure old container is GONE.
              if (data.current.container && data.current.container.parentNode) {
                data.current.container.parentNode.removeChild(
                  data.current.container
                );
              }

              // Ensure Wrapper is 0 (it should be)
              // Actually, if coming from external or refresh, CSS is 0.
              // If coming from navigation, it's 0.

              // Add WebGL logic if global
              if (transitionGlobalFade) {
                // Correct: leave() set it to 0. It persists.
              }

              // Wait for delay, then Reveal
              setTimeout(() => {
                // 1. Reveal Wrapper via CSS Opacity
                if (wrapper) wrapper.style.opacity = '1';

                // 2. Reveal WebGL via CSS Opacity (if needed)
                if (transitionGlobalFade) {
                  const webgl = document.getElementById('webgl');
                  if (webgl) webgl.style.opacity = '1';
                }

                // 3. Resolve after transition (1.0s)
                setTimeout(() => {
                  resolve();
                }, 1000);
              }, delay);
            } catch (err) {
              console.error(err);
              resolve();
            }
          });
        },
        after(data) {
          // Unlock Interaction
          document.body.classList.remove('is-transitioning');

          // (e.g. after previous container is removed and new one shifts up)
          isTransitioning = false;
          calcMountainConfig();
          scrollBender.resize(); // Re-cache elements after new content loaded
          clientLogoCycler.init(); // Re-init cycler
          acceleratingGlobe.init(); // Re-init globe
          flickCards.init(); // Re-init flick cards
        },
      },
    ],
  });
}

// Force initial Wrapper to be visible (it's hidden by CSS to prevent FOUC)
const initialWrapper = document.querySelector('.main-wrapper');
if (initialWrapper) {
  initialWrapper.style.opacity = '1';
}
// Force initial WebGL visibility
const initialWebgl = document.getElementById('webgl');
if (initialWebgl) {
  initialWebgl.style.opacity = '1';
}
// Force initial Canvas Container (if needed)
const initialCanvasContainer = document.getElementById('canvas-container');
if (initialCanvasContainer) {
  gsap.set(initialCanvasContainer, { opacity: 1 });
}

// Initial Route Setup
const initialContainer = document.querySelector('[data-barba="container"]');
const initialNs = initialContainer.dataset.namespace;
updateRouteState(initialNs, initialContainer);
clientLogoCycler.init(); // Initialize logo cycler
acceleratingGlobe.init(); // Initialize globe animation
flickCards.init(); // Initialize flick cards

// === ANIMATION LOOP ===

function animate() {
  stats.begin();
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;
  const dt = clock.getDelta();

  // Poll scroll directly for lowest latency sync
  updateVirtualScroll();

  // Default viewport for full screen
  // Default viewport for full screen
  renderer.setViewport(0, 0, container.clientWidth, container.clientHeight);
  renderer.setScissorTest(false);

  // Update MountainScene "Relative Scroll" position
  mountainScene.updateScroll(currentScrollY);

  // Visibility Check
  mountainVisible = false;

  if (isTransitioning) {
    // STRICT SYNC: If we are transitioning TO Home, force Mountain visible immediately.
    // This ensures that when the fade-in starts, the scene is already swapped.
    if (isHome) {
      mountainVisible = true;
    }
  } else if (isHome) {
    // Normal Runtime Check
    // If config is not yet set (height 0), assume it's visible (Home default)
    if (mountainConfig.height === 0) {
      mountainVisible = true;
    } else {
      // Standard check: is it effectively on screen?
      const elTop = mountainConfig.top - currentScrollY;
      if (elTop + mountainConfig.height > 0 && elTop < window.innerHeight) {
        mountainVisible = true;
      }
    }
  }

  // === VIDEO PLAYBACK CONTROL ===
  if (mountainVisible !== lastMountainVisible) {
    if (mountainVisible) {
      mountainScene.playVideo();
    } else {
      mountainScene.pauseVideo();
    }
    lastMountainVisible = mountainVisible;
  }

  // RENDER ORDER & EXCLUSIVITY:
  // "Never have dual scene rendering. Always have only one."

  // 1. Mountain (Priority if visible)
  if (mountainVisible) {
    // Render Mountain ONLY
    mountainScene.update(time, dt);
    mountainScene.render();

    // Push virtual scroll to grass even if not rendering, so it doesn't jump when it reappears
    grassScene.updateScrollState(virtualScrollY);
  } else {
    // 2. Grass (Fallback if Mountain not visible)
    grassScene.updateScrollState(virtualScrollY);
    grassScene.update(time, dt);
    grassScene.render();
  }

  // Update scroll bending effect independently of scenes
  scrollBender.update(currentScrollY);

  stats.end();
}

// Start the animation loop (or ensure it runs)
animate();

// Initial Load Complete: Fade out the global loader
// Initial Load Complete: Interactive entry
const initialLoader = document.querySelector('.global-loader');
const loaderBtn = document.getElementById('loader-button');

if (initialLoader && loaderBtn) {
  // 1. Start Dot Animation
  let dots = 0;
  const dotInterval = setInterval(() => {
    dots = (dots + 1) % 4; // 0, 1, 2, 3
    loaderBtn.textContent = 'Loading' + '.'.repeat(dots);
  }, 500);

  // 2. Wait for Video to be Ready (Real Load Event)
  const video = mountainScene.video;

  function onReady() {
    clearInterval(dotInterval);
    loaderBtn.textContent = 'Click to Enter';
    loaderBtn.classList.remove('is-secondary');

    // 3. User Interaction
    loaderBtn.addEventListener(
      'click',
      () => {
        // Unlock Audio Context
        audioManager.unlock();

        // Play Video (Force Mobile Play)
        if (mountainScene.video) {
          mountainScene.video
            .play()
            .catch((e) => console.log('Video play failed', e));
          mountainScene.playVideo(); // Ensure scene state matches
        }

        // Animate Out
        gsap.to(initialLoader, {
          opacity: 0,
          pointerEvents: 'none',
          duration: 0.5,
        });
      },
      { once: true }
    );
  }

  if (video && video.readyState >= 3) {
    // HAVE_FUTURE_DATA or higher
    onReady();
  } else if (video) {
    video.addEventListener('canplaythrough', onReady, { once: true });
    video.addEventListener(
      'error',
      () => {
        console.error('Video load error');
        onReady(); // Allow entry anyway to prevent lock
      },
      { once: true }
    );
  } else {
    // Fallback if no video element
    onReady();
  }
}
