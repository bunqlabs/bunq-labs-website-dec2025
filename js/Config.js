export const Config = {
    Mountain: {
        snowCount: 1000,
        snowArea: { x: 0.5, y: 0.5, z: 0.5 },
        screenWidth: 0.192,
        screenHeight: 0.108,
        screenLightIntensity: 500,
        videoSampleResolution: { w: 4, h: 4 },
        lightUpdateSkipThreshold: 0.022 // Skip if frame time > 22ms
    },
    Grass: {
        planeSize: 30,

        scrollNormPerPixel: 0.0005,
        maxGrassCount: 15000,
        mobileMaxGrassCount: 10000,
        mobileDPR: 1, // Force lower resolution on mobile
        minDPR: 1, // Absolute minimum DPR
        bladeWidth: 0.4,
        bladeHeight: 1.0,
        maxWindOffset: 1.2, // Cap wind displacement to 1.2x height
        bladeSegments: 1,
        taperFactor: 0.05,
        camera: {
            fov: 75,
            near: 0.1,
            far: 1000,
            position: [0, 20, 0],
            lookAt: [0, 0, 0]
        },
        uniforms: {
            turbulenceAmplitude: 0.4,
            turbulenceFrequency: 0.2,
            windStrength: 1.2,
            trailDecay: 0.98,
            diffusion: 0.25,
            advection: 1.0,
            injectionRadius: 0.04,
            injectionStrength: 1.0,
            injectionStrengthMax: 1.0,
            fieldResolution: 32,
            glowThreshold: 0.05,
            glowBoost: 0.3
        }
    }
};
