// weather.js — Geolocation weather
window.Aether = window.Aether || {};

Aether.Weather = (() => {
  const weatherCodes = {
    0: { desc: 'Clear sky', icon: 'sun' }, 1: { desc: 'Mainly clear', icon: 'sun' },
    2: { desc: 'Partly cloudy', icon: 'cloud-sun' }, 3: { desc: 'Overcast', icon: 'cloud' },
    45: { desc: 'Fog', icon: 'fog' }, 48: { desc: 'Rime fog', icon: 'fog' },
    51: { desc: 'Light drizzle', icon: 'drizzle' }, 53: { desc: 'Drizzle', icon: 'drizzle' }, 55: { desc: 'Dense drizzle', icon: 'drizzle' },
    61: { desc: 'Light rain', icon: 'rain' }, 63: { desc: 'Rain', icon: 'rain' }, 65: { desc: 'Heavy rain', icon: 'rain' },
    71: { desc: 'Light snow', icon: 'snow' }, 73: { desc: 'Snow', icon: 'snow' }, 75: { desc: 'Heavy snow', icon: 'snow' },
    80: { desc: 'Showers', icon: 'rain' }, 81: { desc: 'Showers', icon: 'rain' }, 82: { desc: 'Violent showers', icon: 'rain' },
    95: { desc: 'Thunderstorm', icon: 'storm' }, 96: { desc: 'Thunderstorm + hail', icon: 'storm' }, 99: { desc: 'Thunderstorm + hail', icon: 'storm' },
  };

  const weatherIcons = {
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    'cloud-sun': '<svg viewBox="0 0 24 24"><path d="M12 2v2M5.64 5.64l1.41 1.41M2 12h2M19 12h2M17.36 5.64l-1.41 1.41"/><path d="M8 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A4 4 0 0 1 17 18z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 14"/></svg>',
    fog: '<svg viewBox="0 0 24 24"><path d="M4 10h16M4 14h16M4 18h12"/></svg>',
    drizzle: '<svg viewBox="0 0 24 24"><path d="M17.5 15a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 10"/><path d="M9 18v2M13 18v2M17 18v2"/></svg>',
    rain: '<svg viewBox="0 0 24 24"><path d="M17.5 15a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 10"/><path d="M8 18v3M12 18v3M16 18v3"/></svg>',
    snow: '<svg viewBox="0 0 24 24"><path d="M17.5 15a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 10"/><path d="M8 19v.01M12 19v.01M16 19v.01M10 21v.01M14 21v.01"/></svg>',
    storm: '<svg viewBox="0 0 24 24"><path d="M17.5 15a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 10"/><path d="m13 13-3 5h4l-3 5"/></svg>',
  };

  async function load() {
    const tempEl = document.getElementById('weatherTemp');
    const cityEl = document.getElementById('weatherCity');
    const iconEl = document.getElementById('weatherIcon');
    if (!tempEl) return;
    tempEl.textContent = '…'; cityEl.textContent = 'Locating…';

    const getWeather = async (lat, lon, cityName) => {
      try {
        const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
        const wx = await wxRes.json();
        const temp = Math.round(wx.current.temperature_2m);
        const code = wx.current.weather_code;
        const w = weatherCodes[code] || { desc: 'Unknown', icon: 'cloud' };
        tempEl.textContent = `${temp}°C`;
        cityEl.textContent = cityName || 'Your location';
        iconEl.innerHTML = weatherIcons[w.icon] || weatherIcons.cloud;
        iconEl.title = w.desc;
      } catch { tempEl.textContent = '--°C'; cityEl.textContent = 'Weather unavailable'; }
    };

    const reverseGeocode = async (lat, lon) => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`);
        const j = await r.json();
        if (j.results && j.results[0]) {
          const loc = j.results[0];
          return loc.name || loc.admin1 || loc.country || 'Your location';
        }
      } catch {}
      return 'Your location';
    };

    if (!navigator.geolocation) {
      tempEl.textContent = '--°C'; cityEl.textContent = 'Location unsupported'; return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude, longitude } = pos.coords;
      const cityName = await reverseGeocode(latitude, longitude);
      await getWeather(latitude, longitude, cityName);
    }, async () => {
      try {
        const ipRes = await fetch('https://ipapi.co/json/');
        const ipData = await ipRes.json();
        if (ipData.latitude && ipData.longitude) {
          await getWeather(ipData.latitude, ipData.longitude, ipData.city || 'Your location');
        } else { tempEl.textContent = '--°C'; cityEl.textContent = 'Location denied'; }
      } catch { tempEl.textContent = '--°C'; cityEl.textContent = 'Location denied'; }
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }

  return { load };
})();
