// ===== Константы и состояние =====
const STORAGE_KEY = "travelcar_state_v1";
const DEFAULT_CURRENCY = "RUB";

const CATEGORY_LABELS = {
  fuel: "⛽ Топливо",
  food: "🍽️ Еда",
  accommodation: "🏠 Жильё",
  toll: "🛣️ Платные дороги",
  repair: "🛠️ Ремонт",
  fun: "🎭 Развлечения",
  other: "📦 Другое",
};

let state = {
  trips: [],
  selectedTripId: null,
  theme: "light",
};

// ===== Утилиты =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state = {
        trips: Array.isArray(parsed.trips) ? parsed.trips : [],
        selectedTripId: parsed.selectedTripId || null,
        theme: parsed.theme === "dark" ? "dark" : "light",
      };
    }
  } catch (e) {
    console.error("Ошибка загрузки состояния", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Ошибка сохранения состояния", e);
  }
}

function getSelectedTrip() {
  return state.trips.find((t) => t.id === state.selectedTripId) || null;
}

function formatAmount(amount, currency) {
  const value = Number(amount) || 0;
  return `${value.toFixed(2)} ${currency || DEFAULT_CURRENCY}`;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 1;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ===== DOM =====
const tripSelect = document.getElementById("tripSelect");
const newTripBtn = document.getElementById("newTripBtn");

const tripNameLabel = document.getElementById("tripNameLabel");
const tripDatesLabel = document.getElementById("tripDatesLabel");
const tripLocationLabel = document.getElementById("tripLocationLabel");
const tripBudgetLabel = document.getElementById("tripBudgetLabel");

const expenseForm = document.getElementById("expenseForm");
const expenseAmount = document.getElementById("expenseAmount");
const expenseCurrency = document.getElementById("expenseCurrency");
const expenseCategory = document.getElementById("expenseCategory");
const expenseDate = document.getElementById("expenseDate");
const expenseNote = document.getElementById("expenseNote");
const expenseLocation = document.getElementById("expenseLocation");

const filterCategory = document.getElementById("filterCategory");
const filterSort = document.getElementById("filterSort");
const expensesList = document.getElementById("expensesList");
const expensesEmpty = document.getElementById("expensesEmpty");

const statTotal = document.getElementById("statTotal");
const statPerDay = document.getElementById("statPerDay");
const statCount = document.getElementById("statCount");
const statTopCategory = document.getElementById("statTopCategory");

const exportJsonBtn = document.getElementById("exportJsonBtn");
const importJsonBtn = document.getElementById("importJsonBtn");
const importFileInput = document.getElementById("importFileInput");
const exportArea = document.getElementById("exportArea");

const themeToggle = document.getElementById("themeToggle");
const versionLabel = document.getElementById("versionLabel");

// ===== Тема =====
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  saveState();
}

// ===== Отрисовка поездок =====
function renderTrips() {
  tripSelect.innerHTML = "";

  if (state.trips.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет поездок";
    tripSelect.appendChild(opt);
    tripSelect.disabled = true;
    state.selectedTripId = null;
    renderTripMeta(null);
    renderExpenses();
    renderAnalytics();
    return;
  }

  tripSelect.disabled = false;

  state.trips.forEach((trip) => {
    const opt = document.createElement("option");
    opt.value = trip.id;
    opt.textContent = trip.name || "Без названия";
    tripSelect.appendChild(opt);
  });

  if (!state.selectedTripId || !getSelectedTrip()) {
    state.selectedTripId = state.trips[0].id;
  }

  tripSelect.value = state.selectedTripId;
  renderTripMeta(getSelectedTrip());
  renderExpenses();
  renderAnalytics();
}

function renderTripMeta(trip) {
  if (!trip) {
    tripNameLabel.textContent = "—";
    tripDatesLabel.textContent = "—";
    tripLocationLabel.textContent = "—";
    tripBudgetLabel.textContent = "—";
    return;
  }

  tripNameLabel.textContent = trip.name || "Без названия";

  const start = trip.startDate || "";
  const end = trip.endDate || "";
  tripDatesLabel.textContent = start || end ? `${start || "?"} — ${end || "?"}` : "—";

  tripLocationLabel.textContent = trip.location || "—";
  tripBudgetLabel.textContent = trip.budget
    ? formatAmount(trip.budget, trip.currency)
    : "—";
}

// ===== Отрисовка расходов =====
function renderExpenses() {
  const trip = getSelectedTrip();
  expensesList.innerHTML = "";

  if (!trip || !Array.isArray(trip.expenses) || trip.expenses.length === 0) {
    expensesEmpty.style.display = "block";
    return;
  }

  let items = [...trip.expenses];

  const cat = filterCategory.value;
  if (cat !== "all") {
    items = items.filter((e) => e.category === cat);
  }

  const sort = filterSort.value;
  items.sort((a, b) => {
    if (sort === "date_desc") {
      return (b.date || "").localeCompare(a.date || "");
    }
    if (sort === "date_asc") {
      return (a.date || "").localeCompare(b.date || "");
    }
    if (sort === "amount_desc") {
      return (b.amount || 0) - (a.amount || 0);
    }
    if (sort === "amount_asc") {
      return (a.amount || 0) - (b.amount || 0);
    }
    return 0;
  });

  if (items.length === 0) {
    expensesEmpty.style.display = "block";
    return;
  }

  expensesEmpty.style.display = "none";

  items.forEach((exp) => {
    const li = document.createElement("li");
    li.className = "expense-item";

    const topRow = document.createElement("div");
    topRow.className = "expense-top";

    const left = document.createElement("div");
    left.className = "expense-main";

    const catLabel = CATEGORY_LABELS[exp.category] || "Категория";
    const title = document.createElement("div");
    title.className = "expense-title";
    title.textContent = catLabel;

    const note = document.createElement("div");
    note.className = "expense-note";
    note.textContent = exp.note || "";

    left.appendChild(title);
    if (exp.note) left.appendChild(note);

    const right = document.createElement("div");
    right.className = "expense-amount";
    right.textContent = formatAmount(exp.amount, trip.currency);

    topRow.appendChild(left);
    topRow.appendChild(right);

    const bottomRow = document.createElement("div");
    bottomRow.className = "expense-bottom";

    const dateSpan = document.createElement("span");
    dateSpan.textContent = exp.date || "";

    const locSpan = document.createElement("span");
    locSpan.textContent = exp.location || "";

    bottomRow.appendChild(dateSpan);
    if (exp.location) bottomRow.appendChild(locSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-button danger";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Удалить расход";
    deleteBtn.addEventListener("click", () => {
      deleteExpense(exp.id);
    });

    li.appendChild(topRow);
    li.appendChild(bottomRow);
    li.appendChild(deleteBtn);

    expensesList.appendChild(li);
  });
}

// ===== Аналитика =====
function renderAnalytics() {
  const trip = getSelectedTrip();
  if (!trip || !Array.isArray(trip.expenses) || trip.expenses.length === 0) {
    statTotal.textContent = "0";
    statPerDay.textContent = "0";
    statCount.textContent = "0";
    statTopCategory.textContent = "—";
    return;
  }

  const total = trip.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  statTotal.textContent = formatAmount(total, trip.currency);

  const start = parseDate(trip.startDate);
  const lastExpenseDate = trip.expenses
    .map((e) => parseDate(e.date))
    .filter(Boolean)
    .sort((a, b) => a - b)
    .pop();
  const end = parseDate(trip.endDate) || lastExpenseDate || start;
  const days = daysBetween(start, end);
  const perDay = days > 0 ? total / days : total;
  statPerDay.textContent = formatAmount(perDay, trip.currency);

  statCount.textContent = String(trip.expenses.length);

  const byCategory = {};
  trip.expenses.forEach((e) => {
    const key = e.category || "other";
    byCategory[key] = (byCategory[key] || 0) + (Number(e.amount) || 0);
  });

  let topCat = null;
  let topVal = -1;
  Object.entries(byCategory).forEach(([cat, val]) => {
    if (val > topVal) {
      topVal = val;
      topCat = cat;
    }
  });

  statTopCategory.textContent = topCat ? CATEGORY_LABELS[topCat] || topCat : "—";
}

// ===== Операции с поездками =====
function createTrip() {
  const name = prompt("Название поездки:", "Новая поездка");
  if (!name) return;

  const startDate = prompt("Дата начала (ГГГГ-ММ-ДД):", "");
  const endDate = prompt("Дата окончания (ГГГГ-ММ-ДД):", "");
  const location = prompt("Место (страна, город):", "");
  const budgetStr = prompt("Бюджет (число):", "");
  const budget = budgetStr ? Number(budgetStr.replace(",", ".")) : null;
  const currency = prompt("Валюта поездки (например, RUB, EUR):", DEFAULT_CURRENCY) || DEFAULT_CURRENCY;

  const trip = {
    id: generateId(),
    name: name.trim(),
    startDate: startDate || "",
    endDate: endDate || "",
    location: location || "",
    budget: budget && !isNaN(budget) ? budget : null,
    currency: currency.toUpperCase(),
    expenses: [],
  };

  state.trips.push(trip);
  state.selectedTripId = trip.id;
  saveState();
  renderTrips();
}

// ===== Операции с расходами =====
function addExpense(data) {
  const trip = getSelectedTrip();
  if (!trip) {
    alert("Сначала создайте поездку.");
    return;
  }

  const amount = Number(data.amount);
  if (!amount || amount <= 0) {
    alert("Введите корректную сумму.");
    return;
  }

  const exp = {
    id: generateId(),
    amount,
    category: data.category,
    date: data.date,
    note: data.note || "",
    location: data.location || "",
  };

  trip.expenses.push(exp);
  saveState();
  renderExpenses();
  renderAnalytics();
}

function deleteExpense(id) {
  const trip = getSelectedTrip();
  if (!trip) return;
  const idx = trip.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return;
  if (!confirm("Удалить этот расход?")) return;
  trip.expenses.splice(idx, 1);
  saveState();
  renderExpenses();
  renderAnalytics();
}

// ===== Экспорт / импорт =====
function exportJson() {
  const data = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    state,
  };
  const json = JSON.stringify(data, null, 2);
  exportArea.value = json;
}

function importJsonFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const parsed = JSON.parse(text);
      if (!parsed || !parsed.state || !Array.isArray(parsed.state.trips)) {
        alert("Неверный формат файла.");
        return;
      }
      state = parsed.state;
      saveState();
      applyTheme();
      renderTrips();
      alert("Данные успешно импортированы.");
    } catch (err) {
      console.error(err);
      alert("Ошибка при чтении файла.");
    }
  };
  reader.readAsText(file, "utf-8");
}

// ===== Версия =====
async function loadVersion() {
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.version) {
      versionLabel.textContent = `v${data.version}`;
    }
  } catch (e) {
    console.warn("Не удалось загрузить версию", e);
  }
}

// ===== Service Worker =====
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("service-worker.js")
    .catch((err) => console.error("SW registration failed", err));
}

// ===== Инициализация =====
function init() {
  loadState();
  applyTheme();
  renderTrips();
  loadVersion();
  registerServiceWorker();

  const today = new Date().toISOString().slice(0, 10);
  expenseDate.value = today;

  newTripBtn.addEventListener("click", createTrip);

  tripSelect.addEventListener("change", () => {
    state.selectedTripId = tripSelect.value || null;
    saveState();
    renderTripMeta(getSelectedTrip());
    renderExpenses();
    renderAnalytics();
  });

  expenseForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addExpense({
      amount: expenseAmount.value,
      category: expenseCategory.value,
      date: expenseDate.value,
      note: expenseNote.value,
      location: expenseLocation.value,
    });
    expenseAmount.value = "";
    expenseNote.value = "";
    expenseLocation.value = "";
  });

  filterCategory.addEventListener("change", renderExpenses);
  filterSort.addEventListener("change", renderExpenses);

  exportJsonBtn.addEventListener("click", exportJson);

  importJsonBtn.addEventListener("click", () => {
    importFileInput.click();
  });

  importFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    importJsonFromFile(file);
    importFileInput.value = "";
  });

  themeToggle.addEventListener("click", toggleTheme);
}

document.addEventListener("DOMContentLoaded", init);
