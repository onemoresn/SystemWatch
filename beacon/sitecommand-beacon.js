/**
 * SiteCommand Beacon — first-party analytics & vitals collector
 * Source of truth; copy to each site's public root when updating.
 */
(function () {
  'use strict';

  var cfg = window.SiteCommand || {};
  var siteKey = cfg.siteKey || '';
  var endpoint = cfg.endpoint || 'https://api.sitecommand.io/v1/events';
  var enabled = cfg.enabled !== false && siteKey;

  if (!enabled) return;

  var queue = [];
  var batchTimer = null;
  var BATCH_MS = 5000;
  var lastPath = location.pathname + location.search;

  function track(type, data) {
    var event = {
      type: type,
      path: location.pathname + location.search,
      referrer: document.referrer || '',
      ts: Math.floor(Date.now() / 1000),
    };
    if (data) {
      for (var key in data) {
        if (data[key] !== undefined) event[key] = data[key];
      }
    }
    queue.push(event);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (batchTimer) return;
    batchTimer = setTimeout(flush, BATCH_MS);
  }

  function flush() {
    batchTimer = null;
    if (!queue.length) return;

    var batch = queue.slice();
    queue = [];
    var payload = JSON.stringify({ site_key: siteKey, events: batch });

    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'application/json' });
      if (!navigator.sendBeacon(endpoint, blob)) {
        queue = batch.concat(queue);
      }
      return;
    }

    fetch(endpoint, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(function () {
      queue = batch.concat(queue);
    });
  }

  function onNavigation() {
    var path = location.pathname + location.search;
    if (path !== lastPath) {
      lastPath = path;
      track('pageview');
    }
  }

  function patchHistory() {
    var pushState = history.pushState;
    var replaceState = history.replaceState;

    history.pushState = function () {
      pushState.apply(history, arguments);
      onNavigation();
    };
    history.replaceState = function () {
      replaceState.apply(history, arguments);
      onNavigation();
    };
    window.addEventListener('popstate', onNavigation);
  }

  function collectNavigationVitals() {
    var nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return;

    track('vitals', {
      vitals: {
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        dom: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        load: Math.round(nav.loadEventEnd - nav.startTime),
      },
    });
  }

  function loadWebVitals() {
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/web-vitals@4/dist/web-vitals.attribution.iife.js';
    script.async = true;
    script.onload = function () {
      if (!window.webVitals) return;

      var vitals = {};

      function report(name, metric) {
        vitals[name] = Math.round(metric.value * (name === 'cls' ? 1000 : 1)) / (name === 'cls' ? 1000 : 1);
        track('vitals', { vitals: Object.assign({}, vitals) });
      }

      window.webVitals.onLCP(function (m) { report('lcp', m); });
      window.webVitals.onINP(function (m) { report('inp', m); });
      window.webVitals.onCLS(function (m) { report('cls', m); });
      window.webVitals.onTTFB(function (m) { report('ttfb', m); });
    };
    document.head.appendChild(script);
  }

  track('pageview');
  patchHistory();

  if (document.readyState === 'complete') {
    collectNavigationVitals();
  } else {
    window.addEventListener('load', collectNavigationVitals);
  }

  loadWebVitals();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.SiteCommandTrack = track;
})();
