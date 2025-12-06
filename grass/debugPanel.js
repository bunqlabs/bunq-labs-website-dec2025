import GUI from "lil-gui";

// Initializes the lil-gui debug panel for uniforms and optional controls.
// Returns the GUI instance so callers can customize if needed.
// controlsApi (optional): { getOrbitEnabled(): boolean, setOrbitEnabled(bool): void }
export function initDebugPanel(
  uniforms,
  windField = null,
  configValues = null,
  controlsApi = null
) {
  const gui = new GUI({ title: "Grass" });

  const turbulence = gui.addFolder("Turbulence");
  turbulence
    .add(uniforms.turbulenceAmplitude, "value", 0.0, 2.0, 0.1)
    .name("Amplitude");
  turbulence
    .add(uniforms.turbulenceFrequency, "value", 0.0, 5.0, 0.1)
    .name("Frequency");
  turbulence.add(uniforms.damping, "value", 0.0, 2.0, 0.01).name("Damping");

  const wind = gui.addFolder("Wind Field");
  wind.add(uniforms.windStrength, "value", 0.0, 5.0, 0.05).name("Strength");
  if (windField && configValues) {
    wind
      .add(configValues, "trailDecay", 0.9, 0.999, 0.001)
      .name("Decay")
      .onChange((v) => windField.setParams({ decay: v }));
    wind
      .add(configValues, "diffusion", 0.0, 1.0, 0.01)
      .name("Diffusion")
      .onChange((v) => windField.setParams({ diffusion: v }));
    wind
      .add(configValues, "advection", 0.0, 3.0, 0.05)
      .name("Advection")
      .onChange((v) => windField.setParams({ advection: v }));
    wind
      .add(configValues, "injectionRadius", 0.005, 0.2, 0.001)
      .name("Brush Radius")
      .onChange((v) => windField.setParams({ injectionRadius: v }));
    wind
      .add(configValues, "injectionStrength", 0.1, 5.0, 0.05)
      .name("Brush Strength")
      .onChange((v) => windField.setParams({ injectionStrength: v }));
  }
  if (controlsApi) {
    const cam = gui.addFolder("Camera");
    const params = {
      orbitControls: !!controlsApi.getOrbitEnabled?.(),
      scrollLoops:
        typeof controlsApi.getScrollSpeed === "function"
          ? controlsApi.getScrollSpeed()
          : 4,
      bendMax:
        typeof controlsApi.getBendMax === "function"
          ? controlsApi.getBendMax()
          : -8,
    };
    cam
      .add(params, "orbitControls")
      .name("Orbit Controls")
      .onChange((v) => controlsApi.setOrbitEnabled?.(!!v));
    cam
      .add(params, "scrollLoops", 0, 12, 0.0005)
      .name("Scroll Loops")
      .onChange((v) => controlsApi.setScrollSpeed?.(v));
    cam
      .add(params, "bendMax", 0, 30, 0.5)
      .name("Bend Max (deg)")
      .onChange((v) => controlsApi.setBendMax?.(v));
  }
  // Glow controls
  const glow = gui.addFolder("Glow");
  glow.add(uniforms.glowThreshold, "value", 0.0, 10.0, 0.1).name("Threshold");
  glow.add(uniforms.glowBoost, "value", 0.0, 2.0, 0.05).name("Boost");

  gui.close();

  return gui;
}
