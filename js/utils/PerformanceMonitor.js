export class PerformanceMonitor {
  constructor(onDrop) {
    this.onDrop = onDrop;
    this.frames = 0;
    this.timeAccum = 0;
    this.checkInterval = 5.0; // Check every 5s
    this.warmupTime = 3.0; // Ignore first 3s
    this.totalTime = 0;
    this.isHidden = false;

    document.addEventListener('visibilitychange', () => {
      this.isHidden = document.hidden;
      if (!this.isHidden) {
        // Reset accumulators on resume to prevent immediate drops
        this.frames = 0;
        this.timeAccum = 0;
        console.log('[PerformanceMonitor] Tab visible - Resumed monitoring');
      } else {
        console.log('[PerformanceMonitor] Tab hidden - Paused monitoring');
      }
    });

    console.log('[PerformanceMonitor] Initialized');
  }

  update(dt) {
    // Skip if hidden or if dt is suspiciously large (e.g. valid resume frame)
    if (this.isHidden || dt > 1.0) return;

    this.totalTime += dt;
    if (this.totalTime < this.warmupTime) return;

    this.frames++;
    this.timeAccum += dt;

    if (this.timeAccum >= this.checkInterval) {
      const avgFps = this.frames / this.timeAccum;
      // Log every interval check for visibility
      console.log(`[PerformanceMonitor] Check: ${avgFps.toFixed(1)} FPS`);

      if (avgFps < 20) {
        console.warn(
          `[PerformanceMonitor] FPS Low (${avgFps.toFixed(
            1
          )}). Triggering drop handler.`
        );
        this.onDrop(avgFps);
      }
      // Reset for next interval
      this.frames = 0;
      this.timeAccum = 0;
    }
  }
}
