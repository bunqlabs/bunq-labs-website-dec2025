export class VideoLoader {
  constructor() {
    this.videos = new Map();
    this.progress = 0;
    this.totalProgress = 0;
    this.onProgress = null;
    this.onComplete = null;
    this.checkInterval = null;
  }

  /**
   * Start loading a list of videos.
   * @param {Array<{id: string, src: string}>} items
   */
  load(items) {
    if (!items || items.length === 0) {
      if (this.onComplete) this.onComplete();
      return;
    }

    items.forEach((item) => {
      const video = document.createElement('video');
      video.src = item.src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';

      // Store
      this.videos.set(item.id, {
        element: video,
        loaded: 0,
        ready: false,
        error: false,
      });

      // Error Handling
      video.onerror = () => {
        console.error(
          `[VideoLoader] Failed to load ${item.id}: ${video.error ? video.error.message : 'Unknown'}`,
        );
        const vData = this.videos.get(item.id);
        if (vData) {
          vData.error = true;
          vData.loaded = 100; // Treat as "done" to unblock loader
          vData.ready = true;
        }
      };

      // Start loading
      video.load();
    });

    // Start Polling
    this.startPolling();
  }

  getVideo(id) {
    const vData = this.videos.get(id);
    return vData ? vData.element : null;
  }

  isReady(id) {
    const vData = this.videos.get(id);
    return vData ? vData.ready : false;
  }

  checkBuffer(video) {
    if (!video) return 100; // Should not happen
    if (video.error) return 100;

    // Ready State Check
    if (video.readyState < 2) return 0; // Not enough data

    let percentLoaded = 0;
    const duration = video.duration || 1;

    // Check buffered ranges
    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);

      // Simple logic: If we have > 90% of duration buffered anywhere, good enough?
      // Or specific range from 0? Let's check total buffered duration.
      // Actually, reliable "Can Play" usually means we have a chunk at the start.
      // Let's rely on browser 'canplaythrough' event logic mostly,
      // but explicit buffering check is safer for custom progress bars.

      // We'll trust the END of the last buffer for simple progress
      if (end > duration * 0.9) {
        percentLoaded = 100;
        break;
      }

      // Accumulate coverage?
      // Let's just use the end time of the buffer covering time=0
      if (start <= 0.1) {
        percentLoaded = Math.min(100, (end / duration) * 100);
      }
    }

    // Fallback: readyState 4 means "HAVE_ENOUGH_DATA"
    if (video.readyState === 4 && percentLoaded < 20) {
      // Browser says yes, but buffer looks small. Trust browser if duration is short.
      percentLoaded = Math.max(percentLoaded, 50);
    }

    return percentLoaded;
  }

  startPolling() {
    if (this.checkInterval) clearInterval(this.checkInterval);

    this.checkInterval = setInterval(() => {
      let total = 0;
      let allReady = true;

      this.videos.forEach((vData, id) => {
        // If already error/ready, keep 100
        if (vData.error) {
          total += 100;
          return;
        }

        const pct = this.checkBuffer(vData.element);
        vData.loaded = pct;
        total += pct;

        // Threshold for "Ready"
        if (pct < 98 && !vData.ready) {
          allReady = false;
        } else {
          vData.ready = true;
        }
      });

      this.progress = total / this.videos.size;

      if (this.onProgress) {
        this.onProgress(this.progress);
      }

      if (allReady) {
        this.finish();
      }
    }, 100); // Check every 100ms
  }

  finish() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.onComplete) {
      this.onComplete();
    }
  }

  destroy() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.videos.clear();
  }
}
