
let events = [];
let bookings = [];
let activeEvtId = null;

let seatCount = 1;
let cSeatCount = 1;

let statsTotal = 0;
let statsSeat = 0;
let statsRev = 0;

// LOAD EVENTS FROM BACKEND
async function loadEvents() {
  try {
    let res = await fetch("http://localhost:3000/events");

    if (!res.ok) {
      console.error("API not working");
      return;
    }

    let data = await res.json();

    console.log("EVENT DATA:", data); // DEBUG (keep for now)

    // SAFETY: if empty or invalid
    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById("events-grid").innerHTML =
        "<p style='color:white'>No events available</p>";
      return;
    }

    // FIX: normalize data properly
    events = data.map(e => ({
      id: e.id,
      name: e.name || "Unknown",
      date: e.date || "N/A",
      venue: e.venue || "N/A",
      price: e.price || 0,
      seats: e.seats || 0,
      total: e.seats || 1,
      type: (e.name || "").toLowerCase().includes("concert")
        ? "concert"
        : "movie"
    }));

    renderEvents();

  } catch (err) {
    console.error("Fetch error:", err);
  }
}

// ─── RENDER EVENTS (SAME UI LOGIC) ───
function renderEvents() {
  const grid = document.getElementById('events-grid');
  if (!grid) {
    console.error("events-grid not found");
    return;
  }

  if (!events.length) {
    grid.innerHTML = "<p style='color:white'>No events found</p>";
    return;
  }
  grid.innerHTML = '';

  events.forEach(ev => {
    const pct = 100;
    grid.innerHTML += `
    <div class="event-card ${ev.type}">
      <div class="etype-badge ${ev.type}">
        ${ev.type === 'concert' ? '♪ Concert' : '▶ Movie'}
      </div>

      <div class="event-name">${ev.name}</div>
      <div class="event-meta">Seats Available</div>

      <div class="details-grid">
        <div class="detail-box">
          <div class="detail-lbl">Price</div>
          <div class="detail-val">₹${ev.price}</div>
        </div>
        <div class="detail-box">
          <div class="detail-lbl">Seats left</div>
          <div class="detail-val">${ev.seats}</div>
        </div>
      </div>

      <div class="card-btns">
        <button class="btn btn-primary ${ev.type}" onclick="openBook(${ev.id})">
          Book tickets
        </button>
        <button class="btn btn-secondary" onclick="openCancel(${ev.id})">
          Cancel
        </button>
      </div>
    </div>`;
  });
}


async function loadHistory() {
  try {
    let res = await fetch("http://localhost:3000/history");
    let data = await res.json();

    bookings = data;

    renderHistory();

  } catch (err) {
    console.error("History fetch error:", err);
  }
}


// ─── BOOK ───
async function confirmBook() {
  const name = document.getElementById('inp-name').value.trim();

  if (!name) {
    showToast("Enter name", "error");
    return;
  }

  const ev = events.find(e => e.id == activeEvtId);

  // Call backend (for seats update only)
  await fetch("http://localhost:3000/book", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      user: name,
      eventId: activeEvtId,
      seats: seatCount
    })
  });

  // ✅ LOCAL HISTORY (WORKING VERSION)
  const time = new Date().toLocaleTimeString();

  bookings.unshift({
    user: name,
    eventName: ev.name,
    eventId: activeEvtId,
    seats: seatCount,
    time
  });

  // ✅ UPDATE STATS
statsTotal += 1;
statsSeat += seatCount;
statsRev += seatCount * ev.price;

updateStats();   

  renderHistory();

  closeModals();
  loadEvents();

  showToast("Booking successful", "success");
}

async function addEvent() {
  const name = document.getElementById("e-name").value;
  const date = document.getElementById("e-date").value;
  const venue = document.getElementById("e-venue").value;
  const price = document.getElementById("e-price").value;
  const seats = document.getElementById("e-seats").value;

  await fetch("http://localhost:3000/addEvent", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ name, date, venue, price, seats })
  });

  showToast("Event added!", "success");

  loadEvents(); // refresh UI
}
// ─── CANCEL ───
async function confirmCancel() {
  const name = document.getElementById('cinp-name').value.trim();

  let res = await fetch("http://localhost:3000/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: name,
      eventId: activeEvtId,
      seats: cSeatCount
    })
  });

  let msg = await res.text();

  if (msg === "CANCELLED") {
    const ev = events.find(e => e.id == activeEvtId);

    statsSeat -= cSeatCount;
    statsRev -= cSeatCount * ev.price;

    updateStats();
    renderHistory();

    showToast("Cancelled successfully", "success");
  }

  closeModals();
  loadEvents();
  loadHistory();
}

// ─── UI FUNCTIONS (UNCHANGED) ───
function adjSeats(change) {
  const ev = events.find(e => e.id == activeEvtId);
  if (!ev) return;

  seatCount += change;

  if (seatCount < 1) seatCount = 1;
  if (seatCount > ev.seats) seatCount = ev.seats;

  document.getElementById('seat-disp').textContent = seatCount;

  updateBookPrice(); // 🔥 IMPORTANT
}
function updateBookPrice() {
  const ev = events.find(e => e.id == activeEvtId);
  if (!ev) return;

  document.getElementById('m-unit-price').textContent = `₹${ev.price}`;
  document.getElementById('m-seat-count').textContent = seatCount;
  document.getElementById('m-total').textContent = `₹${seatCount * ev.price}`;
}

function adjCancelSeats(change) {
  cSeatCount += change;

  if (cSeatCount < 1) cSeatCount = 1;

  document.getElementById('cseat-disp').textContent = cSeatCount;
}

function updateHistoryBadge() {
  const cnt = document.getElementById('history-cnt');
  cnt.textContent = bookings.length;
  cnt.style.display = bookings.length ? 'inline' : 'none';
}

function openBook(id) {
  activeEvtId = id;
  seatCount = 1;

  const ev = events.find(e => e.id == id);
  if (!ev) {
    console.error("Event not found");
    return;
  }

  document.getElementById('m-name').textContent = ev.name;
  document.getElementById('m-meta').textContent = `${ev.date} · ${ev.venue}`;
  document.getElementById('seat-disp').textContent = seatCount;

  updateBookPrice(); // 🔥 IMPORTANT

  document.getElementById('book-overlay').classList.add('open');
}

function openCancel(id) {
  activeEvtId = id;
  document.getElementById('cancel-overlay').classList.add('open');
}
// function openCancel(id) {
//   activeEvtId = id;
//   cSeatCount = 1;
//   document.getElementById('cseat-disp').textContent = 1;
//   document.getElementById('cancel-overlay').classList.add('open');
// }
function closeModals() {
  document.getElementById('book-overlay').classList.remove('open');
  document.getElementById('cancel-overlay').classList.remove('open');
}

function openAddEvent() {
  document.getElementById("add-overlay").classList.add("open");
}

function closeAddEvent() {
  document.getElementById("add-overlay").classList.remove("open");
}



// TOAST
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2500);
}
function switchTab(tab) {
  const eventsWrap = document.getElementById('events-wrap');
  const historyWrap = document.getElementById('history-wrap');

  const navBtns = document.querySelectorAll('.nav-btn');

  // Toggle active button
  navBtns.forEach((btn, index) => {
    btn.classList.remove('active');
    if ((tab === 'events' && index === 0) || (tab === 'history' && index === 1)) {
      btn.classList.add('active');
    }
  });

  // Show / hide sections
  if (tab === 'events') {
    eventsWrap.style.display = 'block';
    historyWrap.style.display = 'none';
  } else {
    eventsWrap.style.display = 'none';
    historyWrap.style.display = 'block';
  }
}
function updateStats() {
  document.getElementById('stat-bookings').textContent = statsTotal;
  document.getElementById('stat-seats').textContent = statsSeat;
  document.getElementById('stat-revenue').textContent = statsRev;
}

function renderHistory() {
  const list = document.getElementById('history-list');

  if (!bookings.length) {
    list.innerHTML = "<p style='color:gray'>No history</p>";
    return;
  }

  list.innerHTML = bookings.map(b => `
    <div style="padding:10px; border-bottom:1px solid #333;">
      <strong>${b.user}</strong> booked 
      <strong>${b.seats}</strong> seat(s) for 
      <strong>${b.eventName}</strong><br/>
      <small>${b.time}</small>
    </div>
  `).join('');
}


async function submitEvent() {
  const name = document.getElementById("e-name").value.trim();
  const date = document.getElementById("e-date").value.trim();
  const venue = document.getElementById("e-venue").value.trim();
  const price = document.getElementById("e-price").value;
  const seats = document.getElementById("e-seats").value;

  if (!name || !date || !venue || !price || !seats) {
    showToast("Fill all fields", "error");
    return;
  }

  let res = await fetch("http://localhost:3000/addEvent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, date, venue, price, seats })
  });

  let msg = await res.text();

  if (msg === "EVENT_ADDED") {
    showToast("Event added!", "success");
    closeAddEvent();
    loadEvents();
  } else {
    showToast("Error adding event", "error");
  }
}
// INIT
async function init() {
  await loadEvents();   // MUST FIRST
  await loadHistory();  // THEN history
}

init();
