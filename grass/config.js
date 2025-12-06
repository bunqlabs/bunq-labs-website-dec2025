// Tweakable configuration values for the grass scene

export const planeSize = 30;
export const MAX_GRASS_COUNT = 50000;
export const INITIAL_GRASS_COUNT = 30000;
export const grassCount = MAX_GRASS_COUNT; // Export for buffer allocation sizing

export const bladeWidth = 0.4;
export const bladeHeight = 1.2;
export const bladeSegments = 1;
export const taperFactor = 0.0; // 0..1 (fraction of base width at tip)

// Initial uniform values exposed to the GUI
export const initialUniforms = {
  turbulenceAmplitude: 0.4,
  turbulenceFrequency: 0.2,
  damping: 0.3,
  // Wind interaction via field
  windStrength: 1.2, // scales field effect in vertex
  trailDecay: 0.98, // field decay per frame (closer to 1 = longer trails)
  diffusion: 0.25, // 0..1 blur mix
  advection: 1.0, // how far the field self-advects per second
  injectionRadius: 0.02, // in UV (0..1) units
  injectionStrength: 1.0, // base injection power
  injectionStrengthMax: 1.0, // clamp for hover effect power
  fieldResolution: 32, // texture resolution for the wind field
  // Glow behavior
  glowThreshold: 0.05,
  glowBoost: 0.2,
};

// Scroll conveyor behaviour
export const conveyorConfig = {
  loops: 0.4, // number of full field loops across the entire page scroll
};

// Optional camera configuration (kept here for convenience)
export const cameraConfig = {
  fov: 75,
  near: 0.1,
  far: 1000,
  position: [0, 20, 0],
  lookAt: [0, 0, 0],
};
