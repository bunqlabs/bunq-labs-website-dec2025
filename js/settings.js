export const Config = {
  System: {
    desktopBreakpoint: 1024,
  },
  Mountain: {
    snowCount: 500,
    snowArea: { x: 0.5, y: 0.5, z: 0.5 },
    screenWidth: 0.192,
    screenHeight: 0.192,
    screenLightIntensity: 500,
    videoSampleResolution: { w: 4, h: 4 },
    lightUpdateSkipThreshold: 0.1, // Skip if frame time > 100ms
    snowFallSpeed: 0.1,
    snowSway: 0.001,
    snowWindX: 0.03,
    snowWindZ: 0.1,
    cameraFovDesktop: 25,
    cameraFovMobile: 40,
    bgPlaneHeightDesktop: 0.7,
    bgPlaneHeightMobile: 1.0,
  },
  Grass: {
    planeSize: 30,

    scrollNormPerPixel: 0.0005,
    maxGrassCount: 25000,
    mobileMaxGrassCount: 15000,
    mobileDPR: 1, // Force lower resolution on mobile
    minDPR: 1, // Absolute minimum DPR
    bladeWidth: 0.3,
    bladeHeight: 1.2,
    maxWindOffset: 1.0, // Cap wind displacement to 1.2x height
    bladeSegments: 1,
    taperFactor: 0.05,
    camera: {
      fov: 75,
      near: 0.1,
      far: 1000,
      position: [0, 20, 0],
      lookAt: [0, 0, 0],
    },
    uniforms: {
      turbulenceAmplitude: 0.5,
      turbulenceFrequency: 0.2,
      windStrength: 0.8,
      trailDecay: 0.1,
      diffusion: 0.0,
      advection: 1.0,
      injectionRadius: 0.03,
      injectionStrength: 10.0,
      injectionStrengthMax: 1.0,
      fieldResolution: 16,
      glowThreshold: 0.03,
      glowBoost: 0.2,
    },
  },
};
