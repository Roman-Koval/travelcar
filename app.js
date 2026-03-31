// Firebase Configuration - ЗАМЕНИ НА СВОИ ДАННЫЕ ИЗ FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
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
let ratesCache = { timestamp: 0, data: null };
const geoCache = new Map();

// Category icons and labels
const categories = {
  food: { icon: '🍔', label: 'Еда', color: '#f59e0b' },
  fuel: { icon: '⛽', label: 'Топливо', color: '#ef4444' },
  hotel: { icon: '🏨', label: 'Жильё', color: '#3b82f6' },
  transport: { icon: '🚇', label: 'Транспорт', color: '#8b5cf6' },
  shopping: { icon: '🛍️', label: 'Покупки', color: '#ec4899' },
  entertainment: { icon: '🎭', label: 'Развлечения', color: '#14b8a6' },
  other: { icon: '📦', label: 'Прочее', color: '#6b7280' }
};

// Currency symbols
const currencySymbols = {
  EUR: '€',
  USD: '$',
  TRY: '₺',
  GBP: '£',
  CHF: '₣',
  CZK: 'Kč',
  PLN: 'zł',
  RUB: '₽'
};

// Initialize appdocument.addEventListener('DOMContentLoaded', () => {
  setTimeout(initMap, 500);
  checkConnection();
  
  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));
});

// Initialize Map
function initMap() {
  try {
    map = L.map('map').setView([51.5, 10], 5);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    
    markersCluster = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50
    });
    
    map.addLayer(markersCluster);
    console.log('Map initialized');
  } catch (e) {
    console.error('Map init error:', e);
  }
}

// Connection status
function checkConnection() {
  updateConnectionStatus(navigator.onLine);
}

function updateConnectionStatus(online) {
  const status = document.getElementById('connection-status');
  if (status) {
    if (online) {
      status.innerHTML = '🟢 Online';
      status.className = 'status online';
    } else {
      status.innerHTML = '🔴 Offline';
      status.className = 'status offline';
    }
  }
}
// Voice Recognition - AUTO PARSE & SAVE
function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showToast('Используйте Chrome для голосового ввода', 'error');
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  const voiceBtn = document.getElementById('voiceBtn');
  const originalText = voiceBtn.innerHTML;
  
  voiceBtn.innerHTML = '🎙️ Слушаю...';
  voiceBtn.classList.add('recording');
  
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('Recognized:', transcript);
    
    // Auto-parse
    const parsed = parseVoiceInput(transcript);
    console.log('Parsed:', parsed);
    
    // Fill fields
    if (parsed.amount) {
      document.getElementById('amount').value = parsed.amount;
    }
    document.getElementById('currency').value = parsed.currency;
    document.getElementById('category').value = parsed.category;
    document.getElementById('comment').value = transcript;
    
    showToast(`Распознано: ${parsed.amount} ${parsed.currency}`, 'success');
    
    // Auto-get geolocation
    await getGeo();
    
    // Auto-save after 1 second
    setTimeout(() => {
      addExpense();
    }, 1000);
  };
  
  recognition.onerror = (event) => {
    console.error('Voice error:', event.error);
    showToast('Ошибка распознавания', 'error');    voiceBtn.innerHTML = originalText;
    voiceBtn.classList.remove('recording');
  };
  
  recognition.onend = () => {
    voiceBtn.innerHTML = originalText;
    voiceBtn.classList.remove('recording');
  };
  
  recognition.start();
}

// Smart parser
function parseVoiceInput(text) {
  const lower = text.toLowerCase();
  
  // Parse amount - find all numbers
  const amountMatch = lower.match(/(\d+[.,]?\d*)/);
  let amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
  
  // Parse currency with priority
  let currency = 'EUR';
  if (/лир|турецк|try/i.test(lower)) currency = 'TRY';
  else if (/доллар|дол|usd|\$/i.test(lower)) currency = 'USD';
  else if (/фунт|gbp|£/i.test(lower)) currency = 'GBP';
  else if (/франк|chf/i.test(lower)) currency = 'CHF';
  else if (/злот|pln/i.test(lower)) currency = 'PLN';
  else if (/крон|czk/i.test(lower)) currency = 'CZK';
  else if (/рубль|rub|руб/i.test(lower)) currency = 'RUB';
  else if (/евро|eur|€/i.test(lower)) currency = 'EUR';
  
  // Parse category
  let category = 'other';
  if (/еда|обед|ужин|завтрак|кофе|ресторан|кафе|пицца|бургер|перекус|food|eat|pizza/i.test(lower)) {
    category = 'food';
  } else if (/бензин|топливо|заправ|газ|fuel|petrol|gas|oil/i.test(lower)) {
    category = 'fuel';
  } else if (/отель|гостиниц|жильё|ночлег|hotel|stay|accommodation|апартамент/i.test(lower)) {
    category = 'hotel';
  } else if (/транспорт|метро|автобус|такси|билет|transport|taxi|metro|bus/i.test(lower)) {
    category = 'transport';
  } else if (/покупк|шопинг|магазин|shopping|buy|shop/i.test(lower)) {
    category = 'shopping';
  } else if (/развлеч|кино|театр|музей|билет|entertainment|ticket|cinema/i.test(lower)) {
    category = 'entertainment';
  }
  
  return { amount, currency, category };
}
// Geolocation
async function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      const locInput = document.getElementById('location');
      if (locInput) locInput.value = 'Не поддерживается';
      resolve();
      return;
    }
    
    showToast('📍 Определение...', 'success');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        
        // Check cache
        if (geoCache.has(key)) {
          window._lat = lat;
          window._lng = lng;
          const locInput = document.getElementById('location');
          if (locInput) locInput.value = geoCache.get(key);
          resolve();
          return;
        }
        
        try {
          // Reverse geocoding
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=10&accept-language=ru`,
            { headers: { 'Accept-Language': 'ru' }}
          );
          
          const data = await response.json();
          const city = data.address?.city || 
                      data.address?.town || 
                      data.address?.village || 
                      data.address?.state_district ||
                      'Unknown';
          
          geoCache.set(key, city);
          window._lat = lat;
          window._lng = lng;
          
          const locInput = document.getElementById('location');
          if (locInput) locInput.value = city;
          
          showToast(`📍 ${city}`, 'success');
          await new Promise(r => setTimeout(r, 1100)); // Rate limit          resolve();
        } catch (error) {
          console.warn('Geocoding failed:', error);
          window._lat = lat;
          window._lng = lng;
          const locInput = document.getElementById('location');
          if (locInput) locInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          resolve();
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        const locInput = document.getElementById('location');
        if (locInput) locInput.value = 'Не определено';
        showToast('Геолокация недоступна', 'error');
        resolve();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Currency conversion
async function convertToEUR(amount, currency) {
  if (!amount || currency === 'EUR') return amount || 0;
  
  const now = Date.now();
  
  // Use cache
  if (ratesCache.data && (now - ratesCache.timestamp) < 3600000) {
    const rate = ratesCache.data[currency];
    return rate ? amount / rate : amount;
  }
  
  try {
    const response = await fetch('https://api.frankfurter.dev/latest');
    const data = await response.json();
    
    ratesCache = { timestamp: now, data: data.rates };
    const rate = data.rates[currency];
    
    return rate ? amount / rate : amount;
  } catch (error) {
    console.warn('Currency API failed:', error);
    return amount;
  }
}

// Add expense
async function addExpense() {  const amountInput = document.getElementById('amount');
  const amount = parseFloat(amountInput.value);
  const currency = document.getElementById('currency').value;
  const category = document.getElementById('category').value;
  const comment = document.getElementById('comment').value.trim();
  const city = document.getElementById('location').value;
  
  if (!amount || amount <= 0) {
    showToast('Введите сумму', 'error');
    return;
  }
  
  if (!currentUser) {
    showToast('⏳ Ожидание авторизации...', 'error');
    return;
  }
  
  showToast('💾 Сохранение...', 'success');
  
  try {
    const eurAmount = await convertToEUR(amount, currency);
    
    const expenseData = {
      amount: amount,
      currency: currency,
      category: category,
      eur: eurAmount,
      comment: comment,
      city: city,
      lat: window._lat || null,
      lng: window._lng || null,
      date: firebase.firestore.FieldValue.serverTimestamp(),
      userId: currentUser.uid,
      createdAt: new Date().toISOString()
    };
    
    await db.collection('expenses').add(expenseData);
    
    // Clear form
    amountInput.value = '';
    document.getElementById('comment').value = '';
    
    showToast('✅ Сохранено!', 'success');
  } catch (error) {
    console.error('Add expense error:', error);
    showToast('Ошибка: ' + error.message, 'error');
  }
}

// Delete expenseasync function deleteExpense(id) {
  if (!confirm('Удалить запись?')) return;
  
  try {
    await db.collection('expenses').doc(id).delete();
    showToast('Удалено', 'success');
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Ошибка удаления', 'error');
  }
}

// Render expenses
function renderExpenses() {
  const list = document.getElementById('list');
  if (!list) return;
  
  const filterCategory = document.getElementById('filterCategory')?.value || 'all';
  
  list.innerHTML = '';
  
  let totalEUR = 0;
  const categoryTotals = {};
  
  Object.keys(categories).forEach(cat => categoryTotals[cat] = 0);
  
  const filtered = filterCategory === 'all' 
    ? expenses 
    : expenses.filter(e => e.category === filterCategory);
  
  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Нет записей. Используйте голосовой ввод!</div>';
  }
  
  filtered.forEach(expense => {
    totalEUR += expense.eur || 0;
    categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + (expense.eur || 0);
    
    const div = document.createElement('div');
    div.className = `expense-item category-${expense.category}`;
    
    const date = expense.date?.toDate ? expense.date.toDate() : new Date(expense.createdAt);
    const dateStr = date.toLocaleString('ru-RU', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    
    const cat = categories[expense.category] || categories.other;
    const symbol = currencySymbols[expense.currency] || '';
        div.innerHTML = `
      <div class="expense-header">
        <div>
          <span class="expense-amount">${symbol}${expense.amount} ${expense.currency}</span>
          <span class="expense-eur">(€${expense.eur?.toFixed(2) || '0.00'})</span>
        </div>
        <span class="expense-category">${cat.icon} ${cat.label}</span>
      </div>
      ${expense.comment ? `<div class="expense-details">📝 ${expense.comment}</div>` : ''}
      ${expense.city ? `<div class="expense-details">📍 ${expense.city}</div>` : ''}
      <div class="expense-date">🕐 ${dateStr}</div>
      <button class="delete-btn" onclick="deleteExpense('${expense.id}')">🗑️ Удалить</button>
    `;
    
    list.appendChild(div);
  });
  
  // Update stats
  const totalEl = document.getElementById('totalEUR');
  const countEl = document.getElementById('totalCount');
  const catStatsEl = document.getElementById('categoryStats');
  
  if (totalEl) totalEl.textContent = `€${totalEUR.toFixed(2)}`;
  if (countEl) countEl.textContent = filtered.length;
  
  if (catStatsEl) {
    catStatsEl.innerHTML = '';
    Object.entries(categoryTotals).forEach(([cat, total]) => {
      if (total > 0) {
        const catInfo = categories[cat];
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = `
          <span>${catInfo.icon} ${catInfo.label}</span>
          <span style="color:var(--accent);font-weight:bold;">€${total.toFixed(2)}</span>
        `;
        catStatsEl.appendChild(div);
      }
    });
  }
}

// Export JSON
function exportData() {
  if (expenses.length === 0) {
    showToast('Нет данных', 'error');
    return;
  }
  
  const data = expenses.map(e => ({    amount: e.amount,
    currency: e.currency,
    eur: e.eur,
    category: e.category,
    comment: e.comment,
    city: e.city,
    date: e.date?.toDate ? e.date.toDate().toISOString() : e.createdAt
  }));
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travelcar-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('Экспортировано', 'success');
}

// Export CSV
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
    e.eur?.toFixed(2),
    categories[e.category]?.label || e.category,
    e.city || '',
    `"${(e.comment || '').replace(/"/g, '""')}"`
  ]);
  
  const csv = '\ufeff' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travelcar-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('CSV экспортирован', 'success');
}
// Toast
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Auth state
auth.onAuthStateChanged(user => {
  if (user) {
    console.log('✅ Authenticated:', user.uid);
    currentUser = user;
    showToast('Авторизация успешна', 'success');
    
    // Listen for expenses
    db.collection('expenses')
      .where('userId', '==', user.uid)
      .orderBy('date', 'desc')
      .onSnapshot(snapshot => {
        expenses = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('Loaded expenses:', expenses.length);
        renderExpenses();
        updateMap();
        
        const lastSync = document.getElementById('lastSync');
        if (lastSync) {
          lastSync.textContent = 'Обновлено: ' + new Date().toLocaleTimeString('ru-RU');
        }
      }, error => {
        console.error('Firestore error:', error);
        showToast('Ошибка синхронизации: ' + error.message, 'error');
      });
      
  } else {
    console.log('⏳ Signing in anonymously...');
    auth.signInAnonymously()
      .then(() => console.log('✅ Anonymous sign-in successful'))
      .catch(error => {
        console.error('❌ Anonymous auth failed:', error);
        showToast('Ошибка авторизации: ' + error.message, 'error');
      });  }
});

// Update map
function updateMap() {
  if (!map || !markersCluster) return;
  
  markersCluster.clearLayers();
  
  const points = [];
  
  expenses.forEach(expense => {
    if (expense.lat && expense.lng) {
      const cat = categories[expense.category] || categories.other;
      const symbol = currencySymbols[expense.currency] || '';
      
      const marker = L.marker([expense.lat, expense.lng]);
      
      const date = expense.date?.toDate ? expense.date.toDate() : new Date(expense.createdAt);
      
      marker.bindPopup(`
        <div style="min-width:150px;font-family:sans-serif;">
          <b style="font-size:1.1em;">${cat.icon} ${symbol}${expense.amount}</b><br>
          <span style="color:#22c55e;font-weight:bold;">€${expense.eur?.toFixed(2)}</span><br>
          ${expense.city ? `<div>📍 ${expense.city}</div>` : ''}
          ${expense.comment ? `<div style="margin:5px 0;">${expense.comment}</div>` : ''}
          <div style="margin-top:5px;font-size:0.85em;color:#666;">${date.toLocaleDateString('ru-RU')}</div>
        </div>
      `);
      
      markersCluster.addLayer(marker);
      points.push([expense.lat, expense.lng]);
    }
  });
  
  // Route line
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
  }}
