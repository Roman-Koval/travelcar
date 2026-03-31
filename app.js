// Firebase Configuration - ЗАМЕНИ НА СВОИ!
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
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// Global variables
let expenses = [];
let map = null;
let markersCluster = null;
let routeLine = null;
let currentUser = null;
let ratesCache = { timestamp: 0,  null };
const geoCache = new Map();

const categories = {
  food: { icon: '🍔', label: 'Еда', color: '#f59e0b' },
  fuel: { icon: '⛽', label: 'Топливо', color: '#ef4444' },
  hotel: { icon: '🏨', label: 'Жильё', color: '#3b82f6' },
  transport: { icon: '🚇', label: 'Транспорт', color: '#8b5cf6' },
  shopping: { icon: '🛍️', label: 'Покупки', color: '#ec4899' },
  entertainment: { icon: '🎭', label: 'Развлечения', color: '#14b8a6' },
  other: { icon: '📦', label: 'Прочее', color: '#6b7280' }
};

const currencySymbols = {
  EUR: '€', USD: '$', TRY: '₺', GBP: '£', 
  CHF: '₣', CZK: 'Kč', PLN: 'zł', RUB: '₽'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => initMap(), 1000);
  checkConnection();
  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));
});

function initMap() {  try {
    if (map) return;
    map = L.map('map').setView([51.5, 10], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    
    markersCluster = L.markerClusterGroup();
    map.addLayer(markersCluster);
  } catch (e) {
    console.error('Map error:', e);
  }
}

function checkConnection() {
  const status = document.getElementById('connection-status');
  if (status) {
    status.innerHTML = navigator.onLine ? '🟢 Online' : '🔴 Offline';
    status.className = `status ${navigator.onLine ? 'online' : 'offline'}`;
  }
}

function updateConnectionStatus(online) {
  const status = document.getElementById('connection-status');
  if (status) {
    status.innerHTML = online ? '🟢 Online' : '🔴 Offline';
    status.className = `status ${online ? 'online' : 'offline'}`;
  }
}

// FIXED VOICE RECOGNITION
function startVoice() {
  const voiceStatus = document.getElementById('voiceStatus');
  const voiceBtn = document.getElementById('voiceBtn');
  
  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    alert('❌ Ваш браузер не поддерживает голосовой ввод.\n\nИспользуйте Google Chrome или Edge.');
    return;
  }
  
  // Check if already recording
  if (voiceBtn.classList.contains('recording')) {
    showToast('Уже записываю...', 'error');
    return;
  }
    const recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  
  // UI feedback
  voiceBtn.classList.add('recording');
  voiceBtn.innerHTML = '<span class="btn-icon">🎙️</span><span class="btn-text">Запись...</span>';
  if (voiceStatus) voiceStatus.textContent = '🔴 Говорите сейчас...';
  
  showToast('🎤 Говорите: "пицца 30 евро"', 'success');
  
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('✅ Recognized:', transcript);
    
    if (voiceStatus) voiceStatus.textContent = `Распознано: "${transcript}"`;
    
    // Parse and fill
    const parsed = parseVoiceInput(transcript);
    
    const amountInput = document.getElementById('amount');
    const currencySelect = document.getElementById('currency');
    const categorySelect = document.getElementById('category');
    const commentInput = document.getElementById('comment');
    
    if (amountInput) amountInput.value = parsed.amount || '';
    if (currencySelect) currencySelect.value = parsed.currency;
    if (categorySelect) categorySelect.value = parsed.category;
    if (commentInput) commentInput.value = transcript;
    
    showToast(`✅ ${parsed.amount} ${parsed.currency} - ${categories[parsed.category].label}`, 'success');
    
    // Get location and save
    await getGeo();
    
    setTimeout(() => {
      addExpense();
    }, 1500);
  };
  
  recognition.onerror = (event) => {
    console.error('❌ Voice error:', event.error);
    let errorMsg = 'Ошибка распознавания';
    
    switch(event.error) {
      case 'no-speech':
        errorMsg = '🔇 Не слышно речи. Попробуйте ещё раз.';
        break;      case 'audio-capture':
        errorMsg = '🎤 Нет доступа к микрофону';
        break;
      case 'not-allowed':
        errorMsg = '⛔ Разрешите доступ к микрофону';
        break;
      case 'network':
        errorMsg = '🌐 Ошибка сети';
        break;
    }
    
    if (voiceStatus) voiceStatus.textContent = errorMsg;
    showToast(errorMsg, 'error');
    
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Голосовой ввод</span>';
  };
  
  recognition.onend = () => {
    console.log('Recognition ended');
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Голосовой ввод</span>';
    setTimeout(() => {
      if (voiceStatus) voiceStatus.textContent = '';
    }, 3000);
  };
  
  try {
    recognition.start();
  } catch (e) {
    console.error('Start error:', e);
    showToast('Ошибка запуска: ' + e.message, 'error');
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Голосовой ввод</span>';
  }
}

function parseVoiceInput(text) {
  const lower = text.toLowerCase();
  
  // Amount
  const amountMatch = lower.match(/(\d+[.,]?\d*)/);
  let amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
  
  // Currency
  let currency = 'EUR';
  if (/лир|try/i.test(lower)) currency = 'TRY';
  else if (/доллар|дол|usd|\$/i.test(lower)) currency = 'USD';
  else if (/фунт|gbp|£/i.test(lower)) currency = 'GBP';
  else if (/франк|chf/i.test(lower)) currency = 'CHF';  else if (/злот|pln/i.test(lower)) currency = 'PLN';
  else if (/крон|czk/i.test(lower)) currency = 'CZK';
  else if (/рубль|rub|руб/i.test(lower)) currency = 'RUB';
  
  // Category
  let category = 'other';
  if (/еда|обед|ужин|завтрак|кофе|ресторан|кафе|пицца|бургер|food|eat|pizza/i.test(lower)) {
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
  
  return { amount, currency, category };
}

async function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      const loc = document.getElementById('location');
      if (loc) loc.value = 'Не поддерживается';
      resolve();
      return;
    }
    
    const locStatus = document.getElementById('location');
    if (locStatus) locStatus.value = '📍 Определение...';
    
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
        
        try {          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=ru`,
            { headers: { 'Accept-Language': 'ru' }}
          );
          const data = await res.json();
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
    return rate ? amount / rate : amount;  } catch (e) {
    return amount;
  }
}

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
    
    showToast('✅ Сохранено!', 'success');
  } catch (e) {
    console.error('Save error:', e);    showToast('Ошибка: ' + e.message, 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('Удалить?')) return;
  try {
    await db.collection('expenses').doc(id).delete();
    showToast('Удалено', 'success');
  } catch (e) {
    showToast('Ошибка удаления', 'error');
  }
}

function renderExpenses() {
  const list = document.getElementById('list');
  if (!list) return;
  
  const filterCat = document.getElementById('filterCategory')?.value || 'all';
  list.innerHTML = '';
  
  let total = 0;
  const catTotals = {};
  Object.keys(categories).forEach(c => catTotals[c] = 0);
  
  const filtered = filterCat === 'all' ? expenses : expenses.filter(e => e.category === filterCat);
  
  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">📭 Нет записей<br><small>Используйте голосовой ввод 🎤</small></div>';
    const totalEl = document.getElementById('totalEUR');
    const countEl = document.getElementById('totalCount');
    if (totalEl) totalEl.textContent = '€0.00';
    if (countEl) countEl.textContent = '0';
    return;
  }
  
  filtered.forEach(exp => {
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
      <div class="expense-header">
        <div>
          <span class="expense-amount">${sym}${exp.amount} ${exp.currency}</span>
          <span class="expense-eur">(€${(exp.eur || 0).toFixed(2)})</span>
        </div>
        <span class="expense-category">${cat.icon} ${cat.label}</span>
      </div>
      ${exp.comment ? `<div class="expense-details">📝 ${exp.comment}</div>` : ''}
      ${exp.city ? `<div class="expense-details">📍 ${exp.city}</div>` : ''}
      <div class="expense-date">🕐 ${dateStr}</div>
      <button class="delete-btn" onclick="deleteExpense('${exp.id}')">🗑️ Удалить</button>
    `;
    
    list.appendChild(div);
  });
  
  const totalEl = document.getElementById('totalEUR');
  const countEl = document.getElementById('totalCount');
  const catStatsEl = document.getElementById('categoryStats');
  
  if (totalEl) totalEl.textContent = `€${total.toFixed(2)}`;
  if (countEl) countEl.textContent = filtered.length;
  
  if (catStatsEl) {
    catStatsEl.innerHTML = '';
    Object.entries(catTotals).forEach(([cat, tot]) => {
      if (tot > 0) {
        const info = categories[cat];
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = `<span>${info.icon} ${info.label}</span><span style="color:var(--accent);font-weight:bold;">€${tot.toFixed(2)}</span>`;
        catStatsEl.appendChild(div);
      }
    });
  }
}

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
    comment: e.comment,    city: e.city,
    date: e.date?.toDate ? e.date.toDate().toISOString() : e.createdAt
  }));
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `travelcar-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('Экспортировано', 'success');
}

function exportCSV() {
  if (expenses.length === 0) {
    showToast('Нет данных', 'error');
    return;
  }
  const headers = ['Date', 'Amount', 'Currency', 'EUR', 'Category', 'City', 'Comment'];
  const rows = expenses.map(e => [
    e.date?.toDate ? e.date.toDate().toISOString() : e.createdAt,
    e.amount,
    e.currency,
    (e.eur || 0).toFixed(2),
    categories[e.category]?.label || e.category,
    e.city || '',
    `"${(e.comment || '').replace(/"/g, '""')}"`
  ]);
  
  const csv = '\ufeff' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `travelcar-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('CSV экспортирован', 'success');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.log(type.toUpperCase() + ':', msg);
    return;
  }
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Auth
auth.onAuthStateChanged(user => {  if (user) {
    console.log('✅ Auth:', user.uid);
    currentUser = user;
    
    db.collection('expenses')
      .where('userId', '==', user.uid)
      .orderBy('date', 'desc')
      .onSnapshot(snapshot => {
        expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('Loaded:', expenses.length);
        renderExpenses();
        updateMap();
        
        const sync = document.getElementById('lastSync');
        if (sync) sync.textContent = 'Обновлено: ' + new Date().toLocaleTimeString('ru-RU');
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
  }
});

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
          ${exp.comment ? `<div>${exp.comment}</div>` : ''}          <div style="font-size:0.85em;color:#666;margin-top:5px;">${date.toLocaleDateString('ru-RU')}</div>
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
