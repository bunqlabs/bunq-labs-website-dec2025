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

    // Benchmark State
    this.isBenchmarking = false;
    this.benchmarkData = { frames: 0, totalTime: 0 };

    this.analyze();
  }

  // Legacy support for simple update(dt) if needed, but we prefer explicit begin/end
  update(dt) {
    // If user hasn't switched to begin/end, we just use interval
    // but we can't measure CPU-only time this way.
    // For now, let's assume valid usage is via beginFrame/endFrame
  }

  startBenchmark() {
    console.log('[Performance] Starting Pre-flight Benchmark...');
    this.isBenchmarking = true;
    this.benchmarkData = { frames: 0, totalTime: 0 };
    this.reset();
  }

  endBenchmark() {
    this.isBenchmarking = false;
    const avg = this.benchmarkData.totalTime / (this.benchmarkData.frames || 1);

    console.log(`[Performance] Benchmark Result: ${avg.toFixed(1)}ms per frame`);

    if (avg > 33.3) {
      console.warn('[Performance] Benchmark Failed (Low FPS). Downgrading immediately.');
      this.qm.adjustQuality(-1); // Force drop
    }
  }

  analyze() {
    if (this.isBenchmarking) {
      // Just accumulate, don't trigger reactive logic
      this.benchmarkData.frames++;
      this.benchmarkData.totalTime += this.avgInterval; // Use EMA or raw interval?
      // actually endFrame() updates avgInterval. 
      // Let's use avgInterval as it smooths out the very first bad frame.
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
}
