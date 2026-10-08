(() => {
  'use strict';

  // Same height-field simulation as the user's Webflow reference (jquery.ripples
  // 0.6.3). Only decorative background layers are passed to the plugin.
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
  const surfaces = [...document.querySelectorAll('[data-water-surface]')];
  const protectedMedia = 'img,video,canvas,svg,.media-box,.photo-media,.transform-stage,a,button';
  const lifetime = 3600;
  const tick = 1000 / 60;
  let dispose = null;

  const enable = () => {
    const $ = window.jQuery;
    const texture = document.createElement('canvas');
    texture.width = texture.height = 2;
    const paint = texture.getContext('2d');
    if (!paint) return () => {};
    paint.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--porcelain').trim();
    paint.fillRect(0, 0, 2, 2);
    const imageUrl = texture.toDataURL();
    const active = new Set();
    const states = surfaces.map(surface => {
      const layer = document.createElement('div');
      layer.className = 'water-surface-layer';
      layer.setAttribute('aria-hidden', 'true');
      surface.prepend(layer);
      return {surface, layer, instance:null, visible:false, last:null, disturbed:0, updated:0, width:0, height:0, failed:false};
    });
    let frame = 0;

    const clear = state => {
      active.delete(state);
      state.last = null;
      state.layer.style.opacity = '0';
      if (state.instance) {
        $(state.layer).ripples('destroy');
        state.instance = null;
      }
      if (!active.size && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const resize = state => {
      const width = document.documentElement.clientWidth;
      const height = state.surface.getBoundingClientRect().height;
      if (Math.abs(state.width - width) < 1 && Math.abs(state.height - height) < 1) return;
      clear(state);
      state.width = width;
      state.height = height;
      state.layer.style.setProperty('--water-width', `${width}px`);
    };

    const draw = now => {
      frame = 0;
      active.forEach(state => {
        const age = now - state.disturbed;
        if (age >= lifetime) { clear(state); return; }
        // Preserve the reference's simulation speed on 60/120/144 Hz screens.
        const steps = Math.min(3, Math.floor((now - state.updated) / tick));
        if (!steps) return;
        for (let i = 0; i < steps; i++) state.instance.step();
        state.updated = now - (now - state.updated) % tick;
        state.layer.style.opacity = String(Math.min(1, (lifetime - age) / 800));
      });
      if (active.size) frame = requestAnimationFrame(draw);
    };

    const disturb = (event, click = false) => {
      if (document.hidden || event.pointerType === 'touch') return;
      if (event.target.closest(protectedMedia)) {
        states.forEach(state => { state.last = null; });
        return;
      }
      const now = performance.now();
      states.forEach(state => {
        if (!state.visible || state.failed) return;
        const bounds = state.surface.getBoundingClientRect();
        if (event.clientY < bounds.top || event.clientY > bounds.bottom) {
          state.last = null;
          return;
        }
        const x = event.clientX, y = event.clientY - bounds.top;
        const distance = state.last ? Math.hypot(x - state.last.x, y - state.last.y) : 0;
        if (!click && state.last && (now - state.last.time < 12 || distance < 3)) return;
        if (!state.instance) {
          try {
            $(state.layer).ripples({resolution:512,dropRadius:20,perturbance:.01,interactive:false,externalTicker:true,imageUrl});
            state.instance = $(state.layer).data('ripples');
            state.updated = now;
          } catch {
            // A static gray surface remains usable when WebGL is unavailable.
            state.failed = true;
            state.layer.replaceChildren();
            return;
          }
        }
        // Interpolate quick cursor movement into a continuous wake.
        const samples = click || !state.last ? 1 : Math.min(8, Math.max(1, Math.ceil(distance / 8)));
        for (let i = 1; i <= samples; i++) {
          const progress = i / samples;
          const dx = state.last && !click ? state.last.x + (x - state.last.x) * progress : x;
          const dy = state.last && !click ? state.last.y + (y - state.last.y) * progress : y;
          state.instance.drop(dx, dy, click ? 30 : 20, click ? .08 : .01);
        }
        state.last = {x,y,time:now};
        state.disturbed = now;
        state.layer.style.opacity = '1';
        active.add(state);
      });
      if (active.size && !frame) frame = requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const state = states.find(item => item.surface === entry.target);
        state.visible = entry.isIntersecting;
        if (!state.visible) clear(state);
      });
    });
    const sizes = new ResizeObserver(entries => {
      if (entries.some(entry => entry.target === document.documentElement)) states.forEach(resize);
      else entries.forEach(entry => resize(states.find(state => state.surface === entry.target)));
    });
    states.forEach(state => {
      resize(state);
      observer.observe(state.surface);
      sizes.observe(state.surface);
    });
    sizes.observe(document.documentElement);
    const move = event => disturb(event);
    const down = event => { if (event.button === 0) disturb(event, true); };
    const stop = () => states.forEach(clear);
    document.addEventListener('pointermove', move, {passive:true});
    document.addEventListener('pointerdown', down, {passive:true});
    document.documentElement.addEventListener('pointerleave', stop);
    document.addEventListener('visibilitychange', stop);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      observer.disconnect();
      sizes.disconnect();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', down);
      document.documentElement.removeEventListener('pointerleave', stop);
      document.removeEventListener('visibilitychange', stop);
      window.removeEventListener('blur', stop);
      states.forEach(state => state.layer.remove());
    };
  };

  const sync = () => {
    dispose?.();
    dispose = null;
    if (motion.matches && surfaces.length && window.jQuery?.fn.ripples && window.ResizeObserver && window.IntersectionObserver) dispose = enable();
  };
  motion.addEventListener('change', sync);
  window.addEventListener('pagehide', () => { dispose?.(); dispose = null; });
  window.addEventListener('pageshow', event => { if (event.persisted) sync(); });
  sync();
})();
