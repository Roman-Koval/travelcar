/**
 * TravelCar v2.1 — Голосовой ввод + синхронизация
 * @author Роман Коваль
 */

// ===== FIREBASE CONFIG =====
// Замени на свои ключи из консоли Firebase
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
  userId: null, // Firebase UID
  trips: [],
  activeTrip: null,
  settings: { theme: 'light', currency: 'RUB', sync: true },
  voice: { autoStart: true, language: 'ru-RU' },
  location: { last: null, settlement: null }
};

// ===== FIREBASE INIT =====
let db = null;
let auth = null;

async function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase not loaded, using local storage only');
    return;
  }
  
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  
  // Анонимный вход для быстрого старта
  try {
    const user = await auth.signInAnonymously();
    state.userId = user.user.uid;
    
    // Подписка на синхронизацию
    if (state.settings.sync) {
      syncTripsFromCloud();
      setupRealtimeSync();
    }    console.log('✅ Firebase connected, UID:', state.userId);
  } catch (e) {
    console.warn('⚠️ Firebase auth failed, using local mode');
  }
}

// ===== VOICE-FIRST FLOW =====
async function quickAddExpense() {
  // 1. Показываем визуальный фидбек (едва заметный)
  showMinimalIndicator('🎤 Слушаю...');
  
  // 2. Запрашиваем геолокацию параллельно с голосом
  const [locationData, voiceResult] = await Promise.all([
    getCurrentLocationSilent(),
    listenForExpense()
  ]);
  
  // 3. Автозаполнение и сохранение
  if (voiceResult?.amount && voiceResult?.category) {
    const expense = {
      title: voiceResult.title || CATEGORIES[voiceResult.category].label,
      amount: voiceResult.amount,
      category: voiceResult.category,
      date: new Date().toISOString(),
      location: locationData?.settlement || locationData?.coords || 'Место не определено',
      coords: locationData?.coords,
      auto: true // флаг "создано голосом"
    };
    
    await saveExpenseAuto(expense);
    showMinimalIndicator('✅ Сохранено: ' + expense.title);
    
    // Вибрация для подтверждения (если поддерживается)
    if (navigator.vibrate) navigator.vibrate(50);
    
  } else {
    showMinimalIndicator('❌ Не распознано', 'error');
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  }
  
  // Скрываем индикатор через 1.5 сек
  setTimeout(hideMinimalIndicator, 1500);
}

// ===== VOICE RECOGNITION =====
function listenForExpense() {
  return new Promise((resolve) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      resolve(null);
      return;    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = state.voice.language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      console.log('🎤 Listening...');
    };
    
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript.trim().toLowerCase();
      console.log('🗣️ Распознано:', transcript);
      
      const parsed = parseVoiceCommand(transcript);
      resolve(parsed);
    };
    
    recognition.onerror = (e) => {
      console.error('Voice error:', e.error);
      resolve(null);
    };
    
    recognition.onend = () => {
      console.log('🎤 Stopped');
    };
    
    recognition.start();
    
    // Таймаут 8 секунд
    setTimeout(() => recognition.stop(), 8000);
  });
}

// ===== PARSE RUSSIAN VOICE =====
function parseVoiceCommand(text) {
  const result = { amount: null, category: null, title: null, notes: '' };
  
  // 1. Извлекаем сумму (число + возможно "рублей"/"руб"/"р")
  const amountMatch = text.match(/(\d+[\s.,]?\d*)\s*(рублей|руб|р|₽)?/);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/[\s,]/g, ''));
  }
  
  // 2. Определяем категорию по ключевым словам
  const categoryKeywords = {
    fuel: ['бензин', 'топливо', 'заправка', 'газ', 'дизель', 'азс', 'розлив'],    food: ['еда', 'обед', 'ужин', 'завтрак', 'кафе', 'ресторан', 'перекус', 'продукты', 'магазин'],
    accommodation: ['отель', 'гостиница', 'хостел', 'ночёвка', 'жильё', 'квартира', 'апартаменты'],
    tolls: ['дорога', 'платная', 'шлагбаум', 'трасса', 'мост', 'тоннель'],
    repairs: ['ремонт', 'шиномонтаж', 'запчасть', 'масло', 'автосервис', 'мойка'],
    entertainment: ['билет', 'музей', 'парк', 'экскурсия', 'развлечение', 'сувенир'],
    other: ['прочее', 'другое', 'разное']
  };
  
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(k => text.includes(k))) {
      result.category = cat;
      result.title = CATEGORIES[cat].label;
      break;
    }
  }
  
  // 3. Если категория не найдена — пробуем угадать по контексту
  if (!result.category) {
    if (text.includes('купил') || text.includes('покупка')) result.category = 'other';
    else if (/\d{3,}/.test(text) && !result.amount) {
      // Есть большое число без категории — скорее всего, это сумма
      result.category = 'other';
      result.title = 'Расход';
    }
  }
  
  // 4. Остальной текст — как заметка
  const words = text.split(' ');
  const filtered = words.filter(w => 
    !/\d/.test(w) && 
    !['рублей','руб','р','₽','купил','за','в','на','и'].includes(w) &&
    !Object.values(categoryKeywords).flat().includes(w)
  );
  result.notes = filtered.join(' ');
  if (result.notes && !result.title) result.title = result.notes.slice(0, 30);
  
  // Валидация
  if (!result.amount || !result.category) return null;
  
  return result;
}

// ===== SILENT GEOLOCATION =====
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
        
        // Reverse geocoding → settlement name
        const settlement = await getSettlementName(latitude, longitude);
        
        state.location.last = { coords, settlement, timestamp: Date.now() };
        resolve({ coords, settlement });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout, maximumAge: 300000 }
    );
  });
}

async function getSettlementName(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=ru`,
      { headers: { 'User-Agent': 'TravelCar/2.1' } }
    );
    const data = await res.json();
    
    // Приоритет: город → посёлок → деревня → район
    const addr = data.address;
    return addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || null;
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
    return null;
  }
}

// ===== AUTO-SAVE EXPENSE =====
async function saveExpenseAuto(expense) {
  if (!state.activeTrip) {
    // Авто-создание поездки, если нет активной
    await createDefaultTrip();
  }
  
  const trip = state.trips.find(t => t.id === state.activeTrip);
  if (!trip) return;
    const newExpense = {
    id: Date.now().toString(),
    ...expense,
    createdAt: new Date().toISOString(),
    source: 'voice'
  };
  
  trip.expenses.push(newExpense);
  
  // Сохраняем локально
  saveState();
  
  // Синхронизируем с облаком
  if (db && state.userId) {
    await db.collection('users').doc(state.userId)
      .collection('trips').doc(trip.id)
      .collection('expenses').doc(newExpense.id)
      .set(newExpense);
  }
  
  // Обновляем аналитику
  renderAnalytics();
  renderExpenses();
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
    createdAt: new Date().toISOString()
  };
  
  state.trips.push(trip);
  state.activeTrip = trip.id;
  
  // Синхронизация в облако
  if (db && state.userId) {
    await db.collection('users').doc(state.userId)
      .collection('trips').doc(trip.id)
      .set(trip);
  }
  
  saveState();
  renderAll();}

// ===== CLOUD SYNC =====
function setupRealtimeSync() {
  if (!db || !state.userId) return;
  
  // Подписка на изменения поездок
  db.collection('users').doc(state.userId).collection('trips')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified' || change.type === 'added') {
          const cloudTrip = change.doc.data();
          const localIdx = state.trips.findIndex(t => t.id === cloudTrip.id);
          
          if (localIdx > -1) {
            // Обновляем локальную копию
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

async function syncTripsFromCloud() {
  if (!db || !state.userId) return;
  
  try {
    const snapshot = await db.collection('users').doc(state.userId).collection('trips').get();
    const cloudTrips = snapshot.docs.map(d => d.data());
    
    // Merge: облако → локально (приоритет у более свежих)
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
    console.warn('Cloud sync failed:', e);  }
}

// ===== MINIMAL UI FEEDBACK =====
function showMinimalIndicator(text, type = 'info') {
  let indicator = document.getElementById('voiceIndicator');
  
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'voiceIndicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? 'rgba(231,76,60,0.95)' : 'rgba(74,144,226,0.95)'};
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(indicator);
  }
  
  indicator.textContent = text;
  indicator.style.opacity = '1';
}

function hideMinimalIndicator() {
  const indicator = document.getElementById('voiceIndicator');
  if (indicator) indicator.style.opacity = '0';
}

// ===== EVENT: Голосовая кнопка (скрытая) =====
function initVoiceTrigger() {
  // Добавляем невидимую область для голосового триггера
  const trigger = document.createElement('div');
  trigger.id = 'voiceTrigger';
  trigger.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    border-radius: 50%;    background: rgba(74,144,226,0.15);
    border: 2px solid rgba(74,144,226,0.4);
    z-index: 80;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    transition: all 0.2s;
  `;
  trigger.innerHTML = '🎤';
  trigger.title = 'Нажми и скажи: "бензин 2500 рублей"';
  trigger.addEventListener('click', quickAddExpense);
  trigger.addEventListener('touchstart', (e) => {
    e.preventDefault();
    quickAddExpense();
  });
  
  // Анимация при наведении (для десктопа)
  trigger.addEventListener('mouseenter', () => {
    trigger.style.transform = 'scale(1.1)';
    trigger.style.background = 'rgba(74,144,226,0.25)';
  });
  trigger.addEventListener('mouseleave', () => {
    trigger.style.transform = 'scale(1)';
    trigger.style.background = 'rgba(74,144,226,0.15)';
  });
  
  document.body.appendChild(trigger);
  
  // Также триггер по долгому тапу на кнопку добавления (если есть)
  const fab = document.getElementById('addExpenseFab');
  if (fab) {
    let pressTimer;
    fab.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        e.preventDefault();
        quickAddExpense();
      }, 400);
    });
    fab.addEventListener('touchend', () => clearTimeout(pressTimer));
    fab.addEventListener('touchcancel', () => clearTimeout(pressTimer));
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Загружаем Firebase скрипты динамически
  await loadFirebaseSDK();
    await loadState();
  await initFirebase();
  applyTheme();
  initEventListeners();
  initVoiceTrigger(); // 👈 Добавляем невидимый голосовой триггер
  updateOnlineStatus();
  renderAll();
  
  // Авто-старт голоса при первом тапе (опционально)
  if (state.voice.autoStart) {
    document.body.addEventListener('click', () => {
      // После первого взаимодействия можно запрашивать микрофон
      document.body.removeEventListener('click', arguments.callee);
    }, { once: true });
  }
});

// ===== LOAD FIREBASE SDK =====
async function loadFirebaseSDK() {
  if (typeof firebase !== 'undefined') return;
  
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
    script.onload = () => {
      const scripts = [
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
      ];
      let loaded = 0;
      
      scripts.forEach(src => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { if (++loaded === scripts.length) resolve(); };
        document.head.appendChild(s);
      });
    };
    document.head.appendChild(script);
  });
}

// ===== ОСТАЛЬНОЙ КОД (рендеринг, экспорт и т.д.) =====
// ... [весь предыдущий код render*, export*, UI* функций остаётся без изменений] ...

// ===== GLOBAL =====
window.TravelCar = { state, quickAddExpense, parseVoiceCommand };
