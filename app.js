/**
 * TravelCar v2.1 — Голосовой ввод + Синхронизация
 * @author Роман Коваль
 * @version 2.1.0
 */

// ===== FIREBASE CONFIG =====
// ⚠️ ЗАМЕНИ НА СВОИ КЛЮЧИ ИЗ FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// ===== STATE =====
const state = {
  userId: null,
  trips: [],
  activeTrip: null,
  settings: {
    theme: localStorage.getItem('tc_theme') || 'light',
    currency: localStorage.getItem('tc_currency') || 'RUB',
    sync: true,
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
  }
};

// ===== CONSTANTS =====
const CATEGORIES = {
  fuel: { icon: '⛽', label: 'Топливо', keywords: ['бензин', 'топливо', 'заправка', 'газ', 'дизель', 'азс', 'розлив'] },
  food: { icon: '🍽️', label: 'Еда', keywords: ['еда', 'обед', 'ужин', 'завтрак', 'кафе', 'ресторан', 'перекус', 'продукты', 'магазин'] },
  accommodation: { icon: '🏨', label: 'Жильё', keywords: ['отель', 'гостиница', 'хостел', 'ночёвка', 'жильё', 'квартира', 'апартаменты'] },
  tolls: { icon: '🛣️', label: 'Платные дороги', keywords: ['дорога', 'платная', 'шлагбаум', 'трасса', 'мост', 'тоннель'] },  repairs: { icon: '🔧', label: 'Ремонт', keywords: ['ремонт', 'шиномонтаж', 'запчасть', 'масло', 'автосервис', 'мойка'] },
  entertainment: { icon: '🎭', label: 'Развлечения', keywords: ['билет', 'музей', 'парк', 'экскурсия', 'развлечение', 'сувенир'] },
  other: { icon: '📦', label: 'Другое', keywords: ['прочее', 'другое', 'разное'] }
};

const CATEGORY_ICONS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.icon])
);

// ===== FIREBASE =====
let db = null;
let auth = null;
let firebaseInitialized = false;

async function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('⚠️ Firebase not loaded, using local storage only');
    return;
  }
  
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    
    // Анонимный вход
    const user = await auth.signInAnonymously();
    state.userId = user.user.uid;
    firebaseInitialized = true;
    
    console.log('✅ Firebase connected, UID:', state.userId);
    
    // Синхронизация
    if (state.settings.sync) {
      await syncFromCloud();
      setupRealtimeSync();
    }
  } catch (e) {
    console.warn('⚠️ Firebase auth failed:', e.message);
  }
}

// ===== MAP =====
let map = null;
let userMarker = null;

// ===== CHARTS =====
let categoryChart = null;
let dailyChart = null;
// ===== VOICE =====
let recognition = null;
let isListening = false;

// ===== GEO CACHE =====
const geoCache = new Map();

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  await initFirebase();
  applyTheme();
  initEventListeners();
  initVoice();
  initVoiceTrigger();
  updateOnlineStatus();
  renderAll();
  
  // Set default date/time
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
      Object.assign(state, parsed);
      // Restore location cache (limited)
      if (parsed.location?.cache) {
        state.location.cache = new Map(Object.entries(parsed.location.cache));
      }
    }
    // Load settings
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
    const toSave = { ...state };    // Don't save large cache
    toSave.location.cache = {};
    localStorage.setItem('travelcar_data', JSON.stringify(toSave));
    
    // Background sync if offline
    if ('serviceWorker' in navigator && !navigator.onLine) {
      navigator.serviceWorker.ready.then(reg => {
        reg.sync?.register('sync-expenses');
      });
    }
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
  // Header
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('syncBtn').addEventListener('click', manualSync);
  
  // Trip
  document.getElementById('tripSelect').addEventListener('change', handleTripSelect);
  document.getElementById('newTripBtn').addEventListener('click', createNewTrip);
  
  // Expense Form
  document.getElementById('addExpenseForm').addEventListener('submit', handleAddExpense);
  document.getElementById('geoBtn').addEventListener('click', getCurrentLocation);
  document.getElementById('expPhoto').addEventListener('change', handlePhotoSelect);
  document.getElementById('voiceBtn').addEventListener('click', toggleVoiceInput);
  
  // Filters
  document.getElementById('searchExpenses').addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();    renderExpenses();
  });
  document.getElementById('filterCategory').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderExpenses();
  });
  document.getElementById('sortBy').addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    renderExpenses();
  });
  
  // Export
  document.getElementById('exportCSV').addEventListener('click', () => exportData('csv'));
  document.getElementById('exportJSON').addEventListener('click', () => exportData('json'));
  document.getElementById('exportPDF').addEventListener('click', () => exportData('pdf'));
  
  // Map
  document.getElementById('locateBtn').addEventListener('click', centerMapOnUser);
  
  // FAB
  document.getElementById('addExpenseFab').addEventListener('click', () => {
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
  });
  
  // Long press on FAB for voice
  let pressTimer;
  const fab = document.getElementById('addExpenseFab');
  fab.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      e.preventDefault();
      quickAddExpense();
    }, 500);
  });
  fab.addEventListener('touchend', () => clearTimeout(pressTimer));
  fab.addEventListener('touchcancel', () => clearTimeout(pressTimer));
  
  // Online status
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

// ===== VOICE TRIGGER =====
function initVoiceTrigger() {
  const trigger = document.getElementById('voiceTrigger');
  
  trigger.addEventListener('click', quickAddExpense);
  trigger.addEventListener('touchstart', (e) => {
    e.preventDefault();
    quickAddExpense();
  });}

// ===== VOICE-FIRST FLOW =====
async function quickAddExpense() {
  const trigger = document.getElementById('voiceTrigger');
  
  // Visual feedback
  trigger.classList.add('listening');
  showToast('🎤 Слушаю...', 'info');
  
  try {
    // Parallel: location + voice
    const [locationData, voiceResult] = await Promise.all([
      getCurrentLocationSilent(5000),
      listenForExpense()
    ]);
    
    if (voiceResult?.amount && voiceResult?.category) {
      // Auto-create trip if needed
      if (!state.activeTrip) {
        await createDefaultTrip();
      }
      
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
      
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);
    } else {
      showToast('❌ Не распознано. Попробуйте: "бензин 2500 рублей"', 'error');
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    }
  } catch (e) {
    console.error('Voice error:', e);
    showToast('Ошибка голосового ввода', 'error');
  } finally {
    trigger.classList.remove('listening');
  }}

// ===== VOICE RECOGNITION =====
function listenForExpense() {
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
  
  // Extract amount
  const amountMatch = text.match(/(\d+[\s.,]?\d*)\s*(рублей|руб|р|₽)?/);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/[\s,]/g, ''));
  }
  
  // Detect category
  for (const [cat, data] of Object.entries(CATEGORIES)) {
    if (data.keywords.some(k => text.includes(k))) {
      result.category = cat;
      result.title = data.label;
      break;
    }
  }  
  // Fallback
  if (!result.category) {
    if (text.includes('купил') || text.includes('покупка')) {
      result.category = 'other';
      result.title = 'Расход';
    } else if (result.amount && result.amount > 100) {
      result.category = 'other';
      result.title = 'Расход';
    }
  }
  
  // Extract notes
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
  if (!recognition) return;
  if (isListening) {
    recognition.stop();
  } else {
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
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    
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
      () => {
        clearTimeout(timer);
        resolve(null);
      },      { enableHighAccuracy: true, timeout, maximumAge: 300000 }
    );
  });
}

async function getSettlementName(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  if (state.location.cache.has(key)) {
    const cached = state.location.cache.get(key);
    if (Date.now() - cached.timestamp < 86400000) {
      return cached.name;
    }
  }
  
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=ru`,
      { headers: { 'User-Agent': 'TravelCar/2.1' } }
    );
    const data = await res.json();
    const addr = data.address;
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
        enableHighAccuracy: true,        timeout: 10000,
        maximumAge: 300000
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
      userMarker = L.marker([latitude, longitude]).addTo(map)
        .bindPopup('📍 Вы здесь').openPopup();
      map.setView([latitude, longitude], 15);
    }
    
    showToast('✅ Местоположение определено', 'success');
  } catch (err) {
    console.error('Geolocation error:', err);
    showToast('❌ Не удалось определить местоположение', 'error');
  }
}

async function detectCountry() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    return data.country_name || 'Россия';
  } catch {
    return 'Россия';
  }
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
    endDate: '',    currency: state.settings.currency,
    budget: 0,
    expenses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.trips.push(trip);
  state.activeTrip = trip.id;
  saveState();
  
  // Sync to cloud
  if (firebaseInitialized && db) {
    await db.collection('users').doc(state.userId)
      .collection('trips').doc(trip.id)
      .set(trip);
  }
  
  renderAll();
  showToast('🚗 Поездка создана!', 'success');
}

async function createDefaultTrip() {
  const country = await detectCountry();
  const trip = {
    id: Date.now().toString(),
    name: 'Поездка ' + new Date().toLocaleDateString('ru'),
    country: country || 'Россия',
    startDate: new Date().toISOString(),
    currency: state.settings.currency,
    budget: 0,
    expenses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.trips.push(trip);
  state.activeTrip = trip.id;
  
  if (firebaseInitialized && db) {
    await db.collection('users').doc(state.userId)
      .collection('trips').doc(trip.id)
      .set(trip);
  }
  
  saveState();
  renderAll();
}

async function handleTripSelect(e) {  const tripId = e.target.value;
  if (tripId === '') {
    await createNewTrip();
  } else {
    state.activeTrip = tripId;
    renderAll();
  }
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
    try {
      photoData = await compressImage(photoFile);
    } catch (err) {
      console.error('Photo compress error:', err);
      showToast('Ошибка обработки фото', 'error');
      return;
    }
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
    trip.updatedAt = new Date().toISOString();
    saveState();
    renderAll();
        // Sync to cloud
    if (firebaseInitialized && db) {
      await db.collection('users').doc(state.userId)
        .collection('trips').doc(trip.id)
        .collection('expenses').doc(expense.id)
        .set(expense);
      await db.collection('users').doc(state.userId)
        .collection('trips').doc(trip.id)
        .update({ updatedAt: trip.updatedAt });
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
  renderBudgetProgress(trip);
  
  // Sync to cloud
  if (firebaseInitialized && db) {
    await db.collection('users').doc(state.userId)
      .collection('trips').doc(trip.id)
      .collection('expenses').doc(newExpense.id)
      .set(newExpense);
    await db.collection('users').doc(state.userId)
      .collection('trips').doc(trip.id)
      .update({ updatedAt: trip.updatedAt });
  }
}

// ===== PHOTO =====function compressImage(file, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handlePhotoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    const preview = document.getElementById('photoPreview');
    preview.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
}

// ===== RENDERING =====
function renderAll() {
  renderTrips();
  renderTripInfo();
  renderMap();
  renderExpenses();
  renderAnalytics();
  updateUIVisibility();
}
function renderTrips() {
  const select = document.getElementById('tripSelect');
  const current = select.value;
  
  select.innerHTML = '<option value="">+ Новая поездка</option>' +
    state.trips.map(trip => 
      `<option value="${trip.id}" ${trip.id === state.activeTrip ? 'selected' : ''}>
        ${trip.name} (${trip.country})
      </option>`
    ).join('');
  
  select.value = current || '';
}

function renderTripInfo() {
  const section = document.getElementById('tripInfo');
  if (!state.activeTrip) {
    section.classList.add('hidden');
    return;
  }
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip) return;
  
  document.getElementById('tripTitle').textContent = trip.name;
  document.getElementById('tripDates').textContent = 
    `📅 ${new Date(trip.startDate).toLocaleDateString()} — ${trip.endDate ? new Date(trip.endDate).toLocaleDateString() : '...'}`;
  document.getElementById('tripLocation').textContent = `📍 ${trip.country}`;
  document.getElementById('tripCurrency').textContent = trip.currency;
  
  const budgetInput = document.getElementById('tripBudget');
  budgetInput.value = trip.budget || '';
  budgetInput.addEventListener('change', (e) => {
    trip.budget = parseFloat(e.target.value) || 0;
    saveState();
    renderBudgetProgress(trip);
  });
  
  renderBudgetProgress(trip);
  section.classList.remove('hidden');
}

function renderBudgetProgress(trip) {
  const total = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
  const budget = trip.budget || 0;
  const bar = document.getElementById('budgetBar');
  const status = document.getElementById('budgetStatus');
  
  if (budget > 0) {
    const percent = Math.min((total / budget) * 100, 100);    bar.style.width = `${percent}%`;
    bar.className = 'budget-bar' + (percent > 90 ? ' danger' : percent > 70 ? ' warning' : '');
    status.textContent = `${total.toFixed(2)} / ${budget} ${trip.currency} (${percent.toFixed(0)}%)`;
    
    if (total > budget) {
      showToast('⚠️ Превышен бюджет!', 'error');
    }
  } else {
    bar.style.width = '0%';
    status.textContent = `Потрачено: ${total.toFixed(2)} ${trip.currency}`;
  }
}

function renderMap() {
  const section = document.getElementById('mapSection');
  if (!state.activeTrip) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  
  if (!map) {
    map = L.map('map').setView([55.75, 37.61], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
  }
  
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  });
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip) return;
  
  trip.expenses.filter(e => e.location && e.location.includes(',')).forEach(exp => {
    const [lat, lon] = exp.location.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lon)) {
      L.marker([lat, lon])
        .bindPopup(`<b>${exp.title}</b><br>${CATEGORIES[exp.category]?.icon} ${exp.category}<br>${exp.amount} ${trip.currency}`)
        .addTo(map);
    }
  });
  
  const markers = trip.expenses
    .filter(e => e.location?.includes(','))
    .map(e => e.location.split(',').map(Number))
    .filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon));
      if (markers.length > 0) {
    const bounds = L.latLngBounds(markers);
    map.fitBounds(bounds.pad(0.2));
  }
}

function renderExpenses() {
  const container = document.getElementById('expenseList');
  const countEl = document.getElementById('expenseCount');
  
  if (!state.activeTrip) {
    container.innerHTML = '<div class="empty-state">Выберите или создайте поездку</div>';
    countEl.textContent = '0';
    return;
  }
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip) return;
  
  let expenses = [...trip.expenses];
  
  if (state.filters.search) {
    expenses = expenses.filter(e => 
      e.title.toLowerCase().includes(state.filters.search) ||
      e.location?.toLowerCase().includes(state.filters.search)
    );
  }
  if (state.filters.category) {
    expenses = expenses.filter(e => e.category === state.filters.category);
  }
  
  expenses.sort((a, b) => {
    switch(state.filters.sortBy) {
      case 'date-asc': return new Date(a.date) - new Date(b.date);
      case 'amount-desc': return b.amount - a.amount;
      case 'amount-asc': return a.amount - b.amount;
      default: return new Date(b.date) - new Date(b.date);
    }
  });
  
  countEl.textContent = expenses.length;
  
  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div>💰</div>
        <p>Нет расходов</p>
        <p style="font-size:12px;color:var(--text-secondary)">Добавьте первый расход!</p>
      </div>
    `;    return;
  }
  
  container.innerHTML = expenses.map(exp => {
    const cat = CATEGORIES[exp.category] || CATEGORIES.other;
    const date = new Date(exp.date).toLocaleString();
    return `
      <div class="expense-item" data-id="${exp.id}">
        <div class="exp-row">
          <div class="exp-left">
            <span class="exp-icon">${cat.icon}</span>
            <div class="exp-info">
              <span class="exp-title">${exp.title}</span>
              <span class="exp-location">${exp.location || 'Место не указано'}</span>
            </div>
          </div>
          <div class="exp-right">
            <span class="exp-amount">${exp.amount.toFixed(2)} ${trip.currency}</span>
            <span class="exp-date">${date}</span>
          </div>
        </div>
        ${exp.photo ? `<div style="margin-top:8px"><img src="${exp.photo}" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onclick="viewPhoto('${exp.photo}')"></div>` : ''}
        <div class="exp-actions">
          <button class="btn-edit" onclick="editExpense('${exp.id}')">✏️</button>
          <button class="btn-delete" onclick="deleteExpense('${exp.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== EXPENSE ACTIONS =====
window.editExpense = function(expenseId) {
  if (!state.activeTrip) return;
  const trip = state.trips.find(t => t.id === state.activeTrip);
  const exp = trip?.expenses.find(e => e.id === expenseId);
  if (!exp) return;
  
  showModal(`
    <h2>✏️ Редактировать</h2>
    <form id="editForm">
      <label>Название</label>
      <input type="text" id="editTitle" value="${exp.title}" required>
      <label>Сумма</label>
      <input type="number" id="editAmount" value="${exp.amount}" step="0.01" required>
      <label>Категория</label>
      <select id="editCategory">
        ${Object.entries(CATEGORIES).map(([k,v]) => 
          `<option value="${k}" ${k===exp.category?'selected':''}>${v.icon} ${v.label}</option>`
        ).join('')}      </select>
      <label>Место</label>
      <input type="text" id="editLocation" value="${exp.location||''}">
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:16px">💾 Сохранить</button>
    </form>
  `);
  
  document.getElementById('editForm').addEventListener('submit', (e) => {
    e.preventDefault();
    exp.title = document.getElementById('editTitle').value;
    exp.amount = parseFloat(document.getElementById('editAmount').value);
    exp.category = document.getElementById('editCategory').value;
    exp.location = document.getElementById('editLocation').value;
    saveState();
    renderAll();
    closeModal();
    showToast('✅ Изменения сохранены', 'success');
  });
};

window.deleteExpense = function(expenseId) {
  if (!confirm('Удалить этот расход?')) return;
  if (!state.activeTrip) return;
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  const idx = trip?.expenses.findIndex(e => e.id === expenseId);
  
  if (idx > -1) {
    trip.expenses.splice(idx, 1);
    saveState();
    renderAll();
    showToast('🗑️ Расход удалён', 'success');
  }
};

window.viewPhoto = function(photoData) {
  showModal(`<img src="${photoData}" style="width:100%;border-radius:8px"><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="closeModal()">Закрыть</button>`);
};

// ===== ANALYTICS =====
function renderAnalytics() {
  const section = document.getElementById('analytics');
  if (!state.activeTrip) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip || trip.expenses.length === 0) {    const canvas = document.querySelector('#analytics canvas');
    if (canvas) canvas.closest('.analytics').innerHTML = '<p style="text-align:center;color:var(--text-secondary)">Нет данных для аналитики</p>';
    return;
  }
  
  const total = trip.expenses.reduce((s,e) => s + e.amount, 0);
  const days = new Set(trip.expenses.map(e => e.date.slice(0,10))).size || 1;
  const byCategory = trip.expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const topCat = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0]?.[0];
  
  document.getElementById('statTotal').textContent = total.toFixed(0);
  document.getElementById('statAvg').textContent = (total/days).toFixed(0);
  document.getElementById('statCount').textContent = trip.expenses.length;
  document.getElementById('statTop').textContent = topCat ? CATEGORIES[topCat]?.icon : '-';
  document.querySelectorAll('.currency').forEach(el => el.textContent = trip.currency);
  
  renderCategoryChart(byCategory, trip.currency);
  renderDailyChart(trip.expenses, trip.currency);
}

function renderCategoryChart(data, currency) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;
  
  if (categoryChart) categoryChart.destroy();
  
  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(data).map(k => CATEGORIES[k]?.label || k),
      datasets: [{
        data: Object.values(data),
        backgroundColor: ['#4a90e2','#27ae60','#f39c12','#e74c3c','#9b59b6','#1abc9c','#34495e']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).color } },
        title: { display: true, text: 'Расходы по категориям', color: getComputedStyle(document.body).color }
      }
    }
  });
}

function renderDailyChart(expenses, currency) {  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;
  
  if (dailyChart) dailyChart.destroy();
  
  const byDay = expenses.reduce((acc, e) => {
    const day = e.date.slice(0,10);
    acc[day] = (acc[day] || 0) + e.amount;
    return acc;
  }, {});
  
  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(byDay).sort(),
      datasets: [{
        label: `Расходы (${currency})`,
        data: Object.keys(byDay).sort().map(d => byDay[d]),
        backgroundColor: '#4a90e2'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Расходы по дням', color: getComputedStyle(document.body).color }
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: getComputedStyle(document.body).color } },
        x: { ticks: { color: getComputedStyle(document.body).color, maxRotation: 45 } }
      }
    }
  });
}

// ===== EXPORT =====
async function exportData(format) {
  if (!state.activeTrip) {
    showToast('Выберите поездку', 'error');
    return;
  }
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip) return;
  
  try {
    if (format === 'csv') {
      const headers = ['Дата', 'Название', 'Категория', 'Сумма', 'Валюта', 'Место'];
      const rows = trip.expenses.map(e => [        new Date(e.date).toLocaleString(),
        e.title,
        CATEGORIES[e.category]?.label || e.category,
        e.amount,
        trip.currency,
        e.location || ''
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
      downloadFile(csv, `${trip.name}_expenses.csv`, 'text/csv');
      
    } else if (format === 'json') {
      downloadFile(JSON.stringify(trip, null, 2), `${trip.name}_data.json`, 'application/json');
      
    } else if (format === 'pdf') {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text(`Отчёт: ${trip.name}`, 14, 20);
      doc.setFontSize(10);
      doc.text(`Период: ${new Date(trip.startDate).toLocaleDateString()} — ${trip.endDate ? new Date(trip.endDate).toLocaleDateString() : '...'}`, 14, 30);
      
      let y = 45;
      const total = trip.expenses.reduce((s,e) => s + e.amount, 0);
      
      trip.expenses.forEach((e, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`${i+1}. ${e.title} — ${e.amount} ${trip.currency}`, 14, y);
        y += 8;
      });
      
      doc.line(14, y, 200, y);
      y += 10;
      doc.setFontSize(12);
      doc.text(`Итого: ${total} ${trip.currency}`, 14, y);
      
      doc.save(`${trip.name}_report.pdf`);
    }
    
    showToast(`📤 Экспорт в ${format.toUpperCase()} завершён`, 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Ошибка экспорта', 'error');
  }
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== BACKUP & SYNC =====
function backupData() {
  const data = {
    version: '2.1.0',
    exportedAt: new Date().toISOString(),
    state: state
  };
  downloadFile(JSON.stringify(data, null, 2), `travelcar_backup_${Date.now()}.json`, 'application/json');
  showToast('💾 Бэкап создан', 'success');
}

async function manualSync() {
  showToast('🔄 Синхронизация...', 'info');
  await syncFromCloud();
  showToast('✅ Синхронизация завершена', 'success');
}

async function syncFromCloud() {
  if (!firebaseInitialized || !db || !state.userId) return;
  
  try {
    const snapshot = await db.collection('users').doc(state.userId).collection('trips').get();
    const cloudTrips = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    cloudTrips.forEach(ct => {
      const local = state.trips.find(t => t.id === ct.id);
      if (!local || new Date(ct.updatedAt || ct.createdAt) > new Date(local.updatedAt || local.createdAt)) {
        const idx = state.trips.findIndex(t => t.id === ct.id);
        if (idx > -1) state.trips[idx] = ct;
        else state.trips.push(ct);
      }
    });
    
    saveState();
    if (state.activeTrip) renderAll();
  } catch (e) {
    console.warn('Cloud sync failed:', e);
  }
}

function setupRealtimeSync() {
  if (!firebaseInitialized || !db || !state.userId) return;
  
  db.collection('users').doc(state.userId).collection('trips')    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified' || change.type === 'added') {
          const cloudTrip = { id: change.doc.id, ...change.doc.data() };
          const localIdx = state.trips.findIndex(t => t.id === cloudTrip.id);
          
          if (localIdx > -1) {
            state.trips[localIdx] = { ...state.trips[localIdx], ...cloudTrip };
          } else {
            state.trips.push(cloudTrip);
          }
          
          if (state.activeTrip === cloudTrip.id) {
            renderAll();
          }
        }
      });
    }, err => console.warn('Sync error:', err));
}

// ===== UI HELPERS =====
function updateUIVisibility() {
  const hasTrip = !!state.activeTrip;
  document.getElementById('tripInfo').classList.toggle('hidden', !hasTrip);
  document.getElementById('mapSection').classList.toggle('hidden', !hasTrip);
  document.getElementById('expenseForm').classList.toggle('hidden', !hasTrip);
  document.getElementById('filters').classList.toggle('hidden', !hasTrip);
  document.getElementById('expensesSection').classList.toggle('hidden', !hasTrip);
  document.getElementById('analytics').classList.toggle('hidden', !hasTrip);
  document.getElementById('exportSection').classList.toggle('hidden', !hasTrip);
  document.getElementById('addExpenseFab').classList.toggle('hidden', !hasTrip);
}

function showModal(content) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-content"><span class="close" onclick="closeModal()">&times;</span>${content}</div>`;
  document.getElementById('modalContainer').appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

window.closeModal = function() {
  const modal = document.querySelector('.modal');
  if (modal) modal.remove();
};

function showToast(message, type = 'info') {  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

function updateOnlineStatus() {
  const indicator = document.getElementById('onlineIndicator');
  if (navigator.onLine) {
    indicator.textContent = '🟢 Онлайн';
    indicator.classList.remove('offline');
  } else {
    indicator.textContent = '🔴 Офлайн — данные сохраняются локально';
    indicator.classList.add('offline');
  }
}

function centerMapOnUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      if (map) {
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup('📍 Вы здесь').openPopup();
        map.setView([latitude, longitude], 15);
      }
    }, () => showToast('Не удалось получить местоположение', 'error'));
  }
}

// ===== GLOBAL =====
window.TravelCar = { state, quickAddExpense, parseVoiceCommand };
