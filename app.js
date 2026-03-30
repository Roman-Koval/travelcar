// ===============================
// 1. Состояние и загрузка
// ===============================

let state = {
  trips: {},
  activeTrip: null,
  baseCurrency: "EUR" // для конвертации
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
// 2. Тема (Dark / Light)
// ===============================

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

function detectSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

let savedTheme = localStorage.getItem("theme");
if (!savedTheme) {
  savedTheme = detectSystemTheme();
}
applyTheme(savedTheme);

// ===============================
// 3. Страны, флаги, валюты
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
};

// ===============================
// 4. Иконки категорий
// ===============================

const CATEGORY_ICONS = {
  fuel: "⛽",
  food: "🍔",
  hotel: "🏨",
  toll: "🛣️",
  parking: "🅿️",
  other: "📦"
};

// ===============================
// 5. Курсы валют (упрощённо)
// ===============================

const RATES_TO_EUR = {
  EUR: 1,
  USD: 0.93,
  GBP: 1.16,
  TRY: 0.03,
  PLN: 0.23,
  UAH: 0.025,
  CHF: 1.02
};

function convertToBase(amount, currency) {
  const rate = RATES_TO_EUR[currency] || 1;
  return amount * rate;
}

// ===============================
// 6. Авто-определение страны
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
// 7. Reverse geocoding для расхода
// ===============================

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "en" }
    });
    const data = await res.json();

    const city =
      data.address.city ||
      data.address.town ||
      data.address.village ||
      data.address.hamlet ||
      "";
    const country = data.address.country || "";
    const countryCode =
      (data.address.country_code || data.address.countryCode || "").toUpperCase();

    return {
      city,
      country,
      countryCode
    };
  } catch (e) {
    return null;
  }
}

// ===============================
// 8. Статическая карта OSM
// ===============================

function getStaticMapURL(lat, lon, zoom = 14) {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=400x300&markers=${lat},${lon},red-pushpin`;
}

// ===============================
// 9. Управление поездками
// ===============================

function createTrip(name = "Новая поездка", countryInfo = null) {
  const id = "trip_" + Date.now();

  const currency = countryInfo?.currency || "EUR";
  const displayName =
    name ||
    (countryInfo ? `${countryInfo.name} Trip` : "Новая поездка");

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

    const flag = trip.flag ? trip.flag + " " : "";
    const currency = trip.currency ? ` (${trip.currency})` : "";

    opt.textContent = `${flag}${trip.name}${currency}`;

    if (trip.id === state.activeTrip) opt.selected = true;
    select.appendChild(opt);
  });
}

// ===============================
// 10. Добавление расходов (с фото)
// ===============================

async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addExpense(title, amount, category = "other") {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  let lat = null;
  let lon = null;
  let locationInfo = null;

  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000
        });
      });

      lat = pos.coords.latitude;
      lon = pos.coords.longitude;

      locationInfo = await reverseGeocode(lat, lon);
    } catch (e) {}
  }

  let photoData = null;
  const photoInput = document.getElementById("expPhoto");
  if (photoInput.files && photoInput.files[0]) {
    try {
      photoData = await readFileAsDataURL(photoInput.files[0]);
    } catch (e) {
      photoData = null;
    }
  }

  const exp = {
    id: "exp_" + Date.now(),
    title,
    amount: parseFloat(amount),
    category,
    date: new Date().toISOString(),
    lat,
    lon,
    location: locationInfo
      ? `${locationInfo.city || ""}${locationInfo.city ? ", " : ""}${locationInfo.country || ""}`
      : null,
    countryCode: locationInfo?.countryCode || null,
    photo: photoData
  };

  trip.expenses.push(exp);

  saveState();
  renderAll();
  checkBudgetNotification(trip);
}

// ===============================
// 11. Рендер расходов
// ===============================

function renderExpenses() {
  const container = document.getElementById("expenseList");
  container.innerHTML = "";

  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  trip.expenses.forEach(exp => {
    const div = document.createElement("div");
    div.className = "expense-item";

    const locationText = exp.location ? exp.location : "Место не определено";
    const icon = CATEGORY_ICONS[exp.category] || "📦";

    div.innerHTML = `
      <div class="exp-row">
        <div class="exp-left">
          <div class="exp-icon">${icon}</div>
          <div class="exp-info">
            <div class="exp-title">${exp.title}</div>
            <div class="exp-location">${locationText}</div>
          </div>
        </div>

        <div class="exp-right">
          <div class="exp-amount">${exp.amount} ${trip.currency}</div>
          <div class="exp-date">${new Date(exp.date).toLocaleString()}</div>
        </div>
      </div>
    `;

    div.addEventListener("click", () => openExpenseModal(exp, trip));

    container.appendChild(div);
  });
}

// ===============================
// 12. Модалка расхода
// ===============================

const expenseModal = document.getElementById("expenseModal");
const closeModalBtn = document.getElementById("closeModal");

const modalTitle = document.getElementById("modalTitle");
const modalAmount = document.getElementById("modalAmount");
const modalCategory = document.getElementById("modalCategory");
const modalDate = document.getElementById("modalDate");
const modalLocation = document.getElementById("modalLocation");
const modalMap = document.getElementById("modalMap");
const modalPhoto = document.getElementById("modalPhoto");
const modalPhotoWrapper = document.getElementById("modalPhotoWrapper");

function openExpenseModal(exp, trip) {
  modalTitle.textContent = `${CATEGORY_ICONS[exp.category] || "📦"}  ${exp.title}`;
  modalAmount.textContent = `${exp.amount} ${trip.currency}`;
  modalCategory.textContent = exp.category.toUpperCase();
  modalDate.textContent = new Date(exp.date).toLocaleString();
  modalLocation.textContent = exp.location || "Место не определено";

  if (exp.photo) {
    modalPhotoWrapper.style.display = "block";
    modalPhoto.src = exp.photo;
  } else {
    modalPhotoWrapper.style.display = "none";
  }

  modalMap.innerHTML = "";

  if (exp.lat && exp.lon) {
    const img = document.createElement("img");
    img.src = getStaticMapURL(exp.lat, exp.lon);
    img.alt = "Map";
    img.style.width = "100%";
    img.style.borderRadius = "10px";
    modalMap.appendChild(img);
  } else {
    modalMap.textContent = "Координаты не сохранены";
  }

  expenseModal.classList.remove("hidden");
}

closeModalBtn.addEventListener("click", () => {
  expenseModal.classList.add("hidden");
});

expenseModal.addEventListener("click", (e) => {
  if (e.target === expenseModal) {
    expenseModal.classList.add("hidden");
  }
});

// ===============================
// 13. Экспорт JSON
// ===============================

function exportJSON() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];
  const dataStr = JSON.stringify(trip, null, 2);

  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.name.replace(/[^a-z0-9]/gi, "_")}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// ===============================
// 14. Экспорт CSV
// ===============================

function exportCSV() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];
  const rows = [
    ["Title", "Amount", "Currency", "Category", "Date", "Location", "Lat", "Lon"]
  ];

  trip.expenses.forEach(exp => {
    rows.push([
      exp.title,
      exp.amount,
      trip.currency,
      exp.category,
      exp.date,
      exp.location || "",
      exp.lat || "",
      exp.lon || ""
    ]);
  });

  const csvContent = rows.map(r => r.join(",")).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.name.replace(/[^a-z0-9]/gi, "_")}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

// ===============================
// 15. Экспорт PDF
// ===============================

async function exportPDF() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text("TravelCar Report", 14, 20);

  doc.setFontSize(14);
  doc.text(`Trip: ${trip.name}`, 14, 35);
  doc.text(`Currency: ${trip.currency}`, 14, 45);

  const tableData = trip.expenses.map(exp => [
    exp.title,
    exp.amount + " " + trip.currency,
    exp.category,
    new Date(exp.date).toLocaleString(),
    exp.location || "",
  ]);

  doc.autoTable({
    head: [["Title", "Amount", "Category", "Date", "Location"]],
    body: tableData,
    startY: 55,
    styles: { fontSize: 10 }
  });

  const total = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
  const finalY = doc.lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.text(`Total: ${total} ${trip.currency}`, 14, finalY);

  doc.save(`${trip.name.replace(/[^a-z0-9]/gi, "_")}.pdf`);
}

// ===============================
// 16. Share API
// ===============================

async function shareTrip() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  let text = `🚗 TravelCar Trip: ${trip.name}\n`;
  text += `Валюта: ${trip.currency}\n`;
  text += `Всего расходов: ${trip.expenses.length}\n\n`;

  let total = 0;

  trip.expenses.forEach(exp => {
    total += exp.amount;
    text += `• ${exp.title} — ${exp.amount} ${trip.currency}\n`;
    if (exp.location) text += `  📍 ${exp.location}\n`;
  });

  text += `\nИтого: ${total} ${trip.currency}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "TravelCar Trip",
        text
      });
    } catch (e) {
      console.log("Share canceled");
    }
  } else {
    alert("Ваш браузер не поддерживает Share API");
  }
}

// ===============================
// 17. Аналитика (Chart.js)
// ===============================

let categoryChart = null;
let dailyChart = null;

function buildAnalytics() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];
  const expenses = trip.expenses;

  const byCategory = {};
  const byDay = {};

  expenses.forEach(exp => {
    const cat = exp.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + exp.amount;

    const day = new Date(exp.date).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + exp.amount;
  });

  const catLabels = Object.keys(byCategory);
  const catData = catLabels.map(k => byCategory[k]);

  const dayLabels = Object.keys(byDay).sort();
  const dayData = dayLabels.map(k => byDay[k]);

  const catCtx = document.getElementById("categoryChart").getContext("2d");
  const dayCtx = document.getElementById("dailyChart").getContext("2d");

  if (categoryChart) categoryChart.destroy();
  if (dailyChart) dailyChart.destroy();

  categoryChart = new Chart(catCtx, {
    type: "doughnut",
    data: {
      labels: catLabels,
      datasets: [{
        data: catData,
        backgroundColor: ["#4a90e2","#27ae60","#e67e22","#9b59b6","#f1c40f","#95a5a6"]
      }]
    },
    options: {
      plugins: { legend: { position: "bottom" } }
    }
  });

  dailyChart = new Chart(dayCtx, {
    type: "line",
    data: {
      labels: dayLabels,
      datasets: [{
        label: "Расходы по дням",
        data: dayData,
        borderColor: "#4a90e2",
        fill: false,
        tension: 0.2
      }]
    },
    options: {
      scales: {
        x: { ticks: { maxRotation: 45, minRotation: 0 } }
      }
    }
  });

  const baseSummary = document.getElementById("baseCurrencySummary");
  const totalBase = expenses.reduce(
    (sum, e) => sum + convertToBase(e.amount, trip.currency),
    0
  );
  baseSummary.textContent = `Итого в базовой валюте (EUR): ${totalBase.toFixed(2)} €`;
}

// ===============================
// 18. Интерактивная карта (Leaflet)
// ===============================

let mapInstance = null;
let mapMarkers = [];

function buildMap() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];
  const expenses = trip.expenses.filter(e => e.lat && e.lon);

  const mapContainer = document.getElementById("tripMap");
  if (!mapContainer) return;

  if (!mapInstance) {
    mapInstance = L.map("tripMap");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(mapInstance);
  }

  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];

  if (expenses.length === 0) {
    mapInstance.setView([51.5, -0.09], 3);
    return;
  }

  const bounds = [];

  expenses.forEach(exp => {
    const marker = L.marker([exp.lat, exp.lon]).addTo(mapInstance);
    marker.bindPopup(`${exp.title}<br>${exp.amount} ${trip.currency}`);
    mapMarkers.push(marker);
    bounds.push([exp.lat, exp.lon]);
  });

  mapInstance.fitBounds(bounds, { padding: [20,20] });
}

// ===============================
// 19. Бюджет + уведомления
// ===============================

function checkBudgetNotification(trip) {
  if (!trip.budget || !("Notification" in window)) return;

  const total = trip.expenses.reduce((s, e) => s + e.amount, 0);
  if (total < trip.budget) return;

  if (Notification.permission === "granted") {
    new Notification("TravelCar", {
      body: `Бюджет превышен: ${total} / ${trip.budget} ${trip.currency}`
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(p => {
      if (p === "granted") {
        new Notification("TravelCar", {
          body: `Бюджет превышен: ${total} / ${trip.budget} ${trip.currency}`
        });
      }
    });
  }
}

// ===============================
// 20. Бэкап всех данных
// ===============================

function exportAllData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `travelcar_backup.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function importAllData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      state = imported;
      saveState();
      renderAll();
    } catch (err) {
      alert("Ошибка импорта");
    }
  };
  reader.readAsText(file);
}

// ===============================
// 21. Голосовой ввод
// ===============================

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Голосовой ввод не поддерживается");
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = "ru-RU";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const titleInput = document.getElementById("expTitle");
    const amountInput = document.getElementById("expAmount");

    const match = text.match(/(\d+([\.,]\d+)?)/);
    if (match) {
      amountInput.value = match[1].replace(",", ".");
      titleInput.value = text.replace(match[0], "").trim();
    } else {
      titleInput.value = text;
    }
  };

  rec.start();
}

// ===============================
// 22. Главный рендер
// ===============================

function renderAll() {
  renderTripSelector();
  renderExpenses();
  buildAnalytics();
  buildMap();

  if (state.activeTrip) {
    const trip = state.trips[state.activeTrip];
    const budgetInput = document.getElementById("tripBudget");
    budgetInput.value = trip.budget || "";
  }
}

// ===============================
// 23. Обработчики
// ===============================

document.getElementById("tripSelect").addEventListener("change", (e) => {
  state.activeTrip = e.target.value;
  saveState();
  renderAll();
});

document.getElementById("newTripBtn").addEventListener("click", async () => {
  const info = await detectCurrentCountry();

  const suggestedName = info
    ? `${info.name} Trip`
    : "Новая поездка";

  const name = prompt("Название поездки:", suggestedName);
  if (name) {
    createTrip(name, info || null);
  }
});

const titleInput = document.getElementById("expTitle");
const amountInput = document.getElementById("expAmount");
const categorySelect = document.getElementById("expCategory");
const addBtn = document.getElementById("addExpenseBtn");

addBtn.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  const amount = amountInput.value.trim();
  const category = categorySelect.value;

  if (!title || !amount) {
    alert("Введите название и сумму");
    return;
  }

  await addExpense(title, amount, category);

  titleInput.value = "";
  amountInput.value = "";
  document.getElementById("expPhoto").value = "";
});

document.getElementById("exportCSV").addEventListener("click", exportCSV);
document.getElementById("exportJSON").addEventListener("click", exportJSON);
document.getElementById("exportPDF").addEventListener("click", exportPDF);
document.getElementById("shareTrip").addEventListener("click", shareTrip);

document.getElementById("toggleTheme").addEventListener("click", () => {
  const current = document.body.classList.contains("dark") ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
});

document.getElementById("saveBudgetBtn").addEventListener("click", () => {
  if (!state.activeTrip) return;
  const trip = state.trips[state.activeTrip];
  const val = parseFloat(document.getElementById("tripBudget").value);
  trip.budget = isNaN(val) ? 0 : val;
  saveState();
  checkBudgetNotification(trip);
});

document.getElementById("exportAllBtn").addEventListener("click", exportAllData);
document.getElementById("importAllInput").addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    importAllData(e.target.files[0]);
  }
});

document.getElementById("voiceInputBtn").addEventListener("click", startVoiceInput);

// ===============================
// 24. Инициализация
// ===============================

if (Object.keys(state.trips).length === 0) {
  createTrip("Первая поездка", null);
} else {
  renderAll();
}
