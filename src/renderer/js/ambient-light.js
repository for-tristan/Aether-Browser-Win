// ambient-light.js — Built-in Ambient Light effect for YouTube
// Samples the video frame colors and creates a glowing halo around the video player,
// similar to the "Ambient Light for YouTube" Chrome extension.
window.Aether = window.Aether || {};

Aether.AmbientLight = (() => {
  const YOUTUBE_AMBIENT_CSS = `
    #aether-ambient-glow {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;
      transition: background 0.5s ease;
      background: transparent;
    }
    #aether-ambient-glow.active {
      background: radial-gradient(ellipse at center, var(--ambient-color, transparent) 0%, transparent 60%);
    }
    /* Expand the glow beyond the video */
    ytd-watch-flexy[fullscreen] #aether-ambient-glow { z-index: 0; }
  `;

  const YOUTUBE_AMBIENT_JS = `
    (function() {
      if (window.__aetherAmbient) return;
      window.__aetherAmbient = true;

      var glow = document.createElement('div');
      glow.id = 'aether-ambient-glow';
      document.body.appendChild(glow);

      var canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 18;
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
      var ctx = canvas.getContext('2d', { willReadFrequently: true });

      var video = null;
      var updateTimer = null;

      function findVideo() {
        video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (video) {
          startSampling();
        }
      }

      function startSampling() {
        if (updateTimer) clearInterval(updateTimer);
        updateTimer = setInterval(sampleColor, 500);
        sampleColor();
      }

      function sampleColor() {
        if (!video || video.readyState < 2) return;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          var r = 0, g = 0, b = 0, count = 0;
          // Sample the center region (skip black bars)
          var startX = Math.floor(canvas.width * 0.15);
          var endX = Math.floor(canvas.width * 0.85);
          var startY = Math.floor(canvas.height * 0.15);
          var endY = Math.floor(canvas.height * 0.85);
          for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
              var i = (y * canvas.width + x) * 4;
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
              count++;
            }
          }
          if (count === 0) return;
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);

          // Boost saturation slightly for a more vivid glow
          var max = Math.max(r, g, b);
          var min = Math.min(r, g, b);
          var range = max - min;
          if (range > 10 && max > 20) {
            var boost = 1.3;
            r = Math.min(255, Math.round(r + (r - min) * boost));
            g = Math.min(255, Math.round(g + (g - min) * boost));
            b = Math.min(255, Math.round(b + (b - min) * boost));
          }

          var color = 'rgb(' + r + ',' + g + ',' + b + ')';
          glow.style.setProperty('--ambient-color', color);
          glow.classList.add('active');

          // Also set a large blurred box-shadow on the video's parent for the halo effect
          var player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
          if (player) {
            player.style.boxShadow = '0 0 120px 40px ' + color;
            player.style.transition = 'box-shadow 0.5s ease';
          }
        } catch (e) {
          // Cross-origin or other error — skip
        }
      }

      // Watch for video element (YouTube loads it dynamically)
      var observer = new MutationObserver(function() {
        if (!video || !document.contains(video)) {
          findVideo();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Initial check
      setTimeout(findVideo, 1000);
      setTimeout(findVideo, 3000);

      // Clean up on page unload
      window.addEventListener('unload', function() {
        if (updateTimer) clearInterval(updateTimer);
        if (observer) observer.disconnect();
      });
    })();
  `;

  function inject(webview, url) {
    if (!url || !url.includes('youtube.com/watch')) return;
    webview.addEventListener('dom-ready', () => {
      try {
        webview.insertCSS(YOUTUBE_AMBIENT_CSS);
        webview.executeJavaScript(YOUTUBE_AMBIENT_JS, true);
      } catch (e) {}
    }, { once: true });
  }

  return { inject };
})();
