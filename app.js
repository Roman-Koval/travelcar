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
document.getElementById("exportCSV").addEventListener("click", exportCSV);
document.getElementById("exportJSON").addEventListener("click", exportJSON);
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
// 4. Reverse geocoding для расхода
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
// 3. Добавление расходов
// ===============================

async function addExpense(title, amount, category = "other") {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  let lat = null;
  let lon = null;
  let locationInfo = null;

  // Пытаемся получить координаты
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
    } catch (e) {
      // если не получилось — просто без локации
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
    countryCode: locationInfo?.countryCode || null
  };

  trip.expenses.push(exp);

  saveState();
  renderAll();
}
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
});

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

    const locationText = exp.location ? exp.location : "Место не определено";

    div.innerHTML = `
      <strong>${exp.title}</strong>
      <span>${exp.amount} ${trip.currency}</span>
      <small>${new Date(exp.date).toLocaleString()}</small>
      <small>${locationText}</small>
    `;

    div.addEventListener("click", () => openExpenseModal(exp, trip));

    container.appendChild(div);
  });
}


// ===============================
// 5. Главный рендер
// ===============================
// ===============================
// 8. Экспорт JSON
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
// 10. Экспорт PDF
// ===============================
document.getElementById("exportPDF").addEventListener("click", exportPDF);
async function exportPDF() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Заголовок
  doc.setFontSize(20);
  doc.text("TravelCar Report", 14, 20);

  // Название поездки
  doc.setFontSize(14);
  doc.text(`Trip: ${trip.name}`, 14, 35);

  // Валюта
  doc.text(`Currency: ${trip.currency}`, 14, 45);

  // Таблица расходов
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

  // Итог
  const total = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
  const finalY = doc.lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.text(`Total: ${total} ${trip.currency}`, 14, finalY);

  // Сохранение
  doc.save(`${trip.name.replace(/[^a-z0-9]/gi, "_")}.pdf`);
}
function renderAll() {
  renderTripSelector();
  renderExpenses();
}
// ===============================
// 9. Экспорт CSV
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
// ===============================
// 11. Share API
// ===============================

async function shareTrip() {
  if (!state.activeTrip) return;

  const trip = state.trips[state.activeTrip];

  // Текст для отправки
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

  // Проверяем поддержку Share API
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
document.getElementById("shareTrip").addEventListener("click", shareTrip);
// 6. Модалка расхода
// ===============================

const expenseModal = document.getElementById("expenseModal");
const closeModalBtn = document.getElementById("closeModal");

const modalTitle = document.getElementById("modalTitle");
const modalAmount = document.getElementById("modalAmount");
const modalCategory = document.getElementById("modalCategory");
const modalDate = document.getElementById("modalDate");
const modalLocation = document.getElementById("modalLocation");
const modalMap = document.getElementById("modalMap");

// ===============================
// 7. Генерация статической карты OSM
// ===============================

function getStaticMapURL(lat, lon, zoom = 14) {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=400x300&markers=${lat},${lon},red-pushpin`;
}

function openExpenseModal(exp, trip) {
  modalTitle.textContent = exp.title;
  modalAmount.textContent = `${exp.amount} ${trip.currency}`;
  modalCategory.textContent = exp.category;
  modalDate.textContent = new Date(exp.date).toLocaleString();
  modalLocation.textContent = exp.location || "Место не определено";

  // Пока просто заглушка под карту
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
// 6. Инициализация
// ===============================

if (Object.keys(state.trips).length === 0) {
  createTrip("Первая поездка", null);
} else {
  renderAll();
}
