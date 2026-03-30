// ===============================
// 1. Состояние и загрузка
// ===============================

let state = {
  trips: {},
  activeTrip: null
};

function saveState() {
  localStorage.setItem("travelcar_state", JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem("travelcar_state");
  if (saved) {
    state = JSON.parse(saved);
  }
}

loadState();
// ===============================
// 2. Страны, флаги, валюты
// ===============================

const COUNTRY_CONFIG = {
  IE: { name: "Ireland",  currency: "EUR", flag: "🇮🇪" },
  TR: { name: "Turkey",   currency: "TRY", flag: "🇹🇷" },
  PL: { name: "Poland",   currency: "PLN", flag: "🇵🇱" },
  UA: { name: "Ukraine",  currency: "UAH", flag: "🇺🇦" },
  GB: { name: "United Kingdom", currency: "GBP", flag: "🇬🇧" },
  US: { name: "USA",      currency: "USD", flag: "🇺🇸" },
  CH: { name: "Switzerland", currency: "CHF", flag: "🇨🇭" },
  DE: { name: "Germany",  currency: "EUR", flag: "🇩🇪" },
  ES: { name: "Spain",    currency: "EUR", flag: "🇪🇸" },
  FR: { name: "France",   currency: "EUR", flag: "🇫🇷" },
  IT: { name: "Italy",    currency: "EUR", flag: "🇮🇹" },
  NL: { name: "Netherlands", currency: "EUR", flag: "🇳🇱" },
  PT: { name: "Portugal", currency: "EUR", flag: "🇵🇹" },
  GR: { name: "Greece",   currency: "EUR", flag: "🇬🇷" },
  CY: { name: "Cyprus",   currency: "EUR", flag: "🇨🇾" }
  // при желании можно дополнять
};

// ===============================
// 3. Авто-определение страны
// ===============================

function detectCurrentCountry() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;

          const res = await fetch(url, {
            headers: { "Accept-Language": "en" }
          });
          const data = await res.json();

          const codeRaw =
            (data.address && (data.address.country_code || data.address.countryCode)) || "";
          const code = codeRaw.toUpperCase();

          const cfg = COUNTRY_CONFIG[code];
          if (!cfg) {
            resolve(null);
            return;
          }

          resolve({
            countryCode: code,
            name: cfg.name,
            currency: cfg.currency,
            flag: cfg.flag
          });
        } catch (e) {
          resolve(null);
        }
      },
      () => {
        resolve(null);
      }
    );
  });
}


// ===============================
// 2. Управление поездками
// ===============================

function createTrip(name = "Новая поездка", countryInfo = null) {
  const id = "trip_" + Date.now();

  const currency = countryInfo?.currency || "EUR";
  const displayName =
    name ||
    (countryInfo ? `${countryInfo.flag} ${countryInfo.name} Trip` : "Новая поездка");

  state.trips[id] = {
    id,
    name: displayName,
    currency,
    budget: 0,
    expenses: [],
    country: countryInfo?.name || null,
    countryCode: countryInfo?.countryCode || null,
    flag: countryInfo?.flag || null
  };

  state.activeTrip = id;
  saveState();
  renderTripSelector();
  renderAll();
}

function renderTripSelector() {
  const select = document.getElementById("tripSelect");
  select.innerHTML = "";

  Object.values(state.trips).forEach(trip => {
    const opt = document.createElement("option");
    opt.value = trip.id;
    opt.textContent = trip.name;
    if (trip.id === state.activeTrip) opt.selected = true;
    select.appendChild(opt);
  });
}

document.getElementById("tripSelect").addEventListener("change", (e) => {
  state.activeTrip = e.target.value;
  saveState();
  renderAll();
});

document.getElementById("newTripBtn").addEventListener("click", async () => {
  const info = await detectCurrentCountry();

  const suggestedName = info
    ? `${info.flag} ${info.name} Trip`
    : "Новая поездка";

  const name = prompt("Название поездки:", suggestedName);
  if (name) {
    createTrip(name, info || null);
  }
});


// ===============================
// 3. Добавление расходов
// ===============================

function addExpense(title, amount, category = "other") {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  trip.expenses.push({
    id: "exp_" + Date.now(),
    title,
    amount: parseFloat(amount),
    category,
    date: new Date().toISOString()
  });

  saveState();
  renderAll();
}


// ===============================
// 4. Рендер расходов
// ===============================

function renderExpenses() {
  const container = document.getElementById("expenseList");
  container.innerHTML = "";

  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  trip.expenses.forEach(exp => {
    const div = document.createElement("div");
    div.className = "expense-item";
    div.innerHTML = `
      <strong>${exp.title}</strong>
      <span>${exp.amount} ${trip.currency}</span>
      <small>${new Date(exp.date).toLocaleString()}</small>
    `;
    container.appendChild(div);
  });
}


// ===============================
// 5. Главный рендер
// ===============================

function renderAll() {
  renderTripSelector();
  renderExpenses();
}


// ===============================
// 6. Инициализация
// ===============================

if (Object.keys(state.trips).length === 0) {
  createTrip("Первая поездка", null);
} else {
  renderAll();
}
