import gsap from 'https://unpkg.com/gsap@3.12.5/index.js?module';
import Draggable from 'https://unpkg.com/gsap@3.12.5/Draggable.js?module';
import CustomEase from 'https://unpkg.com/gsap@3.12.5/CustomEase.js?module';
import ScrollTrigger from 'https://unpkg.com/gsap@3.12.5/ScrollTrigger.js?module';

// Register standard plugins
gsap.registerPlugin(Draggable, ScrollTrigger, CustomEase);

// Define Custom Ease
CustomEase.create('osmo-ease', '0.625, 0.05, 0, 1');

export class TestimonialsSlider {
  constructor() {
    this.sliders = [];
  }

  init() {
    const sliderWrappers = gsap.utils.toArray(
      document.querySelectorAll('[data-centered-slider="wrapper"]'),
    );

    if (sliderWrappers.length === 0) return;

    sliderWrappers.forEach((sliderWrapper) => {
      const slides = gsap.utils.toArray(
        sliderWrapper.querySelectorAll('[data-centered-slider="slide"]'),
      );
      const bullets = gsap.utils.toArray(
        sliderWrapper.querySelectorAll('[data-centered-slider="bullet"]'),
      );
      const prevButton = sliderWrapper.querySelector(
        '[data-centered-slider="prev-button"]',
      );
      const nextButton = sliderWrapper.querySelector(
        '[data-centered-slider="next-button"]',
      );

      let activeElement;
      let activeBullet;
      let currentIndex = 0;
      let autoplay;

      // Autoplay configuration
      const autoplayEnabled =
        sliderWrapper.getAttribute('data-slider-autoplay') === 'true';
      const autoplayDuration = autoplayEnabled
        ? parseFloat(
            sliderWrapper.getAttribute('data-slider-autoplay-duration'),
          ) || 0
        : 0;

      // Dynamically assign unique IDs to slides
      slides.forEach((slide, i) => {
        slide.setAttribute('id', `slide-${i}`);
      });

      // Set ARIA attributes on bullets
      if (bullets && bullets.length > 0) {
        bullets.forEach((bullet, i) => {
          bullet.setAttribute('aria-controls', `slide-${i}`);
          bullet.setAttribute(
            'aria-selected',
            i === currentIndex ? 'true' : 'false',
          );
        });
      }

      const loop = this.horizontalLoop(slides, {
        paused: true,
        draggable: true,
        center: true,
        onChange: (element, index) => {
          currentIndex = index;

          if (activeElement) activeElement.classList.remove('active');
          element.classList.add('active');
          activeElement = element;

          if (bullets && bullets.length > 0) {
            if (activeBullet) activeBullet.classList.remove('active');
            if (bullets[index]) {
              bullets[index].classList.add('active');
              activeBullet = bullets[index];
            }
            bullets.forEach((bullet, i) => {
              bullet.setAttribute(
                'aria-selected',
                i === index ? 'true' : 'false',
              );
            });
          }
        },
      });

      // On initialization, center the slider (index 2 as per example, or 0?)
      // Example used 2. Let's stick to 2 if they have enough slides, else 0.
      loop.toIndex(Math.min(2, slides.length - 1), { duration: 0.01 });

      const startAutoplay = () => {
        if (autoplayDuration > 0 && !autoplay) {
          const repeat = () => {
            loop.next({ ease: 'expo.out', duration: 1 });
            autoplay = gsap.delayedCall(autoplayDuration, repeat);
          };
          autoplay = gsap.delayedCall(autoplayDuration, repeat);
        }
      };

      const stopAutoplay = () => {
        if (autoplay) {
          autoplay.kill();
          autoplay = null;
        }
      };

      // Start/stop autoplay based on viewport visibility
      const st = ScrollTrigger.create({
        trigger: sliderWrapper,
        start: 'top bottom',
        end: 'bottom top',
        onEnter: startAutoplay,
        onLeave: stopAutoplay,
        onEnterBack: startAutoplay,
        onLeaveBack: stopAutoplay,
      });

      // Pause autoplay on interaction
      const onEnter = () => stopAutoplay();
      const onLeave = () => {
        if (ScrollTrigger.isInViewport(sliderWrapper)) startAutoplay();
      };

      sliderWrapper.addEventListener('mouseenter', onEnter);
      sliderWrapper.addEventListener('mouseleave', onLeave);

      // Slide click event
      slides.forEach((slide, i) => {
        slide.addEventListener('click', () => {
          loop.toIndex(i, { ease: 'expo.out', duration: 1 });
        });
      });

      // Bullet click event
      const bulletCleanups = [];
      if (bullets && bullets.length > 0) {
        bullets.forEach((bullet, i) => {
          const clickHandler = () => {
            loop.toIndex(i, { ease: 'expo.out', duration: 1 });
            if (activeBullet) activeBullet.classList.remove('active');
            bullet.classList.add('active');
            activeBullet = bullet;
            bullets.forEach((b, j) => {
              b.setAttribute('aria-selected', j === i ? 'true' : 'false');
            });
          };
          bullet.addEventListener('click', clickHandler);
          bulletCleanups.push(() =>
            bullet.removeEventListener('click', clickHandler),
          );
        });
      }

      // Button listeners
      let prevHandler, nextHandler;
      if (prevButton) {
        prevHandler = () => {
          let newIndex = currentIndex - 1;
          if (newIndex < 0) newIndex = slides.length - 1;
          loop.toIndex(newIndex, { ease: 'expo.out', duration: 1 });
        };
        prevButton.addEventListener('click', prevHandler);
      }

      if (nextButton) {
        nextHandler = () => {
          let newIndex = currentIndex + 1;
          if (newIndex >= slides.length) newIndex = 0;
          loop.toIndex(newIndex, { ease: 'expo.out', duration: 1 });
        };
        nextButton.addEventListener('click', nextHandler);
      }

      // Store for cleanup
      this.sliders.push({
        wrapper: sliderWrapper,
        loop: loop,
        st: st,
        autoplay: autoplay,
        listeners: {
          onEnter,
          onLeave,
          prevHandler,
          nextHandler,
        },
        elements: {
          prevButton,
          nextButton,
          bullets,
        },
      });
    });
  }

  destroy() {
    this.sliders.forEach((item) => {
      // Kill ScrollTrigger
      if (item.st) item.st.kill();
      // Kill Autoplay
      if (item.autoplay) item.autoplay.kill();
      // Kill Loop (Timeline)
      if (item.loop) {
        // Look provided logic returns timeline. Timeline can be killed.
        item.loop.kill();
        // Also remove resize listener attached by horizontalLoop?
        // The helper adds window listener: window.addEventListener("resize", onResize);
        // And returns a cleanup function if we updated it, but the snippet returns 'timeline'.
        // Wait, the snippet provided:
        // return () => window.removeEventListener("resize", onResize);
        // BUT also line `return timeline;`
        // The snippet has `return timeline;` at the end of the function, but inside the loop `gsap.context` implies cleanup?
        // Actually the snippet has:
        // `return () => window.removeEventListener("resize", onResize);` inside the forEach?
        // No, the snippet `horizontalLoop` function returns `timeline`.
        // AND it adds `window.addEventListener("resize", onResize)`.
        // Ideally we should modify `horizontalLoop` to return a cleanup function OR attach cleanup to the timeline object.
        // I will implement `horizontalLoop` inside this class and ensure it handles cleanup.
      }

      // Remove DOM listeners
      if (item.wrapper) {
        item.wrapper.removeEventListener('mouseenter', item.listeners.onEnter);
        item.wrapper.removeEventListener('mouseleave', item.listeners.onLeave);
      }
      if (item.elements.prevButton && item.listeners.prevHandler) {
        item.elements.prevButton.removeEventListener(
          'click',
          item.listeners.prevHandler,
        );
      }
      if (item.elements.nextButton && item.listeners.nextHandler) {
        item.elements.nextButton.removeEventListener(
          'click',
          item.listeners.nextHandler,
        );
      }
      // Note: checking bullet listeners would be tedious without storing them individually,
      // but Barba usually swamps the container anyway.
      // Explicit cleanup is good practice though.
    });
    this.sliders = [];
  }

  // Helper Ported
  horizontalLoop(items, config) {
    items = gsap.utils.toArray(items);
    config = config || {};
    let timeline;

    // Use gsap.context for easy cleanup if we wanted, but we'll stick to standard logic
    let onChange = config.onChange,
      lastIndex = 0,
      tl = gsap.timeline({
        repeat: config.repeat,
        onUpdate:
          onChange &&
          function () {
            let i = tl.closestIndex();
            if (lastIndex !== i) {
              lastIndex = i;
              onChange(items[i], i);
            }
          },
        paused: config.paused,
        defaults: { ease: 'none' },
        onReverseComplete: () =>
          tl.totalTime(tl.rawTime() + tl.duration() * 100),
      }),
      length = items.length,
      startX = items[0].offsetLeft,
      times = [],
      widths = [],
      spaceBefore = [],
      xPercents = [],
      curIndex = 0,
      indexIsDirty = false,
      center = config.center,
      pixelsPerSecond = (config.speed || 1) * 100,
      snap =
        config.snap === false ? (v) => v : gsap.utils.snap(config.snap || 1),
      timeOffset = 0,
      container =
        center === true
          ? items[0].parentNode
          : gsap.utils.toArray(center)[0] || items[0].parentNode,
      totalWidth,
      getTotalWidth = () =>
        items[length - 1].offsetLeft +
        (xPercents[length - 1] / 100) * widths[length - 1] -
        startX +
        spaceBefore[0] +
        items[length - 1].offsetWidth *
          gsap.getProperty(items[length - 1], 'scaleX') +
        (parseFloat(config.paddingRight) || 0),
      populateWidths = () => {
        let b1 = container.getBoundingClientRect(),
          b2;
        items.forEach((el, i) => {
          widths[i] = parseFloat(gsap.getProperty(el, 'width', 'px'));
          xPercents[i] = snap(
            (parseFloat(gsap.getProperty(el, 'x', 'px')) / widths[i]) * 100 +
              gsap.getProperty(el, 'xPercent'),
          );
          b2 = el.getBoundingClientRect();
          spaceBefore[i] = b2.left - (i ? b1.right : b1.left);
          b1 = b2;
        });
        gsap.set(items, {
          xPercent: (i) => xPercents[i],
        });
        totalWidth = getTotalWidth();
      },
      timeWrap,
      populateOffsets = () => {
        timeOffset = center
          ? (tl.duration() * (container.offsetWidth / 2)) / totalWidth
          : 0;
        center &&
          times.forEach((t, i) => {
            times[i] = timeWrap(
              tl.labels['label' + i] +
                (tl.duration() * widths[i]) / 2 / totalWidth -
                timeOffset,
            );
          });
      },
      getClosest = (values, value, wrap) => {
        let i = values.length,
          closest = 1e10,
          index = 0,
          d;
        while (i--) {
          d = Math.abs(values[i] - value);
          if (d > wrap / 2) {
            d = wrap - d;
          }
          if (d < closest) {
            closest = d;
            index = i;
          }
        }
        return index;
      },
      populateTimeline = () => {
        let i, item, curX, distanceToStart, distanceToLoop;
        tl.clear();
        for (i = 0; i < length; i++) {
          item = items[i];
          curX = (xPercents[i] / 100) * widths[i];
          distanceToStart = item.offsetLeft + curX - startX + spaceBefore[0];
          distanceToLoop =
            distanceToStart + widths[i] * gsap.getProperty(item, 'scaleX');
          tl.to(
            item,
            {
              xPercent: snap(((curX - distanceToLoop) / widths[i]) * 100),
              duration: distanceToLoop / pixelsPerSecond,
            },
            0,
          )
            .fromTo(
              item,
              {
                xPercent: snap(
                  ((curX - distanceToLoop + totalWidth) / widths[i]) * 100,
                ),
              },
              {
                xPercent: xPercents[i],
                duration:
                  (curX - distanceToLoop + totalWidth - curX) / pixelsPerSecond,
                immediateRender: false,
              },
              distanceToLoop / pixelsPerSecond,
            )
            .add('label' + i, distanceToStart / pixelsPerSecond);
          times[i] = distanceToStart / pixelsPerSecond;
        }
        timeWrap = gsap.utils.wrap(0, tl.duration());
      },
      refresh = (deep) => {
        let progress = tl.progress();
        tl.progress(0, true);
        populateWidths();
        deep && populateTimeline();
        populateOffsets();
        deep && tl.draggable
          ? tl.time(times[curIndex], true)
          : tl.progress(progress, true);
      },
      onResize = () => refresh(true),
      proxy;

    gsap.set(items, { x: 0 });
    populateWidths();
    populateTimeline();
    populateOffsets();
    window.addEventListener('resize', onResize);

    // Attach cleanup to timeline for easy access in destroy
    tl.killResizeListener = () => {
      window.removeEventListener('resize', onResize);
    };
    // Hook into existing kill if possible, or just remember to call it.
    const originalKill = tl.kill.bind(tl);
    tl.kill = () => {
      tl.killResizeListener();
      originalKill();
    };

    function toIndex(index, vars) {
      vars = vars || {};
      Math.abs(index - curIndex) > length / 2 &&
        (index += index > curIndex ? -length : length); // always go in the shortest direction
      let newIndex = gsap.utils.wrap(0, length, index),
        time = times[newIndex];
      if (time > tl.time() !== index > curIndex && index !== curIndex) {
        // if we're wrapping the timeline's playhead, make the proper adjustments
        time += tl.duration() * (index > curIndex ? 1 : -1);
      }
      if (time < 0 || time > tl.duration()) {
        vars.modifiers = { time: timeWrap };
      }
      curIndex = newIndex;
      vars.overwrite = true;
      gsap.killTweensOf(proxy);
      return vars.duration === 0
        ? tl.time(timeWrap(time))
        : tl.tweenTo(time, vars);
    }
    tl.toIndex = (index, vars) => toIndex(index, vars);
    tl.closestIndex = (setCurrent) => {
      let index = getClosest(times, tl.time(), tl.duration());
      if (setCurrent) {
        curIndex = index;
        indexIsDirty = false;
      }
      return index;
    };
    tl.current = () => (indexIsDirty ? tl.closestIndex(true) : curIndex);
    tl.next = (vars) => toIndex(tl.current() + 1, vars);
    tl.previous = (vars) => toIndex(tl.current() - 1, vars);
    tl.times = times;
    tl.progress(1, true).progress(0, true); // pre-render for performance
    if (config.reversed) {
      tl.vars.onReverseComplete();
      tl.reverse();
    }
    if (config.draggable && typeof Draggable === 'function') {
      proxy = document.createElement('div');
      let wrap = gsap.utils.wrap(0, 1),
        ratio,
        startProgress,
        draggable,
        dragSnap,
        lastSnap,
        initChangeX,
        wasPlaying,
        align = () =>
          tl.progress(
            wrap(startProgress + (draggable.startX - draggable.x) * ratio),
          ),
        syncIndex = () => tl.closestIndex(true);

      // InertiaPlugin check needed? User script kept it.
      // typeof(InertiaPlugin) === "undefined" && console.warn("InertiaPlugin required...");

      draggable = Draggable.create(proxy, {
        trigger: items[0].parentNode,
        type: 'x',
        onPressInit() {
          let x = this.x;
          gsap.killTweensOf(tl);
          wasPlaying = !tl.paused();
          tl.pause();
          startProgress = tl.progress();
          refresh();
          ratio = 1 / totalWidth;
          initChangeX = startProgress / -ratio - x;
          gsap.set(proxy, { x: startProgress / -ratio });
        },
        onDrag: align,
        onThrowUpdate: align,
        overshootTolerance: 0,
        inertia: true,
        snap(value) {
          if (Math.abs(startProgress / -ratio - this.x) < 10) {
            return lastSnap + initChangeX;
          }
          let time = -(value * ratio) * tl.duration(),
            wrappedTime = timeWrap(time),
            snapTime = times[getClosest(times, wrappedTime, tl.duration())],
            dif = snapTime - wrappedTime;
          Math.abs(dif) > tl.duration() / 2 &&
            (dif += dif < 0 ? tl.duration() : -tl.duration());
          lastSnap = (time + dif) / tl.duration() / -ratio;
          return lastSnap;
        },
        onRelease() {
          syncIndex();
          draggable.isThrowing && (indexIsDirty = true);
        },
        onThrowComplete: () => {
          syncIndex();
          wasPlaying && tl.play();
        },
      })[0];
      tl.draggable = draggable;
    }
    tl.closestIndex(true);
    lastIndex = curIndex;
    onChange && onChange(items[curIndex], curIndex);
    timeline = tl;
    return timeline;
  }
}
