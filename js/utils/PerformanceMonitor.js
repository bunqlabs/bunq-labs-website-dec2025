export class PerformanceMonitor {
  constructor(qualityManager) {
    this.qm = qualityManager;

    // Config
    this.targetFPS = 60;
    this.frameBudget = 1000 / this.targetFPS; // 16.6ms

    // State
    this.frames = 0;
    this.timeAccum = 0;
    this.lastTime = performance.now();

    // Metrics
    this.avgFrameTime = 0; // CPU time
    this.avgInterval = 0;  // Real time between frames

    // Logic
    this.consecutiveBadFrames = 0;
    this.consecutiveGoodFrames = 0;
    this.cooldown = 0; // Time to wait after a quality change

    this.isHidden = false;
    document.addEventListener('visibilitychange', () => {
      this.isHidden = document.hidden;
      if (!this.isHidden) {
        this.reset();
      }
    });

    console.log('[PerformanceMonitor] Initialized with GPU Load Estimation');
  }

  reset() {
    this.frames = 0;
    this.timeAccum = 0;
    this.lastTime = performance.now();
    this.consecutiveBadFrames = 0;
  }

  // Call this at the START of the frame (before rendering)
  beginFrame() {
    this.frameStart = performance.now();
  }

  // Call this at the END of the frame (after renderer.render)
  endFrame() {
    const now = performance.now();
    const cpuTime = now - this.frameStart;
    const interval = now - this.lastTime;
    this.lastTime = now;

    if (this.isHidden || interval > 500) return; // Skip outliers/resume

    // Exponential Moving Average for smoothing
    // Alpha = 0.05 means ~20 frame smoothing
    this.avgFrameTime = this.avgFrameTime * 0.95 + cpuTime * 0.05;
    this.avgInterval = this.avgInterval * 0.95 + interval * 0.05;

    this.analyze(interval, cpuTime);
  }

  // Legacy support for simple update(dt) if needed, but we prefer explicit begin/end
  update(dt) {
    // If user hasn't switched to begin/end, we just use interval
    // but we can't measure CPU-only time this way.
    // For now, let's assume valid usage is via beginFrame/endFrame
  }

  analyze(interval, cpuTime) {
    // Use raw interval for benchmarking to capture spikes accurately
    if (this.isBenchmarking) {
      if (this.benchmarkData && this.benchmarkData.frameTimes) {
        this.benchmarkData.frameTimes.push(interval);
      }
      return;
    }

    if (this.cooldown > 0) {
      this.cooldown -= this.avgInterval; // Decrease by ms
      return;
    }

    // 1. Is FPS too low? (25 FPS => 40.0ms)
    // User requested 25 FPS drop threshold (to support 30fps caps)
    const isLagging = this.avgInterval > 40.0;

    // 2. Is it GPU bound? 
    // If CPU time is low (e.g. 5ms) but Interval is high, GPU is the bottleneck.
    // Use smoothed values for stability in reactive logic
    const isGPUBound = (this.avgInterval - this.avgFrameTime) > 8.0;

    if (isLagging) {
      this.consecutiveBadFrames++;
      this.consecutiveGoodFrames = 0;

      if (this.consecutiveBadFrames > 60) { // ~1 second of lag (at 60fps pacing check)
        // If running at 30fps, this check might take 2 seconds of wall time, which is fine.
        console.warn(`[Performance] Downgrade! AvgInt: ${this.avgInterval.toFixed(1)}ms. GPU Bound: ${isGPUBound}`);

        const changed = this.qm.adjustQuality(-1);
        if (changed) {
          this.cooldown = 2000; // 2s cooldown
          this.reset();
        } else {
          this.consecutiveBadFrames = 0;
        }
      }
    } else if (this.avgInterval < 16.8) { // Consistent 60fps (allow tiny jitter below 16.66)
      this.consecutiveGoodFrames++;
      this.consecutiveBadFrames = 0;

      if (this.consecutiveGoodFrames > 300) { // ~5 seconds of smooth 60
        // Attempt upgrade
        const changed = this.qm.adjustQuality(1);
        if (changed) {
          console.log('[Performance] Upgrade attempted - Performance is solid.');
          this.cooldown = 3000; // 3s cooldown to see if it holds
          this.reset();
        } else {
          // At max tier
          this.consecutiveGoodFrames = 0; // Reset to avoid constant checks
        }
      }
    }
  }

  // === ROBUST BENCHMARKING ===

  startBenchmark() {
    console.log('[Performance] Starting Pre-flight Benchmark...');
    this.isBenchmarking = true;
    this.benchmarkData = { 
      frameTimes: [],
      startTime: performance.now()
    };
    this.reset();
  }

  endBenchmark() {
    this.isBenchmarking = false;
    const data = this.benchmarkData.frameTimes;
    const sampleCount = data.length;

    if (sampleCount < 5) {
      console.warn('[Performance] Benchmark: Not enough samples, assuming OK.');
      return;
    }

    // 1. Sort samples
    data.sort((a, b) => a - b);

    // 2. Discard Warmup (First 20% of chronological frames, but since we sorted, 
    //    we should have stored timestamps if we wanted strict chronological warmup.
    //    However, simpler heuristic: invalid outliers usually appear as extremes.
    //    Let's just use the Median (P50) which naturally ignores outliers.
    
    //    Wait, logic check: In analyze(), we push 'avgInterval'. 
    //    During benchmark, we should push 'interval' raw to avoid EMA smoothing masking spikes.
    
    // 3. Calculate Median
    const median = data[Math.floor(sampleCount * 0.5)];
    const p90 = data[Math.floor(sampleCount * 0.9)]; // 90th percentile (worst case)

    console.log(`[Performance] Benchmark Result (N=${sampleCount}): Median=${median.toFixed(1)}ms, P90=${p90.toFixed(1)}ms`);

    // 4. Hardware Heuristics
    // If device has low logical cores, be more aggressive with downgrade
    let threshold = 33.3; // Default 30 FPS floor
    const cores = navigator.hardwareConcurrency || 4;
    
    if (cores < 4) {
      console.log(`[Performance] Low core count (${cores}), tightening threshold.`);
      threshold = 28.0; // Require closer to 35-40 FPS explicitly
    }

    // Decision
    // We care about P50 (typical experience). If typical is bad, downgrade.
    // We also check P90: if P90 is terrible (>50ms), it's stuttery.
    if (median > threshold || p90 > 55.0) {
      console.warn('[Performance] Benchmark Failed. Downgrading immediately.');
      this.qm.adjustQuality(-1);
    }
  }

}
