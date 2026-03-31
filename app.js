/**
 * TravelCar v3.0 — Голосовой ввод + P2P Синхронизация (без регистрации)
 * @author Роман Коваль
 * @version 3.0.0
 */

// ===== STATE =====
const state = {
  deviceId: generateDeviceId(),
  trips: [],
  activeTrip: null,
  settings: {
    theme: localStorage.getItem('tc_theme') || 'light',
    currency: localStorage.getItem('tc_currency') || 'RUB',
    language: 'ru'
  },
  filters: {
    search: '',
    category: '',
    sortBy: 'date-desc'
  },
  voice: {
    autoStart: true,
    language: 'ru-RU'
  },
  location: {
    last: null,
    settlement: null,
    cache: new Map()
  },
  sync: {
    peer: null,
    conn: null,
    roomId: null,
    isHost: false
  }
};

// ===== CONSTANTS =====
const CATEGORIES = {
  fuel: { icon: '⛽', label: 'Топливо', keywords: ['бензин', 'топливо', 'заправка', 'газ', 'дизель', 'азс', 'розлив'] },
  food: { icon: '🍽️', label: 'Еда', keywords: ['еда', 'обед', 'ужин', 'завтрак', 'кафе', 'ресторан', 'перекус', 'продукты', 'магазин'] },
  accommodation: { icon: '🏨', label: 'Жильё', keywords: ['отель', 'гостиница', 'хостел', 'ночёвка', 'жильё', 'квартира', 'апартаменты'] },
  tolls: { icon: '🛣️', label: 'Платные дороги', keywords: ['дорога', 'платная', 'шлагбаум', 'трасса', 'мост', 'тоннель'] },
  repairs: { icon: '🔧', label: 'Ремонт', keywords: ['ремонт', 'шиномонтаж', 'запчасть', 'масло', 'автосервис', 'мойка'] },
  entertainment: { icon: '🎭', label: 'Развлечения', keywords: ['билет', 'музей', 'парк', 'экскурсия', 'развлечение', 'сувенир'] },
  other: { icon: '📦', label: 'Другое', keywords: ['прочее', 'другое', 'разное'] }
};

// ===== MAP =====let map = null;
let userMarker = null;

// ===== CHARTS =====
let categoryChart = null;
let dailyChart = null;

// ===== VOICE =====
let recognition = null;
let isListening = false;

// ===== GEO CACHE =====
const geoCache = new Map();

// ===== HELPER: Generate Device ID =====
function generateDeviceId() {
  let id = localStorage.getItem('tc_device_id');
  if (!id) {
    id = 'device_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('tc_device_id', id);
  }
  return id;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  applyTheme();
  initEventListeners();
  initVoice();
  initVoiceTrigger();
  initP2PSync();
  updateOnlineStatus();
  renderAll();
  
  const now = new Date();
  document.getElementById('expDate').value = now.toISOString().split('T')[0];
  document.getElementById('expTime').value = now.toTimeString().slice(0, 5);
});

// ===== STORAGE =====
async function loadState() {
  try {
    const saved = localStorage.getItem('travelcar_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.trips = parsed.trips || [];
      state.activeTrip = parsed.activeTrip || null;
      state.settings = { ...state.settings, ...parsed.settings };
      if (parsed.location?.cache) {        state.location.cache = new Map(Object.entries(parsed.location.cache));
      }
    }
    const theme = localStorage.getItem('tc_theme');
    const currency = localStorage.getItem('tc_currency');
    if (theme) state.settings.theme = theme;
    if (currency) state.settings.currency = currency;
  } catch (e) {
    console.error('Failed to load state:', e);
    showToast('Ошибка загрузки данных', 'error');
  }
}

function saveState() {
  try {
    const toSave = {
      trips: state.trips,
      activeTrip: state.activeTrip,
      settings: state.settings
    };
    localStorage.setItem('travelcar_data', JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save state:', e);
    showToast('Ошибка сохранения', 'error');
  }
}

// ===== THEME =====
function applyTheme() {
  document.body.classList.toggle('dark', state.settings.theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.settings.theme === 'dark' ? '#1a1a2e' : '#4a90e2');
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tc_theme', state.settings.theme);
  applyTheme();
  showToast(`Тема: ${state.settings.theme === 'dark' ? '🌙 Тёмная' : '☀️ Светлая'}`, 'info');
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('syncBtn').addEventListener('click', toggleP2PSync);
  
  document.getElementById('tripSelect').addEventListener('change', handleTripSelect);
  document.getElementById('newTripBtn').addEventListener('click', createNewTrip);
    document.getElementById('addExpenseForm').addEventListener('submit', handleAddExpense);
  document.getElementById('geoBtn').addEventListener('click', getCurrentLocation);
  document.getElementById('expPhoto').addEventListener('change', handlePhotoSelect);
  document.getElementById('voiceBtn').addEventListener('click', toggleVoiceInput);
  
  document.getElementById('searchExpenses').addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    renderExpenses();
  });
  document.getElementById('filterCategory').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderExpenses();
  });
  document.getElementById('sortBy').addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    renderExpenses();
  });
  
  document.getElementById('exportQR').addEventListener('click', exportQR);
  document.getElementById('exportJSON').addEventListener('click', () => exportData('json'));
  document.getElementById('importJSON').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importData);
  document.getElementById('exportPDF').addEventListener('click', () => exportData('pdf'));
  
  document.getElementById('createRoom').addEventListener('click', createRoom);
  document.getElementById('joinRoom').addEventListener('click', joinRoom);
  document.getElementById('leaveRoom').addEventListener('click', leaveRoom);
  
  document.getElementById('locateBtn').addEventListener('click', centerMapOnUser);
  document.getElementById('addExpenseFab').addEventListener('click', () => {
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
  });
  
  let pressTimer;
  const fab = document.getElementById('addExpenseFab');
  fab.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => { e.preventDefault(); quickAddExpense(); }, 500);
  });
  fab.addEventListener('touchend', () => clearTimeout(pressTimer));
  fab.addEventListener('touchcancel', () => clearTimeout(pressTimer));
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

// ===== VOICE TRIGGER =====
function initVoiceTrigger() {
  const trigger = document.getElementById('voiceTrigger');
  trigger.addEventListener('click', quickAddExpense);
  trigger.addEventListener('touchstart', (e) => { e.preventDefault(); quickAddExpense(); });}

// ===== VOICE-FIRST FLOW =====
async function quickAddExpense() {
  const trigger = document.getElementById('voiceTrigger');
  trigger.classList.add('listening');
  showToast('🎤 Слушаю...', 'info');
  
  try {
    const [locationData, voiceResult] = await Promise.all([
      getCurrentLocationSilent(5000),
      listenForExpense()
    ]);
    
    if (voiceResult?.amount && voiceResult?.category) {
      if (!state.activeTrip) await createDefaultTrip();
      
      const expense = {
        title: voiceResult.title || CATEGORIES[voiceResult.category].label,
        amount: voiceResult.amount,
        category: voiceResult.category,
        date: new Date().toISOString(),
        location: locationData?.settlement || locationData?.coords || 'Место не определено',
        coords: locationData?.coords,
        notes: voiceResult.notes,
        auto: true,
        source: 'voice'
      };
      
      await saveExpenseAuto(expense);
      showToast(`✅ ${expense.title}: ${expense.amount} ${state.settings.currency}`, 'success');
      if (navigator.vibrate) navigator.vibrate(50);
      
      // Sync to peer if connected
      if (state.sync.conn) {
        state.sync.conn.send({ type: 'expense', data: expense, tripId: state.activeTrip });
      }
    } else {
      showToast('❌ Не распознано. Попробуйте: "бензин 2500 рублей"', 'error');
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    }
  } catch (e) {
    console.error('Voice error:', e);
    showToast('Ошибка голосового ввода', 'error');
  } finally {
    trigger.classList.remove('listening');
  }
}

// ===== VOICE RECOGNITION =====function listenForExpense() {
  return new Promise((resolve) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      resolve(null);
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = state.voice.language;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    
    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim().toLowerCase();
      console.log('🗣️ Распознано:', transcript);
      const parsed = parseVoiceCommand(transcript);
      resolve(parsed);
    };
    rec.onerror = () => resolve(null);
    rec.onend = () => {};
    rec.start();
    setTimeout(() => rec.stop(), 8000);
  });
}

// ===== PARSE RUSSIAN VOICE =====
function parseVoiceCommand(text) {
  const result = { amount: null, category: null, title: null, notes: '' };
  
  const amountMatch = text.match(/(\d+[\s.,]?\d*)\s*(рублей|руб|р|₽)?/);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/[\s,]/g, ''));
  }
  
  for (const [cat, data] of Object.entries(CATEGORIES)) {
    if (data.keywords.some(k => text.includes(k))) {
      result.category = cat;
      result.title = data.label;
      break;
    }
  }
  
  if (!result.category) {
    if (text.includes('купил') || text.includes('покупка')) {
      result.category = 'other';
      result.title = 'Расход';
    } else if (result.amount && result.amount > 100) {
      result.category = 'other';
      result.title = 'Расход';    }
  }
  
  const words = text.split(' ').filter(w => 
    !/\d/.test(w) && 
    !['рублей','руб','р','₽','купил','за','в','на','и'].includes(w) &&
    !Object.values(CATEGORIES).flatMap(c => c.keywords).includes(w)
  );
  result.notes = words.join(' ');
  if (result.notes && !result.title) result.title = result.notes.slice(0, 30);
  
  if (!result.amount || !result.category) return null;
  return result;
}

// ===== VOICE INPUT (Form) =====
function initVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    document.getElementById('voiceBtn').style.display = 'none';
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = state.voice.language;
  recognition.continuous = false;
  recognition.interimResults = false;
  
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('expTitle').value = transcript;
    const parsed = parseVoiceCommand(transcript);
    if (parsed) {
      document.getElementById('expAmount').value = parsed.amount;
      document.getElementById('expCategory').value = parsed.category;
    }
    showToast('🎤 Распознано: ' + transcript, 'info');
    stopListening();
  };
  
  recognition.onerror = () => {
    showToast('Ошибка распознавания', 'error');
    stopListening();
  };
  
  recognition.onend = stopListening;
}

function toggleVoiceInput() {
  if (!recognition) return;  if (isListening) { recognition.stop(); } 
  else {
    recognition.start();
    isListening = true;
    document.getElementById('voiceBtn').classList.add('recording');
    document.getElementById('voiceStatus').textContent = '🎙️ Слушаю...';
  }
}

function stopListening() {
  isListening = false;
  document.getElementById('voiceBtn').classList.remove('recording');
  document.getElementById('voiceStatus').textContent = '';
}

// ===== GEOLOCATION =====
async function getCurrentLocationSilent(timeout = 5000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    
    const timer = setTimeout(() => resolve(null), timeout);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearTimeout(timer);
        const { latitude, longitude } = pos.coords;
        const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        const settlement = await getSettlementName(latitude, longitude);
        state.location.last = { coords, settlement, timestamp: Date.now() };
        resolve({ coords, settlement });
      },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout, maximumAge: 300000 }
    );
  });
}

async function getSettlementName(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  if (state.location.cache.has(key)) {
    const cached = state.location.cache.get(key);
    if (Date.now() - cached.timestamp < 86400000) return cached.name;
  }
  
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=ru`,
      { headers: { 'User-Agent': 'TravelCar/3.0' } }
    );
    const data = await res.json();    const addr = data.address;
    const name = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || null;
    
    geoCache.set(key, name);
    state.location.cache.set(key, { name, timestamp: Date.now() });
    if (state.location.cache.size > 100) {
      const firstKey = state.location.cache.keys().next().value;
      state.location.cache.delete(firstKey);
    }
    return name;
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
    return null;
  }
}

async function getCurrentLocation() {
  if (!navigator.geolocation) {
    showToast('Геолокация не поддерживается', 'error');
    return;
  }
  
  showToast('📍 Определение местоположения...', 'info');
  
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 300000
      });
    });
    
    const { latitude, longitude } = position.coords;
    const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    document.getElementById('expLocation').value = coords;
    
    const address = await getSettlementName(latitude, longitude);
    if (address) {
      document.getElementById('expLocation').value = `${address} (${coords})`;
    }
    
    if (map) {
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup('📍 Вы здесь').openPopup();
      map.setView([latitude, longitude], 15);
    }
    
    showToast('✅ Местоположение определено', 'success');
  } catch (err) {
    console.error('Geolocation error:', err);
    showToast('❌ Не удалось определить местоположение', 'error');  }
}

async function detectCountry() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    return data.country_name || 'Россия';
  } catch { return 'Россия'; }
}

// ===== TRIPS =====
async function createNewTrip() {
  const name = prompt('Название поездки:', 'Поездка ' + new Date().toLocaleDateString());
  if (!name) return;
  
  const country = await detectCountry();
  const trip = {
    id: Date.now().toString(),
    name,
    country: country || 'Россия',
    startDate: new Date().toISOString(),
    endDate: '',
    currency: state.settings.currency,
    budget: 0,
    expenses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.trips.push(trip);
  state.activeTrip = trip.id;
  saveState();
  renderAll();
  showToast('🚗 Поездка создана!', 'success');
  
  if (state.sync.conn) {
    state.sync.conn.send({ type: 'trip', data: trip });
  }
}

async function createDefaultTrip() {
  const country = await detectCountry();
  const trip = {
    id: Date.now().toString(),
    name: 'Поездка ' + new Date().toLocaleDateString('ru'),
    country: country || 'Россия',
    startDate: new Date().toISOString(),
    currency: state.settings.currency,
    budget: 0,    expenses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.trips.push(trip);
  state.activeTrip = trip.id;
  saveState();
  renderAll();
}

async function handleTripSelect(e) {
  const tripId = e.target.value;
  if (tripId === '') { await createNewTrip(); } 
  else { state.activeTrip = tripId; renderAll(); }
}

// ===== EXPENSES =====
async function handleAddExpense(e) {
  e.preventDefault();
  if (!state.activeTrip) {
    showToast('Сначала создайте поездку', 'error');
    return;
  }
  
  const form = e.target;
  const photoFile = document.getElementById('expPhoto').files[0];
  
  let photoData = null;
  if (photoFile) {
    try { photoData = await compressImage(photoFile); } 
    catch (err) { showToast('Ошибка обработки фото', 'error'); return; }
  }
  
  const expense = {
    id: Date.now().toString(),
    title: document.getElementById('expTitle').value,
    amount: parseFloat(document.getElementById('expAmount').value),
    category: document.getElementById('expCategory').value,
    date: document.getElementById('expDate').value + 'T' + document.getElementById('expTime').value,
    location: document.getElementById('expLocation').value,
    photo: photoData,
    createdAt: new Date().toISOString(),
    source: 'manual'
  };
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (trip) {
    trip.expenses.push(expense);
    trip.updatedAt = new Date().toISOString();    saveState();
    renderAll();
    
    if (state.sync.conn) {
      state.sync.conn.send({ type: 'expense', data: expense, tripId: state.activeTrip });
    }
    
    form.reset();
    document.getElementById('photoPreview').innerHTML = '';
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expTime').value = new Date().toTimeString().slice(0, 5);
    showToast('✅ Расход добавлен', 'success');
  }
}

async function saveExpenseAuto(expense) {
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip) return;
  
  const newExpense = {
    id: Date.now().toString(),
    ...expense,
    createdAt: new Date().toISOString(),
    source: 'voice'
  };
  
  trip.expenses.push(newExpense);
  trip.updatedAt = new Date().toISOString();
  saveState();
  renderAnalytics();
  renderExpenses();
  renderBudgetProgress(trip
