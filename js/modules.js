// External Libraries
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';
import ScrollTrigger from 'https://unpkg.com/gsap@3.12.5/ScrollTrigger.js?module';
import Lenis from 'https://unpkg.com/lenis@1.1.18/dist/lenis.mjs';

gsap.registerPlugin(ScrollTrigger);

// Export External Libraries
export { THREE, Stats, gsap, ScrollTrigger, Lenis };

// Utilities
export { initDisposables } from './utils/disposableManager.js';
export { initObserverHub } from './utils/observerHub.js';
export { initPageVisibility } from './utils/pageVisibility.js';
export { initBadgeRemover } from './utils/badgeRemover.js';
export { initPageTitleChanger } from './utils/pageTitleChanger.js';
export { QualityManager } from './utils/QualityManager.js';
export { PerformanceMonitor } from './utils/PerformanceMonitor.js';

// Scenes
export { MountainScene } from './scenes/MountainScene.js';
export { GrassScene } from './scenes/GrassScene.js';

// Components
export { ScrollBender } from './components/ScrollBender.js';
export { AudioManager } from './components/AudioManager.js';
export { ClientLogoCycler } from './components/ClientLogoCycler.js';
export { AcceleratingGlobe } from './components/AcceleratingGlobe.js';
export { FlickCards } from './components/FlickCards.js';
export { Navigation } from './components/Navigation.js';
export { TextScrambler } from './components/TextScrambler.js';
export { ServiceCards } from './components/ServiceCards.js';
