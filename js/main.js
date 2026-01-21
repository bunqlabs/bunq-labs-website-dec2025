// === IMPORTS ===
import {
  THREE,
  Stats,
  gsap,
  Lenis,
  MountainScene,
  GrassScene,
  ScrollBender,
  AudioManager,
  ClientLogoCycler,
  AcceleratingGlobe,
  FlickCards,
  Navigation,
  TextScrambler,
  ServiceCards,
  initDisposables,
  initObserverHub,
  initPageVisibility,
  initBadgeRemover,
  initPageTitleChanger,
  QualityManager,
  PerformanceMonitor,
  CaseStudyNavigation,
  Config,
} from './modules.js';

// === CONFIGURATION & STATE ===

const barba = window.barba;
const container = document.getElementById('webgl');
const gradientEl = document.getElementById('webgl-gradient');
const clock = new THREE.Clock();
const stats = new Stats();

// === STATIC MOBILE/DESKTOP SPLIT ===
const isDesktop = window.innerWidth >= Config.System.desktopBreakpoint;
// Removed static selection; will inject dynamically
// const mobileVideo = document.getElementById('mobile-bg-video');

let isHome = false;
let mountainEl = null;
let lastWindowWidth = window.innerWidth;
let mountainVisible = false;
let lastMountainVisible = false; // Track previous state for transitions
let transitionGlobalFade = false;
let isTransitioning = false;
let siteEntered = false;

// Scroll State
let currentScrollY = window.scrollY;
let virtualScrollY = 0; // Starts at 0, accumulates globally
let globalScrollOffset = 0; // The base offset from previous pages
let lastRawScrollY = 0;

// === INITIALIZATION ===

initDisposables();
initObserverHub();
initBadgeRemover();
initPageTitleChanger();

// Initialize Quality & Performance
const qualityManager = new QualityManager();
const perfMonitor = new PerformanceMonitor(qualityManager);

// Initialize Lenis
const lenis = new Lenis({
  lerp: 0.05,
  smoothWheel: true,
});

initPageVisibility(lenis);

// --- SCROLL OPTIMIZATION ---
// let isScrollingTimer = null;
// lenis.on('scroll', () => {
//   document.body.classList.add('is-scrolling');

//   if (isScrollingTimer) clearTimeout(isScrollingTimer);

//   isScrollingTimer = setTimeout(() => {
//     document.body.classList.remove('is-scrolling');
//   }, 150); // Debounce: Remove class after stop
// });

stats.showPanel(0);
stats.dom.style.position = 'fixed';
stats.dom.style.left = '8px';
stats.dom.style.top = '8px';
stats.dom.style.zIndex = '2000';
stats.dom.style.display = 'none';
document.body.appendChild(stats.dom);

// Toggle stats visibility on Shift+D
document.addEventListener('keydown', (e) => {
  if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    stats.dom.style.display =
      stats.dom.style.display === 'none' ? 'block' : 'none';
  }
});

const renderer = new THREE.WebGLRenderer({
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(false);
container.appendChild(renderer.domElement);

// Pass QualityManager to scenes
let mountainScene, grassScene;

if (isDesktop) {
  // Desktop: Init Scenes
  mountainScene = new MountainScene(renderer, qualityManager);
  grassScene = new GrassScene(renderer, qualityManager);
} else {
  // Mobile: Inject Video, Skip Scenes
  console.log('[Mobile] Injecting Background Video');

  const video = document.createElement('video');
  video.id = 'mobile-bg-video';
  video.className = 'bg-video-mobile';
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;

  const source = document.createElement('source');
  source.src = './assets/video/showreel_optimised.mp4';
  source.type = 'video/mp4';

  video.appendChild(source);

  // Inject into canvas container
  if (container) {
    container.appendChild(video);
    // Explicitly hide WebGL canvas on mobile
    // renderer.domElement is appended but we can hide it or container
    // Actually we want video visible, canvas hidden.
    // Since video is in container, we keep container visible but hide #webgl
    const webglEl = document.getElementById('webgl');
    if (webglEl) webglEl.style.display = 'none';
  }

  // Force play
  video.play().catch((e) => console.log('Video Autoplay failed', e));
}

const scrollBender = new ScrollBender();
const audioManager = new AudioManager();
const clientLogoCycler = new ClientLogoCycler();
const acceleratingGlobe = new AcceleratingGlobe();
const flickCards = new FlickCards();
const navigation = new Navigation();
const serviceCards = new ServiceCards();
const textScrambler = new TextScrambler();
const caseStudyNavigation = new CaseStudyNavigation();

if (isDesktop) {
  renderer.setSize(container.clientWidth, container.clientHeight);
  mountainScene.resize(container.clientWidth, container.clientHeight);
  grassScene.resize(container.clientWidth, container.clientHeight);
}
textScrambler.init();

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

// We can replace this with observeWith now, but ResizeObserver is specialized.
// Keeping strictly for simplicity unless we want to wrap ResizeObserver in Hub too.
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
      if (isDesktop) {
        mountainScene.mount();
        // Start observing for size changes (handles transition/load timing)
        mountainObserver.observe(mountainEl);
      }

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
    if (isDesktop && grassScene) {
      grassScene.mount();
    }
  } else {
    isHome = false;

    // Cleanup observer
    if (mountainEl) {
      mountainObserver.unobserve(mountainEl);
    }
    mountainEl = null;

    if (isDesktop) {
      if (mountainScene) mountainScene.unmount();
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setScissorTest(false);
      if (grassScene) grassScene.mount();
    }
  }
}

// === EVENTS ===

function updateVirtualScroll() {
  // WITH LENIS: We trust lenis for the scroll value
  // STRICT SYNC: virtualScrollY is strictly absolute global offset + current local scroll
  // This preserves the exact easing curve of Lenis
  const raw = lenis.scroll; // Current local scroll on this page (smoothed)

  virtualScrollY = globalScrollOffset + raw;

  // Note: currentScrollY is used for non-infinite things, like mountain/bender
  // It should probably just track 'raw' (local) for those local effects?
  // Existing code sets currentScrollY = raw.
  currentScrollY = raw;
  lastRawScrollY = raw;
}

// Ensure Lenis updates happen
function onResize() {
  if (Math.abs(window.innerWidth - lastWindowWidth) < 2) return;
  lastWindowWidth = window.innerWidth;

  const w = container.clientWidth;
  const h = container.clientHeight;

  if (isDesktop) {
    renderer.setSize(w, h);
    if (mountainScene) mountainScene.resize(w, h);
    if (grassScene) grassScene.resize(w, h);
  }
  scrollBender.resize();

  // update cache
  calcMountainConfig();

  // === RELOAD ON BREAKPOINT CROSS ===
  const newIsDesktop = window.innerWidth >= Config.System.desktopBreakpoint;
  if (newIsDesktop !== isDesktop) {
    console.log('[Resize] Breakpoint crossed. Reloading...');
    window.location.reload();
  }
}
window.addEventListener('resize', onResize, { passive: true });

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

          // === NEW DISPOSABLE SYSTEM ===
          // Automatically clean up any registered listeners/observers
          window.cleanupOnLeave();

          // Update Global Offset for Continuity
          // Current virtual position becomes the new "zero" base for the next page
          globalScrollOffset = virtualScrollY;

          // Still call specific component destroys if they are not yet using global disposables
          clientLogoCycler.destroy();
          acceleratingGlobe.destroy();
          flickCards.destroy();
          serviceCards.destroy();
          caseStudyNavigation.destroy();
          // ...

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
          // Re-init global systems if needed (Disposables are already cleared)
        },
        enter(data) {
          return new Promise((resolve) => {
            try {
              // Reset Scroll via Lenis
              // window.isNavigatingReset = true; // Removed (Legacy Delta logic)
              isTransitioning = true;

              // window.scrollTo(0, 0); // Native
              lenis.scrollTo(0, { immediate: true }); // Lenis

              lastRawScrollY = 0;
              currentScrollY = 0;
              // note: virtualScrollY will automatically pick up globalScrollOffset + 0 on next frame

              // requestAnimationFrame(() => {
              //   window.isNavigatingReset = false;
              // });

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
                  data.current.container,
                );
              }

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
          serviceCards.init(); // Re-init service cards
          textScrambler.init();
          caseStudyNavigation.init(lenis);
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

// Init Components
clientLogoCycler.init();
acceleratingGlobe.init();
flickCards.init();
serviceCards.init();
textScrambler.init();
caseStudyNavigation.init(lenis);

// === ANIMATION LOOP ===

function animate(time) {
  perfMonitor.beginFrame();

  // Use 'time' from RAF which is more precise
  lenis.raf(time);

  stats.begin();
  requestAnimationFrame(animate);

  // const time = performance.now() * 0.001; // Existing logic uses seconds
  const t = time * 0.001;
  const dt = clock.getDelta();

  // Poll scroll directly (from Lenis now inside updateVirtualScroll)
  updateVirtualScroll();

  // Default viewport for full screen
  renderer.setViewport(0, 0, container.clientWidth, container.clientHeight);
  renderer.setScissorTest(false);

  // Update MountainScene "Relative Scroll" position
  if (mountainScene) mountainScene.updateScroll(currentScrollY);

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
    // BUT only if mountainEl actually exists (otherwise we are not effectively on home or element is missing)
    if (mountainEl && mountainConfig.height === 0) {
      mountainVisible = true;
    } else if (mountainEl) {
      // Standard check: is it effectively on screen?
      const elTop = mountainConfig.top - currentScrollY;
      if (elTop + mountainConfig.height > 0 && elTop < window.innerHeight) {
        mountainVisible = true;
      }
    }
  }

  // === VIDEO PLAYBACK CONTROL ===
  if (mountainVisible !== lastMountainVisible) {
    if (mountainVisible && siteEntered) {
      if (mountainScene) mountainScene.playVideo();
    } else {
      if (mountainScene) mountainScene.pauseVideo();
    }
    lastMountainVisible = mountainVisible;
  }

  // RENDER ORDER & EXCLUSIVITY:
  // "Never have dual scene rendering. Always have only one."

  // 1. Mountain (Priority if visible)
  // 1. Mountain (Priority if visible)
  if (isDesktop) {
    if (mountainVisible) {
      // Render Mountain ONLY
      if (mountainScene) {
        mountainScene.update(t, dt);
        mountainScene.render();

        // Push scroll to grass even if not rendering, so it doesn't jump
        // Use smoothed virtualScrollY from Lenis logic (continuous across pages)
        if (
          window.innerWidth >= Config.System.desktopBreakpoint &&
          grassScene
        ) {
          grassScene.updateScrollState(virtualScrollY);
        }
      }
    } else {
      // 2. Grass (Fallback if Mountain not visible)
      if (window.innerWidth >= Config.System.desktopBreakpoint && grassScene) {
        grassScene.updateScrollState(virtualScrollY);
        grassScene.update(t, dt);
        grassScene.render();
      }
    }
  }

  // Update scroll bending effect independently of scenes
  scrollBender.update(currentScrollY);

  // === GRADIENT OVERLAY ANIMATION ===
  if (gradientEl) {
    if (isHome) {
      // 0 opacity at scroll 0, 1 opacity at scroll 100vh (window.innerHeight)
      const h = window.innerHeight;
      const opacity = Math.min(1, Math.max(0, currentScrollY / h));
      gradientEl.style.opacity = opacity;
    } else {
      // Always visible on other pages
      gradientEl.style.opacity = 1;
    }
  }

  stats.end();
  perfMonitor.endFrame();
}

// Start the animation loop (or ensure it runs)
requestAnimationFrame(animate);

// Initial Load Complete: Fade out the global loader
// Initial Load Complete: Interactive entry
const initialLoader = document.querySelector('.global-loader');
const loaderBtn = document.getElementById('loader-button');
const loaderBtnMute = document.getElementById('loader-button-mute');

if (initialLoader && loaderBtn) {
  // 1. Start Dot Animation
  let dots = 0;
  const dotInterval = setInterval(() => {
    dots = (dots + 1) % 4; // 0, 1, 2, 3
    loaderBtn.textContent = 'Loading' + '.'.repeat(dots);
  }, 1000);

  // 2. Wait for Video to be Ready (Real Load Event)

  const video = isDesktop
    ? mountainScene.video
    : document.getElementById('mobile-bg-video');

  function onReady() {
    // 3. Pre-flight Benchmark (500ms dead time)
    loaderBtn.textContent = 'Calibrating...';
    perfMonitor.startBenchmark();

    setTimeout(() => {
      perfMonitor.endBenchmark();

      clearInterval(dotInterval);
      loaderBtn.textContent = 'Click to Enter';
      loaderBtn.classList.remove('is-secondary');

      // Show Mute Option
      if (loaderBtnMute) {
        loaderBtnMute.style.display = 'block';
      }

      // 3a. Main Interaction (With Audio)
      loaderBtn.addEventListener(
        'click',
        () => {
          // Unlock Audio Context
          audioManager.unlock();
          enterSite();
        },
        { once: true },
      );

      // 3b. Mute Interaction (Without Audio)
      if (loaderBtnMute) {
        loaderBtnMute.addEventListener(
          'click',
          () => {
            // Do NOT unlock audio context
            console.log('Entering without audio context');
            audioManager.setMute(true); // Update UI to 'SOUND OFF'
            enterSite();
          },
          { once: true },
        );
      }
    }, 800); // 800ms dead time for benchmark
  }

  function enterSite() {
    siteEntered = true;
    // Trigger Animation
    if (isDesktop && mountainScene) {
      mountainScene.animateEntry();
    } else {
      // Mobile: Manually fade in content since MountainScene is absent
      const mainWrapper = document.querySelector('.main-wrapper');
      if (mainWrapper) {
        gsap.to(mainWrapper, { opacity: 1, duration: 1 });
      }
    }

    // Animate Out Loader
    gsap.to(initialLoader, {
      opacity: 0,
      pointerEvents: 'none',
      duration: 0.5,
    });
  }

  function checkBuffer() {
    if (!video) {
      onReady(); // Fallback
      return;
    }

    // 1. Initial State Check (HAVE_CURRENT_DATA or more)
    if (video.readyState < 2) {
      requestAnimationFrame(checkBuffer);
      return;
    }

    // 2. Check Buffer Percentage
    let percentLoaded = 0;
    // CRITICAL FIX: Summing ranges hides gaps!
    // Ensure we have a CONTINUOUS block of data from the current time.
    const ct = video.currentTime;
    const duration = video.duration || 1;

    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);

      // Find the range that covers our current playback position
      if (ct >= start && ct <= end) {
        // How much is loaded AHEAD of us in this specific contiguous block?
        const loadedSeconds = end - ct;
        percentLoaded = (loadedSeconds / duration) * 100;

        // DEBUG: Log gaps if we are stuck
        if (video.buffered.length > 1) {
          console.warn(
            `[Video Loader] Fragmentation detected! ${video.buffered.length} ranges.`,
          );
        }
        break; // Found our range, stop searching
      }
    }
    // Update Loader Text for Feedback (Optional but helpful)
    // loaderBtn.textContent = \`Loading \${Math.min(99, Math.floor(percentLoaded))}%\`;

    // 3. Threshold Check
    // STRICT: User requested 100% (wait for full download).
    if (Math.floor(percentLoaded) > (checkBuffer.lastLogged || 0) + 10) {
      console.log(`[Video Loader] Buffered: ${Math.floor(percentLoaded)}%`);
      checkBuffer.lastLogged = Math.floor(percentLoaded);
    }

    if (percentLoaded > 99) {
      console.log(
        `[Video Loader] Ready triggered by: Buffer 100% (${Math.floor(
          percentLoaded,
        )}%)`,
      );
      onReady();
    } else {
      requestAnimationFrame(checkBuffer);
    }
  }

  // Start checking immediately (video is already created in MountainScene or injected)
  checkBuffer();
}
