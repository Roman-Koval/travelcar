// формат суммы
function fmt(amount) {
  return amount.toFixed(2).replace(".", ",") + " €";
}

const STORAGE_KEY = "travel_car_final_v1";

let state = {
  tripName: "Поездка 1",
  tripDates: "",
  budget: 0,
  baseCurrency: "EUR",
  expenses: [] // {id,title,amount,currency,category,date}
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {}
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// элементы
const tripNameEl = document.getElementById("tripName");
const tripDatesEl = document.getElementById("tripDates");
const tripBudgetEl = document.getElementById("tripBudget");
const baseCurrencyEl = document.getElementById("baseCurrency");
const totalAmountEl = document.getElementById("totalAmount");
const budgetLeftEl = document.getElementById("budgetLeft");
const expenseCountEl = document.getElementById("expenseCount");
const expenseListEl = document.getElementById("expenseList");
const searchInputEl = document.getElementById("searchInput");

const expenseModalEl = document.getElementById("expenseModal");
const expTitleEl = document.getElementById("expTitle");
const expAmountEl = document.getElementById("expAmount");
const expCategoryEl = document.getElementById("expCategory");
const expDateEl = document.getElementById("expDate");
const expCurrencyEl = document.getElementById("expCurrency");

const addExpenseBtn = document.getElementById("addExpenseBtn");
const closeModalBtn = document.getElementById("closeModal");
const cancelExpenseBtn = document.getElementById("cancelExpense");
const saveExpenseBtn = document.getElementById("saveExpense");

const titleVoiceBtn = document.getElementById("titleVoiceBtn");
const amountVoiceBtn = document.getElementById("amountVoiceBtn");
const themeToggleBtn = document.getElementById("themeToggle");

// курсы
const RATES = {
  EUR: 1,
  USD: 1.1,
  UAH: 41,
  TRY: 35,
  PLN: 4.3
};

function toBase(amount, cur) {
  const base = state.baseCurrency;
  if (cur === base) return amount;
  const eur = amount / (RATES[cur] || 1);
  return eur * (RATES[base] || 1);
}

// графики
let categoryChart = null;
let dailyChart = null;

function renderSummary() {
  const total = state.expenses.reduce(
    (sum, e) => sum + toBase(e.amount, e.currency),
    0
  );
  totalAmountEl.textContent = fmt(total);
  expenseCountEl.textContent = state.expenses.length.toString();

  if (state.budget > 0) {
    const left = state.budget - total;
    budgetLeftEl.textContent = fmt(left);
    budgetLeftEl.style.color = left < 0 ? "#ef4444" : "#22c55e";
  } else {
    budgetLeftEl.textContent = "—";
    budgetLeftEl.style.color = "#e5e7eb";
  }

  tripNameEl.textContent = state.tripName;
  tripDatesEl.textContent = state.tripDates || "Без дат";
  tripBudgetEl.value = state.budget || "";
  baseCurrencyEl.value = state.baseCurrency;
}

function renderList() {
  const q = searchInputEl.value.trim().toLowerCase();
  expenseListEl.innerHTML = "";

  const filtered = state.expenses.filter((e) => {
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.date || "").includes(q)
    );
  });

  filtered
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .forEach((e) => {
      const row = document.createElement("div");
      row.className = "expense-item";

      const main = document.createElement("div");
      main.className = "exp-main";

      const title = document.createElement("div");
      title.className = "exp-title";
      title.textContent = e.title;

      const meta = document.createElement("div");
      meta.className = "exp-meta";
      meta.textContent =
        (e.date || "без даты") +
        " • " +
        e.category +
        " • " +
        e.amount.toFixed(2) +
        " " +
        e.currency;

      main.appendChild(title);
      main.appendChild(meta);

      const amt = document.createElement("div");
      amt.className = "exp-amount";
      amt.textContent = fmt(toBase(e.amount, e.currency));

      row.appendChild(main);
      row.appendChild(amt);

      expenseListEl.appendChild(row);
    });
}

function renderCharts() {
  const byCat = {};
  const byDay = {};

  state.expenses.forEach((e) => {
    const v = toBase(e.amount, e.currency);
    byCat[e.category] = (byCat[e.category] || 0) + v;
    const d = e.date || "без даты";
    byDay[d] = (byDay[d] || 0) + v;
  });

  const catLabels = Object.keys(byCat);
  const catData = Object.values(byCat);

  const dayLabels = Object.keys(byDay).sort();
  const dayData = dayLabels.map((d) => byDay[d]);

  const catCtx = document.getElementById("categoryChart");
  const dayCtx = document.getElementById("dailyChart");

  if (categoryChart) categoryChart.destroy();
  if (dailyChart) dailyChart.destroy();

  categoryChart = new Chart(catCtx, {
    type: "doughnut",
    data: {
      labels: catLabels,
      datasets: [
        {
          data: catData,
          backgroundColor: [
            "#22c55e",
            "#38bdf8",
            "#f97316",
            "#a855f7",
            "#facc15",
            "#ef4444"
          ]
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } }
    }
  });

  dailyChart = new Chart(dayCtx, {
    type: "bar",
    data: {
      labels: dayLabels,
      datasets: [
        {
          data: dayData,
          backgroundColor: "#22c55e"
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9ca3af" } },
        y: { ticks: { color: "#9ca3af" } }
      }
    }
  });
}

function renderAll() {
  renderSummary();
  renderList();
  renderCharts();
}

// модалка

function openModal() {
  expenseModalEl.classList.add("show");
  expTitleEl.value = "";
  expAmountEl.value = "";
  expCategoryEl.value = "other";
  expDateEl.valueAsDate = new Date();
  expCurrencyEl.value = state.baseCurrency;
}

function closeModal() {
  expenseModalEl.classList.remove("show");
}

// обработчики

addExpenseBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
cancelExpenseBtn.addEventListener("click", closeModal);

saveExpenseBtn.addEventListener("click", () => {
  const title = expTitleEl.value.trim() || "Без названия";
  const amount = parseFloat(expAmountEl.value || "0");
  if (!amount || amount <= 0) {
    alert("Введите сумму");
    return;
  }
  const category = expCategoryEl.value;
  const date = expDateEl.value || "";
  const currency = expCurrencyEl.value;

  state.expenses.push({
    id: Date.now(),
    title,
    amount,
    category,
    date,
    currency
  });

  saveState();
  closeModal();
  renderAll();
});

tripBudgetEl.addEventListener("change", () => {
  state.budget = parseFloat(tripBudgetEl.value || "0") || 0;
  saveState();
  renderAll();
});

baseCurrencyEl.addEventListener("change", () => {
  state.baseCurrency = baseCurrencyEl.value;
  saveState();
  renderAll();
});

searchInputEl.addEventListener("input", () => {
  renderList();
});

// тема

function loadTheme() {
  const t = localStorage.getItem("travel_car_theme") || "dark";
  if (t === "light") {
    document.body.classList.add("light");
  } else {
    document.body.classList.remove("light");
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem("travel_car_theme", isLight ? "light" : "dark");
}

themeToggleBtn.addEventListener("click", toggleTheme);

// голос

function setupVoiceButton(button, targetInput, mode) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    button.style.display = "none";
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = "ru-RU";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.addEventListener("result", (e) => {
    const text = e.results[0][0].transcript.trim();
    if (mode === "text") {
      targetInput.value = text;
    } else if (mode === "number") {
      const num = parseFloat(text.replace(",", ".").replace(/[^\d.]/g, ""));
      if (!isNaN(num)) targetInput.value = num;
    }
  });

  button.addEventListener("mousedown", () => {
    try {
      rec.start();
    } catch (e) {}
  });

  button.addEventListener("mouseup", () => {
    try {
      rec.stop();
    } catch (e) {}
  });

  button.addEventListener("touchstart", () => {
    try {
      rec.start();
    } catch (e) {}
  });

  button.addEventListener("touchend", () => {
    try {
      rec.stop();
    } catch (e) {}
  });
}

setupVoiceButton(titleVoiceBtn, expTitleEl, "text");
setupVoiceButton(amountVoiceBtn, expAmountEl, "number");

// init

loadState();
loadTheme();
renderAll();
