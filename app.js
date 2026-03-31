// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Global variables
let expenses = [];
let map = null;
let markersCluster = null;
let routeLine = null;
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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  checkConnection();
  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));
});

// Initialize Map
function initMap() {
  map = L.map('map').setView([50, 10], 4);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);  
  markersCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 50
  });
  
  map.addLayer(markersCluster);
}

// Connection status
function checkConnection() {
  updateConnectionStatus(navigator.onLine);
}

function updateConnectionStatus(online) {
  const status = document.getElementById('connection-status');
  if (online) {
    status.textContent = '🟢 Online';
    status.className = 'status online';
  } else {
    status.textContent = '🔴 Offline';
    status.className = 'status offline';
  }
}

// Voice Recognition
function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showToast('Ваш браузер не поддерживает голосовой ввод. Используйте Chrome.', 'error');
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  const voiceBtn = document.getElementById('voiceBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  
  voiceBtn.classList.add('recording');
  voiceBtn.querySelector('.btn-text').textContent = 'Слушаю...';
  voiceStatus.textContent = 'Говорите сейчас...';
  
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;    voiceStatus.textContent = `Распознано: "${transcript}"`;
    
    const parsed = parseVoiceInput(transcript);
    
    if (parsed.amount) document.getElementById('amount').value = parsed.amount;
    if (parsed.currency) document.getElementById('currency').value = parsed.currency;
    if (parsed.category) document.getElementById('category').value = parsed.category;
    document.getElementById('comment').value = transcript;
    
    showToast('Данные распознаны! Получаю геолокацию...', 'success');
    await getGeo();
  };
  
  recognition.onerror = (event) => {
    console.error('Voice recognition error:', event.error);
    voiceStatus.textContent = 'Ошибка распознавания. Попробуйте ещё раз.';
    showToast('Ошибка распознавания речи', 'error');
  };
  
  recognition.onend = () => {
    voiceBtn.classList.remove('recording');
    voiceBtn.querySelector('.btn-text').textContent = 'Голосовой ввод';
    setTimeout(() => {
      voiceStatus.textContent = '';
    }, 3000);
  };
  
  recognition.start();
}

// Parse voice input
function parseVoiceInput(text) {
  const lower = text.toLowerCase();
  
  // Parse amount - find numbers with optional decimals
  const amountMatch = lower.match(/(\d+[.,]?\d*)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
  
  // Parse currency
  let currency = 'EUR';
  if (/лир|турецк|try/i.test(lower)) currency = 'TRY';
  else if (/доллар|дол|usd/i.test(lower)) currency = 'USD';
  else if (/фунт|gbp/i.test(lower)) currency = 'GBP';
  else if (/франк|chf/i.test(lower)) currency = 'CHF';
  else if (/злот|pln/i.test(lower)) currency = 'PLN';
  else if (/крон|czk|чешск/i.test(lower)) currency = 'CZK';
  else if (/рубль|rub|российск/i.test(lower)) currency = 'RUB';
  
  // Parse category
  let category = 'other';  if (/еда|обед|ужин|завтрак|кофе|ресторан|кафе|перекус|food|eat/i.test(lower)) {
    category = 'food';
  } else if (/бензин|топливо|заправ|газ|fuel|petrol|gas/i.test(lower)) {
    category = 'fuel';
  } else if (/отель|гостиниц|жильё|ночлег|hotel|stay|accommodation/i.test(lower)) {
    category = 'hotel';
  } else if (/транспорт|метро|автобус|такси|transport|taxi|metro/i.test(lower)) {
    category = 'transport';
  } else if (/покупк|шопинг|shopping|buy/i.test(lower)) {
    category = 'shopping';
  } else if (/развлеч|кино|театр|билет|entertainment|ticket/i.test(lower)) {
    category = 'entertainment';
  }
  
  return { amount, currency, category };
}

// Geolocation
async function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      document.getElementById('location').value = 'Геолокация не поддерживается';
      resolve();
      return;
    }
    
    showToast('Определение местоположения...', 'success');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        
        if (geoCache.has(key)) {
          window._lat = lat;
          window._lng = lng;
          document.getElementById('location').value = geoCache.get(key);
          resolve();
          return;
        }
        
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=10&accept-language=ru`,
            {
              headers: {
                'Accept-Language': 'ru'
              }
            }
          );          
          if (!response.ok) throw new Error('Nominatim error');
          
          const data = await response.json();
          const city = data.address?.city || 
                      data.address?.town || 
                      data.address?.village || 
                      data.address?.state_district || 
                      data.address?.county ||
                      'Неизвестно';
          
          geoCache.set(key, city);
          window._lat = lat;
          window._lng = lng;
          document.getElementById('location').value = city;
          
          // Respect Nominatim rate limit
          await new Promise(r => setTimeout(r, 1100));
          showToast(`Местоположение: ${city}`, 'success');
          resolve();
        } catch (error) {
          console.warn('Geocoding failed:', error);
          window._lat = lat;
          window._lng = lng;
          document.getElementById('location').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          resolve();
        }
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        document.getElementById('location').value = 'Не удалось определить';
        showToast('Не удалось определить местоположение', 'error');
        resolve();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// Currency conversion
async function convertToEUR(amount, currency) {
  if (currency === 'EUR') return amount;
  if (!amount) return 0;
  
  const now = Date.now();
  
  // Use cache if fresh (< 1 hour)
  if (ratesCache.data && (now - ratesCache.timestamp) < 3600000) {
    const rate = ratesCache.data[currency];
    return rate ? amount / rate : amount;  }
  
  try {
    // Try Frankfurter API (ECB rates, free, no key required)
    const response = await fetch('https://api.frankfurter.dev/latest');
    if (!response.ok) throw new Error('Frankfurter failed');
    
    const data = await response.json();
    ratesCache = { timestamp: now, data: data.rates };
    
    const rate = data.rates[currency];
    return rate ? amount / rate : amount;
  } catch (error) {
    console.warn('Frankfurter failed, trying fallback:', error);
    
    try {
      // Fallback to exchangerate.host
      const response = await fetch(`https://api.exchangerate.host/latest?base=EUR&symbols=${currency}`);
      const data = await response.json();
      const rate = data.rates?.[currency];
      return rate ? amount / rate : amount;
    } catch (e) {
      console.error('All currency APIs failed:', e);
      return amount; // Return original if all fail
    }
  }
}

// Add expense
async function addExpense() {
  const amount = parseFloat(document.getElementById('amount').value);
  const currency = document.getElementById('currency').value;
  const category = document.getElementById('category').value;
  const comment = document.getElementById('comment').value.trim();
  const city = document.getElementById('location').value;
  
  if (!amount || amount <= 0) {
    showToast('Введите корректную сумму', 'error');
    return;
  }
  
  const user = auth.currentUser;
  if (!user) {
    showToast('Ошибка авторизации', 'error');
    return;
  }
  
  showToast('Сохранение...', 'success');
  
  try {    const eurAmount = await convertToEUR(amount, currency);
    
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
      userId: user.uid,
      createdAt: new Date().toISOString()
    };
    
    await db.collection('expenses').add(expenseData);
    
    // Clear form
    document.getElementById('amount').value = '';
    document.getElementById('comment').value = '';
    
    showToast('Расход сохранён!', 'success');
  } catch (error) {
    console.error('Error adding expense:', error);
    showToast('Ошибка сохранения: ' + error.message, 'error');
  }
}

// Delete expense
async function deleteExpense(id) {
  if (!confirm('Удалить эту запись?')) return;
  
  try {
    await db.collection('expenses').doc(id).delete();
    showToast('Запись удалена', 'success');
  } catch (error) {
    console.error('Error deleting:', error);
    showToast('Ошибка удаления', 'error');
  }
}

// Render expenses
function renderExpenses() {
  const list = document.getElementById('list');
  const filterCategory = document.getElementById('filterCategory').value;
  
  list.innerHTML = '';
  
  let totalEUR = 0;  const categoryTotals = {};
  
  // Initialize category totals
  Object.keys(categories).forEach(cat => categoryTotals[cat] = 0);
  
  const filteredExpenses = filterCategory === 'all' 
    ? expenses 
    : expenses.filter(e => e.category === filterCategory);
  
  filteredExpenses.forEach(expense => {
    totalEUR += expense.eur || 0;
    categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + (expense.eur || 0);
    
    const div = document.createElement('div');
    div.className = `expense-item category-${expense.category}`;
    
    const date = expense.date?.toDate ? expense.date.toDate() : new Date(expense.createdAt);
    const dateStr = date.toLocaleString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const cat = categories[expense.category] || categories.other;
    
    div.innerHTML = `
      <div class="expense-header">
        <div>
          <span class="expense-amount">${expense.amount} ${expense.currency}</span>
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
  document.getElementById('totalEUR').textContent = `€${totalEUR.toFixed(2)}`;
  document.getElementById('totalCount').textContent = filteredExpenses.length;
  
  // Category stats
  const catStatsDiv = document.getElementById('categoryStats');  catStatsDiv.innerHTML = '';
  
  Object.entries(categoryTotals).forEach(([cat, total]) => {
    if (total > 0) {
      const catInfo = categories[cat];
      const div = document.createElement('div');
      div.className = 'stat-item';
      div.innerHTML = `
        <span class="stat-label">${catInfo.icon} ${catInfo.label}</span>
        <span class="stat-value">€${total.toFixed(2)}</span>
      `;
      catStatsDiv.appendChild(div);
    }
  });
}

// Export to JSON
function exportData() {
  if (expenses.length === 0) {
    showToast('Нет данных для экспорта', 'error');
    return;
  }
  
  const exportData = expenses.map(e => ({
    amount: e.amount,
    currency: e.currency,
    eur: e.eur,
    category: e.category,
    comment: e.comment,
    city: e.city,
    date: e.date?.toDate ? e.date.toDate().toISOString() : e.createdAt
  }));
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travelcar-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('Данные экспортированы', 'success');
}

// Export to CSV
function exportCSV() {
  if (expenses.length === 0) {
    showToast('Нет данных для экспорта', 'error');    return;
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
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travelcar-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('CSV экспортирован', 'success');
}

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Auth state observer
auth.onAuthStateChanged(user => {
  if (user) {
    console.log('User signed in:', user.uid);
    
    // Listen for expenses
    db.collection('expenses')
      .where('userId', '==', user.uid)
      .orderBy('date', 'desc')
      .onSnapshot(snapshot => {        expenses = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        renderExpenses();
        updateMap();
        document.getElementById('lastSync').textContent = 
          'Обновлено: ' + new Date().toLocaleTimeString('ru-RU');
      }, error => {
        console.error('Firestore error:', error);
        showToast('Ошибка синхронизации', 'error');
      });
      
  } else {
    // Anonymous sign-in
    auth.signInAnonymously().catch(error => {
      console.error('Anonymous auth failed:', error);
      showToast('Ошибка авторизации', 'error');
    });
  }
});

// Update map with markers and route
function updateMap() {
  if (!map || !markersCluster) return;
  
  markersCluster.clearLayers();
  
  const points = [];
  
  expenses.forEach(expense => {
    if (expense.lat && expense.lng) {
      const cat = categories[expense.category] || categories.other;
      
      const marker = L.marker([expense.lat, expense.lng]);
      
      const date = expense.date?.toDate ? expense.date.toDate() : new Date(expense.createdAt);
      const dateStr = date.toLocaleDateString('ru-RU');
      
      marker.bindPopup(`
        <div style="min-width: 150px;">
          <b>${cat.icon} ${expense.amount} ${expense.currency}</b><br>
          <span style="color: #22c55e;">€${expense.eur?.toFixed(2)}</span><br>
          ${expense.city ? `<div>📍 ${expense.city}</div>` : ''}
          ${expense.comment ? `<div>📝 ${expense.comment}</div>` : ''}
          <div style="margin-top: 5px; font-size: 0.85em; color: #666;">🕐 ${dateStr}</div>
        </div>
      `);
            markersCluster.addLayer(marker);
      points.push([expense.lat, expense.lng]);
    }
  });
  
  // Draw route line
  if (routeLine) {
    map.removeLayer(routeLine);
  }
  
  if (points.length >= 2) {
    routeLine = L.polyline(points, {
      color: '#22c55e',
      weight: 3,
      opacity: 0.7,
      dashArray: '10, 10'
    }).addTo(map);
    
    // Fit bounds to show all points
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
  } else if (points.length === 1) {
    map.setView(points[0], 13);
  }
}
