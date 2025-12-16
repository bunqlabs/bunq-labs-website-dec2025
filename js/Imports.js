// External Libraries
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';
import Lenis from 'https://unpkg.com/lenis@1.1.18/dist/lenis.mjs';

// Export External Libraries
export { THREE, Stats, gsap, Lenis };

// Utilities
export { initDisposables } from './utils/DisposableManager.js';
export { initObserverHub } from './utils/ObserverHub.js';
export { initPageVisibility } from './utils/PageVisibility.js';
export { initBadgeRemover } from './utils/BadgeRemover.js';
export { initPageTitleChanger } from './utils/PageTitleChanger.js';

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
