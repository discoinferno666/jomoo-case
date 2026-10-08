(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const small = window.matchMedia('(max-width: 767px)');
  const videos = [...document.querySelectorAll('.media-box video,.process-video')];
  const ambient = videos.filter(v => v.classList.contains('ambient'));
  const errorMessage = document.querySelector('.media-error');
  const visible = new Set();
  const manuallyPaused = new WeakSet();
  let playingFinal = null;

  const loadVideo = video => {
    if (video.dataset.src && !video.getAttribute('src')) {
      video.src = video.dataset.src;
      video.load();
    }
  };
  const play = async (video, userAction = false) => {
    if (userAction) manuallyPaused.delete(video);
    loadVideo(video);
    try { await video.play(); }
    catch (error) {
      if (userAction && error.name !== 'AbortError') {
        errorMessage.textContent = 'Видео не удалось запустить. Попробуйте ещё раз или откройте ролик по ссылке.';
      }
    }
  };

  const heroVideo = document.querySelector('.hero-background-video');
  const heroToggle = document.querySelector('.hero-motion-toggle');
  let heroVisible = false, heroPausedByUser = false;
  const syncHeroBackground = () => {
    const motionAllowed = !small.matches && !reduced.matches;
    heroToggle.hidden = !motionAllowed;
    if (heroVisible && motionAllowed && !heroPausedByUser && !document.hidden && videos.every(video => video.paused)) {
      loadVideo(heroVideo);
      heroVideo.play().catch(() => { /* The poster remains visible if autoplay is unavailable. */ });
    } else heroVideo.pause();
  };
  heroToggle.addEventListener('click', () => {
    heroPausedByUser = !heroPausedByUser;
    heroToggle.setAttribute('aria-pressed', String(heroPausedByUser));
    heroToggle.textContent = heroPausedByUser ? 'Включить фон' : 'Пауза фона';
    heroToggle.setAttribute('aria-label', heroPausedByUser ? 'Включить анимацию фона' : 'Приостановить анимацию фона');
    syncHeroBackground();
  });
  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    syncHeroBackground();
  }, {threshold: .05}).observe(document.querySelector('.hero'));
  small.addEventListener('change', syncHeroBackground);
  reduced.addEventListener('change', syncHeroBackground);

  videos.forEach(video => {
    const box = video.closest('.media-box,.render-layer');
    const button = box.querySelector('.media-play');
    const isFinal = video.classList.contains('final-video');
    const showFinalControls = show => {
      if (!isFinal) return;
      video.controls = show;
      if (show) video.removeAttribute('tabindex');
      else video.tabIndex = -1;
    };
    // Keep the poster clean; native controls become available after playback starts.
    // The HTML controls attribute still provides playback when JavaScript is off.
    showFinalControls(false);
    if (button) {
      button.hidden = false;
      button.addEventListener('click', () => play(video, true));
    }
    video.addEventListener('play', () => {
      showFinalControls(true);
      if (isFinal && document.activeElement === button) video.focus({preventScroll:true});
      heroVideo.pause();
      videos.forEach(other => { if (other !== video) other.pause(); });
      if (video.classList.contains('final-video')) playingFinal = video;
      box.classList.add('started');
      errorMessage.textContent = '';
    });
    video.addEventListener('pause', () => {
      if (playingFinal === video) playingFinal = null;
      syncHeroBackground();
    });
    video.addEventListener('ended', () => {
      showFinalControls(false);
      box.classList.remove('started');
      if (playingFinal === video) playingFinal = null;
    });
    video.addEventListener('error', () => {
      showFinalControls(false);
      box.classList.remove('started');
      errorMessage.textContent = 'Видео недоступно. Откройте исходный ролик по ссылке или повторите попытку.';
    });
    video.addEventListener('pointerdown', () => {
      if (!video.paused) manuallyPaused.add(video);
      else manuallyPaused.delete(video);
    });
  });

  const mediaObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting) {
        visible.add(video);
        if (ambient.includes(video) && !small.matches && !reduced.matches && !playingFinal && !document.hidden && !manuallyPaused.has(video)) play(video);
      } else {
        visible.delete(video);
        video.pause();
      }
    }
  }, {threshold: .25});
  videos.forEach(v => mediaObserver.observe(v));
  const stopAutomaticMotion = () => {
    ambient.forEach(v => v.pause());
  };
  small.addEventListener('change', stopAutomaticMotion);
  reduced.addEventListener('change', stopAutomaticMotion);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(v => v.pause());
    syncHeroBackground();
  });

  const features = [...document.querySelectorAll('.feature')];
  const featureStates = new Map();
  let featureRefreshTimer;
  const refreshFeatures = () => {
    clearTimeout(featureRefreshTimer);
    featureRefreshTimer = setTimeout(() => {
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }, 60);
  };
  const settleFeature = (feature, state) => {
    state.heightAnimation?.cancel();
    state.contentAnimation?.cancel();
    state.heightAnimation = state.contentAnimation = null;
    feature.open = state.expanded;
    feature.classList.remove('is-animating');
    refreshFeatures();
  };
  const animateFeature = (feature, expanded) => {
    const state = featureStates.get(feature);
    const summary = feature.querySelector('summary');
    const content = feature.querySelector('.feature-content');
    // Read the current animated frame before cancelling, so rapid clicks reverse
    // from the visible height and opacity instead of jumping to an endpoint.
    const startHeight = feature.getBoundingClientRect().height;
    const wasVisible = feature.open;
    const contentStyle = getComputedStyle(content);
    const startOpacity = wasVisible ? contentStyle.opacity : '0';
    const startTransform = wasVisible ? contentStyle.transform : 'translateY(8px)';
    state.heightAnimation?.cancel();
    state.contentAnimation?.cancel();
    state.expanded = expanded;
    feature.dataset.expanded = String(expanded);
    summary.setAttribute('aria-expanded', String(expanded));
    content.inert = !expanded;
    if (reduced.matches) {
      settleFeature(feature, state);
      return;
    }
    // Keep the native details open until the closing animation finishes.
    feature.open = true;
    const style = getComputedStyle(feature);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    state.targetHeight = summary.offsetHeight + (expanded ? content.offsetHeight : 0) + border;
    feature.classList.add('is-animating');
    const options = {duration:expanded ? 460 : 360,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
    const animation = feature.animate([{height:`${startHeight}px`},{height:`${state.targetHeight}px`}], options);
    state.heightAnimation = animation;
    state.contentAnimation = content.animate([
      {opacity:startOpacity,transform:startTransform},
      {opacity:expanded ? 1 : 0,transform:expanded ? 'translateY(0)' : 'translateY(8px)'}
    ], options);
    animation.onfinish = () => {
      if (state.heightAnimation === animation) settleFeature(feature, state);
    };
  };
  features.forEach(feature => {
    if (!feature.animate) {
      feature.addEventListener('toggle', refreshFeatures);
      return;
    }
    // Native grouping would hide the previous panel immediately. JS owns the
    // grouping while enhanced; the original name still works without JS.
    feature.removeAttribute('name');
    const state = {expanded:feature.open,heightAnimation:null,contentAnimation:null};
    featureStates.set(feature, state);
    feature.dataset.expanded = String(state.expanded);
    const summary = feature.querySelector('summary');
    const content = feature.querySelector('.feature-content');
    summary.setAttribute('aria-expanded', String(state.expanded));
    content.inert = !state.expanded;
    summary.addEventListener('click', event => {
      event.preventDefault();
      const expanded = !state.expanded;
      if (expanded) features.forEach(other => {
        if (other !== feature && featureStates.get(other)?.expanded) animateFeature(other, false);
      });
      animateFeature(feature, expanded);
    });
    feature.addEventListener('toggle', () => {
      if (!state.heightAnimation && feature.open !== state.expanded) animateFeature(feature, feature.open);
    });
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (!state.heightAnimation || !state.expanded) return;
      const style = getComputedStyle(feature);
      const height = summary.offsetHeight + content.offsetHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      if (Math.abs(height - state.targetHeight) > 1) animateFeature(feature, true);
    }).observe(content);
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) featureStates.forEach((state, feature) => settleFeature(feature, state));
  });

  const featureList = document.querySelector('.feature-list');
  const featureLayout = document.querySelector('.feature-layout');
  let featureListWidth = 0;
  const reserveFeatureSpace = () => {
    if (small.matches) return;
    const width = featureList.getBoundingClientRect().width;
    featureListWidth = width;
    // Measure hidden copies, leaving real panels and their animations intact.
    // A stable desktop boundary keeps sticky text still even with all panels shut.
    const measure = document.createElement('div');
    measure.setAttribute('aria-hidden', 'true');
    measure.inert = true;
    Object.assign(measure.style, {position:'absolute',visibility:'hidden',pointerEvents:'none',width:`${width}px`});
    featureLayout.append(measure);
    let maxContentHeight = 0, summaryHeight = 0;
    features.forEach(feature => {
      const content = feature.querySelector('.feature-content').cloneNode(true);
      measure.replaceChildren(content);
      maxContentHeight = Math.max(maxContentHeight, content.getBoundingClientRect().height);
      const style = getComputedStyle(feature);
      summaryHeight += feature.querySelector('summary').getBoundingClientRect().height + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    });
    measure.remove();
    featureList.style.setProperty('--feature-list-min-height', `${Math.ceil(summaryHeight + maxContentHeight)}px`);
  };
  reserveFeatureSpace();
  document.fonts.ready.then(reserveFeatureSpace);
  if (window.ResizeObserver) new ResizeObserver(() => {
    if (Math.abs(featureList.getBoundingClientRect().width - featureListWidth) > 1) reserveFeatureSpace();
  }).observe(featureList);
  small.addEventListener('change', reserveFeatureSpace);
  featureList.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', reserveFeatureSpace, {once:true});
  });

  // The base document stays visible if animation libraries cannot load.
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const heroLines = document.querySelectorAll('.hero-title-line>span');
    const heroFlow = document.querySelector('.hero-flow');
    const heroKicker = document.querySelector('.hero-kicker');
    const heroSupporting = document.querySelectorAll('.hero-date,.hero-question,.hero-bottom>p,.hero-motion-toggle');
    const heroLink = document.querySelector('.hero-bottom .round-link');
    // Establish the scene, uncover the headline, then settle the supporting copy.
    // Only text moves: the composition and the video's lower blur stay in place.
    gsap.set(heroFlow,{opacity:0});
    gsap.set(heroKicker,{clipPath:'inset(0 100% 0 0)'});
    gsap.set(heroLines,{yPercent:112});
    gsap.set(heroSupporting,{opacity:0});
    gsap.set(heroLink,{opacity:0,x:12});
    gsap.timeline({
      id:'hero-intro',
      defaults:{ease:'power3.out'},
      onComplete:() => {
        gsap.set(heroKicker,{clearProps:'clipPath'});
        gsap.set([heroFlow,...heroLines,...heroSupporting,heroLink],{clearProps:'transform,opacity'});
      }
    })
      .to(heroFlow,{opacity:1,duration:1.1,ease:'power2.out'},0)
      .to(heroKicker,{clipPath:'inset(0 0% 0 0)',duration:.65,ease:'power2.inOut'},.08)
      .to('.hero-date',{opacity:1,duration:.5},.24)
      .to(heroLines,{yPercent:0,duration:.85,stagger:.16,ease:'power4.out'},.2)
      .to('.hero-question',{opacity:1,duration:.65},.58)
      .to('.hero-bottom>p,.hero-motion-toggle',{opacity:1,duration:.6},.85)
      .to(heroLink,{opacity:1,x:0,duration:.6},.95);
    document.querySelectorAll('.chapter-heading,.section-top,.features-intro,.result-heading,.contact-cta').forEach(element => {
      if (element.closest('.brief')) return;
      const content = [...element.children].filter(child => !child.classList.contains('water-surface-layer'));
      gsap.from(content, {opacity:0,y:20,duration:.6,stagger:.08,ease:'power2.out',scrollTrigger:{trigger:element,start:'top 88%',once:true}});
    });
    const brief = document.querySelector('.brief');
    const titleLines = brief.querySelectorAll('.brief-title-line>span');
    const copy = brief.querySelectorAll('.brief-copy>.body,.brief-copy>.caption');
    const route = brief.querySelector('.route');
    const eyebrow = brief.querySelector('.eyebrow');
    gsap.set(brief,{clipPath:'inset(0 0 98% 0)'});
    gsap.set(eyebrow,{opacity:0,x:-16});
    gsap.set(titleLines,{yPercent:115});
    gsap.set(copy,{opacity:0,y:20});
    gsap.set(route.children[0],{opacity:0,x:-12});
    gsap.set(route.querySelector('.route-line'),{scaleX:0,transformOrigin:'left center'});
    gsap.set(route.children[2],{opacity:0,x:-10});
    // The brief unfolds like a dossier; its route connects the two cities last.
    gsap.timeline({
      defaults:{ease:'power3.out'},
      scrollTrigger:{id:'brief-reveal',trigger:brief,start:'top 82%',once:true},
      onComplete:() => {
        gsap.set(brief,{clearProps:'clipPath'});
        gsap.set([eyebrow,...titleLines,...copy,...route.children],{clearProps:'transform,opacity'});
      }
    })
      .to(brief,{clipPath:'inset(0 0 0% 0)',duration:1.15,ease:'power4.inOut'},0)
      .to(eyebrow,{opacity:1,x:0,duration:.5},.16)
      .to(titleLines,{yPercent:0,duration:.85,stagger:.13},.25)
      .to(copy,{opacity:1,y:0,duration:.75,stagger:.14},.5)
      .to(route.children[0],{opacity:1,x:0,duration:.45},.95)
      .to(route.querySelector('.route-line'),{scaleX:1,duration:.65,ease:'power2.inOut'},1.15)
      .to(route.children[2],{opacity:1,x:0,duration:.45},1.55);
  });
  mm.add({desktop:'(min-width: 768px)',mobile:'(max-width: 767px)',motion:'(prefers-reduced-motion: no-preference)'}, context => {
    if (!context.conditions.motion) return;
    const board = document.querySelector('.photo-grid');
    const photos = [...board.querySelectorAll('.source-photo')];
    if (context.conditions.desktop) {
      // Offset each card to the same origin, then fan it out with the scroll.
      const stacked = {
        x:(_, photo) => board.clientWidth / 2 - photo.offsetLeft - photo.offsetWidth / 2,
        y:index => 70 + index * 14,
        rotation:index => [-12, 0, 12][index],
        scale:.82
      };
      gsap.set(photos, stacked);
      gsap.fromTo(photos, stacked, {
        x:0,y:index => [28, -8, 28][index],rotation:index => [-5, 0, 5][index],scale:1,
        duration:1,stagger:.09,ease:'power2.out',
        scrollTrigger:{trigger:board,start:'top 88%',end:'top 16%',scrub:.7,invalidateOnRefresh:true}
      });
    } else {
      photos.forEach((photo,index) => gsap.fromTo(photo,
        {x:0,y:40,scale:1,rotation:index % 2 ? -3 : 3},
        {x:0,y:0,scale:1,rotation:0,duration:.7,ease:'power2.out',scrollTrigger:{trigger:photo,start:'top 88%',end:'top 56%',scrub:.4,invalidateOnRefresh:true}}
      ));
    }
    return () => { gsap.set(photos, {clearProps:'transform,translate,rotate,scale'}); };
  });
  mm.add({desktop:'(min-width: 768px)',reduce:'(prefers-reduced-motion: reduce)'}, context => {
    if (!context.conditions.desktop || context.conditions.reduce) return;
    const transformation = document.querySelector('.transformation');
    transformation.classList.add('has-transform');
    const processVideo = transformation.querySelector('.process-video');
    const rotation = {progress:0};
    // Both stills share the video's first-frame camera. Keep that frame fixed
    // through the reveal, then seek the rotation with scroll in either direction.
    processVideo.pause();
    processVideo.controls = false;
    processVideo.tabIndex = -1;
    const seekRotation = () => {
      if (processVideo.readyState < 2 || processVideo.seeking) return;
      const target = rotation.progress * Math.max(0, processVideo.duration - 1 / 24);
      if (Math.abs(processVideo.currentTime - target) > .02) processVideo.currentTime = target;
    };
    const loadProcessVideo = () => {
      if (processVideo.preload === 'auto') return;
      processVideo.preload = 'auto';
      processVideo.load();
    };
    processVideo.addEventListener('loadeddata', seekRotation);
    processVideo.addEventListener('seeked', seekRotation);
    const preloadObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        loadProcessVideo();
        preloadObserver.disconnect();
      }
    }, {rootMargin:'600px'});
    preloadObserver.observe(transformation);
    gsap.set('.model-layer,.render-layer', {clipPath:'inset(0 100% 0 0)'});
    gsap.set('.process-track span:nth-child(1)', {color:'#315FDB'});
    const timeline = gsap.timeline({scrollTrigger:{id:'process-transformation',trigger:transformation,start:'top 6%',end:()=>`+=${Math.max(1600,innerHeight * 2.4)}`,pin:true,scrub:.6,invalidateOnRefresh:true}});
    timeline.to('.model-layer',{clipPath:'inset(0 0% 0 0)',duration:1,ease:'none'},.2)
      .to('.process-track span:nth-child(2)',{color:'#315FDB',duration:.2},.65)
      .to('.render-layer',{clipPath:'inset(0 0% 0 0)',duration:1,ease:'none'},1.45)
      .to('.process-track span:nth-child(3)',{color:'#315FDB',duration:.2},1.9)
      .to(rotation,{progress:1,duration:2,ease:'none',onUpdate:seekRotation},2.65);
    return () => {
      preloadObserver.disconnect();
      processVideo.removeEventListener('loadeddata', seekRotation);
      processVideo.removeEventListener('seeked', seekRotation);
      processVideo.pause();
      processVideo.controls = true;
      processVideo.removeAttribute('tabindex');
      if (processVideo.readyState >= 1) processVideo.currentTime = 0;
      transformation.classList.remove('has-transform');
    };
  });
  let refreshTimer;
  const refresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 100); };
  document.fonts.ready.then(refresh);
  document.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', refresh, {once:true}); });
  videos.forEach(video => video.addEventListener('loadedmetadata', refresh));
  window.addEventListener('load', refresh, {once:true});
})();
