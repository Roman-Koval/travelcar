// ========== FIREBASE CONFIG ==========
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

// Initialize Firebase
if (!firebase.apps.length) {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized');
  } catch (e) {
    console.error('❌ Firebase error:', e);
  }
}

const db = firebase.firestore();
const auth = firebase.auth();

// Globals
let expenses = [];
let map = null;
let markersCluster = null;
let routeLine = null;
let currentUser = null;
let recognition = null;
let ratesCache = { timestamp: 0,  null };
const geoCache = new Map();

const categories = {
  food: { icon: '🍔', label: 'Еда' },
  fuel: { icon: '⛽', label: 'Топливо' },
  hotel: { icon: '🏨', label: 'Жильё' },
  transport: { icon: '🚇', label: 'Транспорт' },
  shopping: { icon: '🛍️', label: 'Покупки' },
  entertainment: { icon: '🎭', label: 'Развлечения' },
  other: { icon: '📦', label: 'Прочее' }
};

const currencySymbols = {
  EUR: '€', USD: '$', TRY: '₺', GBP: '£', 
  CHF: '₣', CZK: 'Kč', PLN: 'zł', RUB: '₽'
};

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {  console.log('🚀 DOM Loaded');
  
  // Show diagnostic immediately
  setTimeout(() => {
    runDiagnostic();
    initMap();
  }, 500);
  
  // Connection status
  updateConnectionStatus(navigator.onLine);
  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));
});

function runDiagnostic() {
  const diag = document.getElementById('diagnostic');
  if (!diag) {
    console.warn('Diagnostic element not found');
    return;
  }
  
  let html = '<div style="line-height: 2;">';
  
  // HTTPS check
  const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  html += `<div>${isHTTPS ? '✅' : '❌'} HTTPS: ${isHTTPS ? 'OK' : 'Нужен для микрофона'}</div>`;
  
  // Browser info
  html += `<div>🌐 ${navigator.userAgent.split(' ').pop()}</div>`;
  
  // Speech Recognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    html += `<div>✅ Speech Recognition: доступен</div>`;
    
    try {
      const test = new SpeechRecognition();
      html += `<div>🎤 Язык: ru-RU</div>`;
      html += `<div>🎤 Готов к работе</div>`;
    } catch (e) {
      html += `<div>⚠️ Ошибка инициализации: ${e.message}</div>`;
    }
  } else {
    html += `<div>❌ Speech Recognition: НЕ поддерживается</div>`;
    html += `<div style="color: #f59e0b; margin-top: 10px;">💡 Используйте Google Chrome</div>`;
  }
  
  // Microphone permission
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'microphone' }).then(result => {      html += `<div>🎙️ Микрофон: ${result.state}</div>`;
      html += '</div>';
      diag.innerHTML = html;
    }).catch(() => {
      html += `<div>🎙️ Микрофон: проверка недоступна</div>`;
      html += '</div>';
      diag.innerHTML = html;
    });
  } else {
    html += `<div>🎙️ Проверка прав: недоступна</div>`;
    html += '</div>';
    diag.innerHTML = html;
  }
  
  // Firebase
  html += `<div>${firebase.apps.length > 0 ? '✅' : '❌'} Firebase: ${firebase.apps.length > 0 ? 'OK' : 'Ошибка'}</div>`;
  
  diag.innerHTML = html;
}

// ========== VOICE RECOGNITION ==========
function startVoice() {
  console.log('🎤 startVoice called');
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    alert('❌ Ваш браузер не поддерживает голосовой ввод.\n\nИспользуйте Google Chrome:\n1. Откройте в Chrome\n2. Разрешите доступ к микрофону\n3. Нажмите кнопку ещё раз');
    return;
  }
  
  const voiceStatus = document.getElementById('voiceStatus');
  const voiceBtn = document.getElementById('voiceBtn');
  
  // Create new recognition instance
  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    
    console.log('✅ Recognition created');
    
    recognition.onstart = () => {
      console.log('🔴 Recording started');
      if (voiceBtn) {
        voiceBtn.classList.add('recording');
        voiceBtn.innerHTML = '<span>🎙️</span><span>Запись...</span>';
      }      if (voiceStatus) {
        voiceStatus.textContent = '🔴 Говорите сейчас...';
        voiceStatus.style.color = '#ef4444';
      }
    };
    
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('✅ Recognized:', transcript);
      
      if (voiceStatus) {
        voiceStatus.textContent = `✅ "${transcript}"`;
        voiceStatus.style.color = '#22c55e';
      }
      
      // Parse and fill
      const parsed = parseVoiceInput(transcript);
      fillForm(parsed, transcript);
      
      // Get location and save
      await getGeo();
      setTimeout(() => addExpense(), 1000);
    };
    
    recognition.onerror = (event) => {
      console.error('❌ Voice error:', event.error);
      
      let msg = '';
      switch(event.error) {
        case 'no-speech':
          msg = '🔇 Не слышно речи. Говорите громче.';
          break;
        case 'audio-capture':
          msg = '🎤 Микрофон не найден';
          break;
        case 'not-allowed':
          msg = '⛔ Разрешите доступ к микрофону в настройках браузера';
          break;
        case 'network':
          msg = '🌐 Ошибка сети. Проверьте интернет.';
          break;
        default:
          msg = `❌ ${event.error}`;
      }
      
      if (voiceStatus) {
        voiceStatus.textContent = msg;
        voiceStatus.style.color = '#ef4444';
      }
      showToast(msg, 'error');      
      resetVoiceButton();
    };
    
    recognition.onend = () => {
      console.log('🎤 Recording ended');
      resetVoiceButton();
    };
    
    // Start recognition
    recognition.start();
    console.log('🎤 Recognition started');
    
  } catch (e) {
    console.error('❌ Error creating recognition:', e);
    alert('Ошибка: ' + e.message + '\n\nПопробуйте:\n1. Обновить страницу\n2. Использовать Chrome\n3. Ввести вручную');
    resetVoiceButton();
  }
}

function resetVoiceButton() {
  const voiceBtn = document.getElementById('voiceBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  
  if (voiceBtn) {
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<span>🎤</span><span>Голосовой ввод</span>';
  }
  
  setTimeout(() => {
    if (voiceStatus) {
      voiceStatus.textContent = '';
      voiceStatus.style.color = '#94a3b8';
    }
  }, 3000);
}

// ========== MANUAL PARSE (GUARANTEED TO WORK) ==========
function parseManual() {
  console.log('📝 parseManual called');
  
  const input = document.getElementById('manualText');
  if (!input) {
    console.error('manualText element not found');
    return;
  }
  
  const text = input.value.trim();
  console.log('Input text:', text);
    if (!text) {
    showToast('❌ Введите текст (например: пицца 30 евро)', 'error');
    return;
  }
  
  const parsed = parseVoiceInput(text);
  console.log('Parsed:', parsed);
  
  fillForm(parsed, text);
  showToast(`✅ Распознано: ${parsed.amount} ${parsed.currency}`, 'success');
  
  // Auto get location
  getGeo();
}

function fillForm(parsed, comment) {
  const amountInput = document.getElementById('amount');
  const currencySelect = document.getElementById('currency');
  const categorySelect = document.getElementById('category');
  const commentInput = document.getElementById('comment');
  
  if (amountInput) amountInput.value = parsed.amount || '';
  if (currencySelect) currencySelect.value = parsed.currency;
  if (categorySelect) categorySelect.value = parsed.category;
  if (commentInput) commentInput.value = comment;
  
  console.log('Form filled:', { parsed, comment });
}

function parseVoiceInput(text) {
  const lower = text.toLowerCase();
  console.log('Parsing:', lower);
  
  // Amount - find numbers
  const amountMatch = lower.match(/(\d+[.,]?\d*)/);
  let amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
  
  // Currency
  let currency = 'EUR';
  if (/лир|try/i.test(lower)) currency = 'TRY';
  else if (/доллар|дол|usd|\$/i.test(lower)) currency = 'USD';
  else if (/фунт|gbp|£/i.test(lower)) currency = 'GBP';
  else if (/франк|chf/i.test(lower)) currency = 'CHF';
  else if (/злот|pln/i.test(lower)) currency = 'PLN';
  else if (/крон|czk/i.test(lower)) currency = 'CZK';
  else if (/рубль|rub|руб/i.test(lower)) currency = 'RUB';
  else if (/евро|eur|€/i.test(lower)) currency = 'EUR';
  
  // Category
  let category = 'other';  if (/еда|обед|ужин|завтрак|кофе|ресторан|кафе|пицца|бургер|food|eat|pizza/i.test(lower)) {
    category = 'food';
  } else if (/бензин|топливо|заправ|газ|fuel|petrol|gas/i.test(lower)) {
    category = 'fuel';
  } else if (/отель|гостиниц|жильё|ночлег|hotel|stay/i.test(lower)) {
    category = 'hotel';
  } else if (/транспорт|метро|автобус|такси|transport|taxi|metro/i.test(lower)) {
    category = 'transport';
  } else if (/покупк|шопинг|магазин|shopping|buy/i.test(lower)) {
    category = 'shopping';
  } else if (/развлеч|кино|театр|билет|entertainment|ticket/i.test(lower)) {
    category = 'entertainment';
  }
  
  const result = { amount, currency, category };
  console.log('Parse result:', result);
  return result;
}

// ========== GEOLOCATION ==========
async function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      const loc = document.getElementById('location');
      if (loc) loc.value = 'Не поддерживается';
      resolve();
      return;
    }
    
    const locInput = document.getElementById('location');
    if (locInput) locInput.value = '📍 Определение...';
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        
        if (geoCache.has(key)) {
          window._lat = lat;
          window._lng = lng;
          const loc = document.getElementById('location');
          if (loc) loc.value = geoCache.get(key);
          resolve();
          return;
        }
        
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=ru`
          );          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || 'Unknown';
          
          geoCache.set(key, city);
          window._lat = lat;
          window._lng = lng;
          
          const loc = document.getElementById('location');
          if (loc) loc.value = city;
          
          await new Promise(r => setTimeout(r, 1100));
          resolve();
        } catch (e) {
          window._lat = lat;
          window._lng = lng;
          const loc = document.getElementById('location');
          if (loc) loc.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          resolve();
        }
      },
      (err) => {
        console.warn('Geo error:', err);
        const loc = document.getElementById('location');
        if (loc) loc.value = 'Не определено';
        resolve();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ========== CURRENCY ==========
async function convertToEUR(amount, currency) {
  if (!amount || currency === 'EUR') return amount || 0;
  
  const now = Date.now();
  if (ratesCache.data && (now - ratesCache.timestamp) < 3600000) {
    const rate = ratesCache.data[currency];
    return rate ? amount / rate : amount;
  }
  
  try {
    const res = await fetch('https://api.frankfurter.dev/latest');
    const data = await res.json();
    ratesCache = { timestamp: now,  data.rates };
    const rate = data.rates[currency];
    return rate ? amount / rate : amount;
  } catch (e) {
    return amount;
  }}

// ========== ADD EXPENSE ==========
async function addExpense() {
  const amountInput = document.getElementById('amount');
  const amount = parseFloat(amountInput?.value);
  const currency = document.getElementById('currency')?.value || 'EUR';
  const category = document.getElementById('category')?.value || 'other';
  const comment = document.getElementById('comment')?.value.trim() || '';
  const city = document.getElementById('location')?.value || '';
  
  if (!amount || amount <= 0) {
    showToast('❌ Введите сумму', 'error');
    return;
  }
  
  if (!currentUser) {
    showToast('⏳ Ожидание авторизации...', 'error');
    setTimeout(addExpense, 2000);
    return;
  }
  
  showToast('💾 Сохранение...', 'success');
  
  try {
    const eur = await convertToEUR(amount, currency);
    
    await db.collection('expenses').add({
      amount,
      currency,
      category,
      eur,
      comment,
      city,
      lat: window._lat || null,
      lng: window._lng || null,
      date: firebase.firestore.FieldValue.serverTimestamp(),
      userId: currentUser.uid,
      createdAt: new Date().toISOString()
    });
    
    if (amountInput) amountInput.value = '';
    const commentInput = document.getElementById('comment');
    if (commentInput) commentInput.value = '';
    const manualInput = document.getElementById('manualText');
    if (manualInput) manualInput.value = '';
    
    showToast('✅ Сохранено!', 'success');
  } catch (e) {
    console.error('Save error:', e);    showToast('Ошибка: ' + e.message, 'error');
  }
}

// ========== DELETE ==========
async function deleteExpense(id) {
  if (!confirm('Удалить?')) return;
  try {
    await db.collection('expenses').doc(id).delete();
    showToast('Удалено', 'success');
  } catch (e) {
    showToast('Ошибка', 'error');
  }
}

// ========== RENDER ==========
function renderExpenses() {
  const list = document.getElementById('list');
  if (!list) return;
  
  list.innerHTML = '';
  
  let total = 0;
  const catTotals = {};
  Object.keys(categories).forEach(c => catTotals[c] = 0);
  
  if (expenses.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">📭 Нет записей<br><small>Добавьте первый расход</small></div>';
    document.getElementById('totalEUR').textContent = '€0.00';
    document.getElementById('totalCount').textContent = '0';
    return;
  }
  
  expenses.forEach(exp => {
    total += exp.eur || 0;
    catTotals[exp.category] = (catTotals[exp.category] || 0) + (exp.eur || 0);
    
    const div = document.createElement('div');
    div.className = `expense-item category-${exp.category}`;
    
    const date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.createdAt);
    const dateStr = date.toLocaleString('ru-RU', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    });
    
    const cat = categories[exp.category] || categories.other;
    const sym = currencySymbols[exp.currency] || '';
    
    div.innerHTML = `
      <div class="expense-header">        <div>
          <span class="expense-amount">${sym}${exp.amount} ${exp.currency}</span>
          <span class="expense-eur">(€${(exp.eur || 0).toFixed(2)})</span>
        </div>
        <span class="expense-category">${cat.icon} ${cat.label}</span>
      </div>
      ${exp.comment ? `<div class="expense-details">📝 ${exp.comment}</div>` : ''}
      ${exp.city ? `<div class="expense-details">📍 ${exp.city}</div>` : ''}
      <div class="expense-date">🕐 ${dateStr}</div>
      <button class="delete-btn" onclick="deleteExpense('${exp.id}')">🗑️</button>
    `;
    
    list.appendChild(div);
  });
  
  document.getElementById('totalEUR').textContent = `€${total.toFixed(2)}`;
  document.getElementById('totalCount').textContent = expenses.length;
  
  const catStatsEl = document.getElementById('categoryStats');
  if (catStatsEl) {
    catStatsEl.innerHTML = '';
    Object.entries(catTotals).forEach(([cat, tot]) => {
      if (tot > 0) {
        const info = categories[cat];
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = `<span>${info.icon} ${info.label}</span><span style="color:#22c55e;font-weight:bold;">€${tot.toFixed(2)}</span>`;
        catStatsEl.appendChild(div);
      }
    });
  }
}

// ========== EXPORT ==========
function exportData() {
  if (expenses.length === 0) {
    showToast('Нет данных', 'error');
    return;
  }
  const data = expenses.map(e => ({
    amount: e.amount,
    currency: e.currency,
    eur: e.eur,
    category: e.category,
    comment: e.comment,
    city: e.city,
    date: e.date?.toDate ? e.date.toDate().toISOString() : e.createdAt
  }));
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `travelcar-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('Экспортировано', 'success');
}

// ========== TOAST ==========
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.log(type.toUpperCase() + ':', msg);
    alert(msg);
    return;
  }
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========== AUTH ==========
auth.onAuthStateChanged(user => {
  if (user) {
    console.log('✅ Auth:', user.uid);
    currentUser = user;
    
    db.collection('expenses')
      .where('userId', '==', user.uid)
      .orderBy('date', 'desc')
      .onSnapshot(snapshot => {
        expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('Loaded:', expenses.length, 'expenses');
        renderExpenses();
        updateMap();
        
        const sync = document.getElementById('lastSync');
        if (sync) sync.textContent = new Date().toLocaleTimeString('ru-RU');
      }, err => {
        console.error('Firestore error:', err);
        showToast('Ошибка синхронизации', 'error');
      });
  } else {
    console.log('🔄 Anonymous sign-in...');
    auth.signInAnonymously()
      .then(() => console.log('✅ Anonymous OK'))
      .catch(err => {
        console.error('❌ Auth error:', err);
        showToast('Ошибка авторизации: ' + err.message, 'error');
      });
  }});

// ========== MAP ==========
function initMap() {
  try {
    if (map) return;
    map = L.map('map').setView([51.5, 10], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    
    markersCluster = L.markerClusterGroup();
    map.addLayer(markersCluster);
    console.log('✅ Map initialized');
  } catch (e) {
    console.error('❌ Map error:', e);
  }
}

function updateMap() {
  if (!map || !markersCluster) return;
  
  markersCluster.clearLayers();
  const points = [];
  
  expenses.forEach(exp => {
    if (exp.lat && exp.lng) {
      const cat = categories[exp.category] || categories.other;
      const sym = currencySymbols[exp.currency] || '';
      
      const marker = L.marker([exp.lat, exp.lng]);
      const date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.createdAt);
      
      marker.bindPopup(`
        <div style="min-width:150px;">
          <b>${cat.icon} ${sym}${exp.amount}</b><br>
          <span style="color:#22c55e;">€${(exp.eur || 0).toFixed(2)}</span><br>
          ${exp.city ? `<div>📍 ${exp.city}</div>` : ''}
          ${exp.comment ? `<div>${exp.comment}</div>` : ''}
          <div style="font-size:0.85em;color:#666;margin-top:5px;">${date.toLocaleDateString('ru-RU')}</div>
        </div>
      `);
      
      markersCluster.addLayer(marker);
      points.push([exp.lat, exp.lng]);
    }
  });
  
  if (routeLine) map.removeLayer(routeLine);
  
  if (points.length >= 2) {
    routeLine = L.polyline(points, {
      color: '#22c55e',
      weight: 3,
      opacity: 0.7,
      dashArray: '10, 10'
    }).addTo(map);
    
    map.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 14 });
  } else if (points.length === 1) {
    map.setView(points[0], 13);
  }
}

function updateConnectionStatus(online) {
  const status = document.getElementById('connection-status');
  if (status) {
    status.innerHTML = online ? '🟢 Online' : '🔴 Offline';
    status.className = `status ${online ? 'online' : 'offline'}`;
  }
}
