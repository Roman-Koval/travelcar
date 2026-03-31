const btn = document.getElementById('voiceBtn');
const list = document.getElementById('list');

let expenses = JSON.parse(localStorage.getItem('expenses') || '[]');

const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

render();

btn.onclick = () => startVoice();

function startVoice() {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'ru-RU';

  recognition.onresult = async (e) => {
    const text = e.results[0][0].transcript;
    console.log(text);

    const parsed = parseExpense(text);

    const eur = await convertToEUR(parsed.amount, parsed.currency);

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const city = await getCity(lat, lng);

      const expense = {
        ...parsed,
        eur,
        lat,
        lng,
        city,
        date: new Date().toISOString()
      };

      expenses.push(expense);
      localStorage.setItem('expenses', JSON.stringify(expenses));

      render();
    });
  };

  recognition.start();
}

function parseExpense(text) {
  const amountMatch = text.match(/\d+([.,]\d+)?/);
  const currencyMatch = text.match(/(евро|доллар|бат|руб)/i);

  const amount = amountMatch ? parseFloat(amountMatch[0]) : 0;
  const currency = currencyMatch ? currencyMatch[0].toLowerCase() : 'евро';

  const category = detectCategory(text);

  return { amount, currency, category, text };
}

function detectCategory(text) {
  if (/кофе|еда|ресторан/i.test(text)) return '🍔 еда';
  if (/бензин|топливо/i.test(text)) return '⛽ топливо';
  if (/отель|жилье/i.test(text)) return '🏨 жильё';
  return '📦 прочее';
}

async function convertToEUR(amount, currency) {
  const rates = {
    евро: 1,
    доллар: 0.92,
    бат: 0.026,
    руб: 0.01
  };

  return amount * (rates[currency] || 1);
}

async function getCity(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await res.json();
    return data.address.city || data.address.town || data.address.village || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function render() {
  list.innerHTML = '';

  const points = [];

  expenses.forEach(e => {
    const li = document.createElement('li');
    li.textContent = `${e.category} | ${e.amount} ${e.currency} (€${e.eur.toFixed(2)}) | ${e.city}`;
    list.appendChild(li);

    if (e.lat && e.lng) {
      points.push([e.lat, e.lng]);
      L.marker([e.lat, e.lng]).addTo(map);
    }
  });

  if (points.length > 1) {
    L.polyline(points).addTo(map);
    map.fitBounds(points);
  }
}
