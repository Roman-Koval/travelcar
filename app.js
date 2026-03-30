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
// 2. Управление поездками
// ===============================

function createTrip(name = "Новая поездка") {
  const id = "trip_" + Date.now();

  state.trips[id] = {
    id,
    name,
    currency: "EUR",
    budget: 0,
    expenses: []
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

document.getElementById("newTripBtn").addEventListener("click", () => {
  const name = prompt("Название поездки:");
  if (name) createTrip(name);
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
  createTrip("Первая поездка");
} else {
  renderAll();
}
