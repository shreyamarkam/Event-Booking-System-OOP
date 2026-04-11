let events   = [];
let bookings = [];
let activeEvtId = null;

let seatCount  = 1;
let cSeatCount = 1;

let statsTotal = 0;
let statsSeat  = 0;
let statsRev   = 0;

// ─── LOAD EVENTS ────────────────────────────────────
async function loadEvents() {
  try {
    let res = await fetch("/events");
    if (!res.ok) { console.error("API not working"); return; }

    let data = await res.json();
    console.log("EVENT DATA:", data);

    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById("events-grid").innerHTML =
        "<p style='color:white'>No events available</p>";
      return;
    }

    events = data.map(e => ({
      id:    e.id,
      name:  e.name  || "Unknown",
      date:  e.date  || "N/A",
      venue: e.venue || "N/A",
      price: e.price || 0,
      seats: e.seats || 0,
      total: e.seats || 1,
      type:  guessType(e.name)
    }));

    renderEvents();
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

// Classify event type from name for badge/color
function guessType(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("concert")) return "concert";
  if (n.includes("movie"))   return "movie";
  if (n.includes("standup") || n.includes("comedy")) return "movie";
  if (n.includes("tech")    || n.includes("talk"))   return "movie";
  return "concert"; // default amber
}

// ─── RENDER EVENTS ──────────────────────────────────
function renderEvents() {
  const grid = document.getElementById('events-grid');
  if (!grid) return;
  if (!events.length) {
    grid.innerHTML = "<p style='color:white'>No events found</p>";
    return;
  }
  grid.innerHTML = '';
  events.forEach(ev => {
    const badgeLabel = ev.type === 'concert' ? '♪ Concert' : '▶ ' + ev.name;
    grid.innerHTML += `
    <div class="event-card ${ev.type}">
      <div class="etype-badge ${ev.type}">${badgeLabel}</div>
      <div class="event-name">${ev.name}</div>
      <div class="event-meta">${ev.date} · ${ev.venue}</div>
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

// ─── LOAD HISTORY ───────────────────────────────────
async function loadHistory() {
  try {
    let res  = await fetch("/history");
    let data = await res.json();
    // Backend doesn't store time, so add a display timestamp if missing
    bookings = data.map(b => ({
      ...b,
      time: b.time || "stored booking"
    }));
    renderHistory();
    updateHistoryBadge();
  } catch (err) {
    console.error("History fetch error:", err);
  }
}

// ─── BOOK ────────────────────────────────────────────
async function confirmBook() {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { showToast("Enter your name", "error"); return; }

  const ev = events.find(e => e.id == activeEvtId);
  if (!ev) { showToast("Event not found", "error"); return; }

  let res = await fetch("/book", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ user: name, eventId: activeEvtId, seats: seatCount })
  });
  let msg = await res.text();

  if (msg === "BOOKED") {
    const time = new Date().toLocaleTimeString();
    bookings.unshift({ user: name, eventName: ev.name, eventId: activeEvtId, seats: seatCount, time });

    statsTotal += 1;
    statsSeat  += seatCount;
    statsRev   += seatCount * ev.price;

    updateStats();
    renderHistory();
    updateHistoryBadge();
    closeModals();
    loadEvents();
    showToast("Booking successful!", "success");
  } else if (msg === "FAILED") {
    showToast("Not enough seats available", "error");
  } else {
    showToast("Booking failed: " + msg, "error");
  }
}

// ─── CANCEL ──────────────────────────────────────────
async function confirmCancel() {
  const name = document.getElementById('cinp-name').value.trim();
  if (!name) { showToast("Enter your name", "error"); return; }

  const ev = events.find(e => e.id == activeEvtId);

  let res = await fetch("/cancel", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ user: name, eventId: activeEvtId, seats: cSeatCount })
  });
  let msg = await res.text();

  if (msg === "CANCELLED") {
    if (ev) {
      statsSeat -= cSeatCount;
      statsRev  -= cSeatCount * ev.price;
      if (statsSeat  < 0) statsSeat  = 0;
      if (statsRev   < 0) statsRev   = 0;
    }
    updateStats();
    closeModals();
    loadEvents();
    loadHistory();
    showToast("Cancelled successfully", "success");
  } else if (msg === "NOT_FOUND") {
    showToast("No matching booking found", "error");
  } else {
    showToast("Cancel failed: " + msg, "error");
  }
}

// ─── ADD EVENT ───────────────────────────────────────
async function submitEvent() {
  const name  = document.getElementById("e-name").value.trim();
  const date  = document.getElementById("e-date").value.trim();
  const venue = document.getElementById("e-venue").value.trim();
  const price = document.getElementById("e-price").value;
  const seats = document.getElementById("e-seats").value;

  if (!name || !date || !venue || !price || !seats) {
    showToast("Fill all fields", "error");
    return;
  }

  let res = await fetch("/addEvent", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name, date, venue, price, seats })
  });
  let msg = await res.text();

  if (msg === "EVENT_ADDED") {
    showToast("Event added!", "success");
    closeAddEvent();
    loadEvents();
  } else {
    showToast("Error adding event: " + msg, "error");
  }
}

// ─── CLEAR HISTORY ───────────────────────────────────
function clearHistory() {
  bookings = [];
  statsTotal = 0;
  statsSeat  = 0;
  statsRev   = 0;
  updateStats();
  renderHistory();
  updateHistoryBadge();
  showToast("History cleared", "success");
}

// ─── UI HELPERS ──────────────────────────────────────
function adjSeats(change) {
  const ev = events.find(e => e.id == activeEvtId);
  if (!ev) return;
  seatCount = Math.max(1, Math.min(seatCount + change, ev.seats));
  document.getElementById('seat-disp').textContent = seatCount;
  updateBookPrice();
}

function updateBookPrice() {
  const ev = events.find(e => e.id == activeEvtId);
  if (!ev) return;
  document.getElementById('m-unit-price').textContent = `₹${ev.price}`;
  document.getElementById('m-seat-count').textContent = seatCount;
  document.getElementById('m-total').textContent      = `₹${seatCount * ev.price}`;
}

function adjCancelSeats(change) {
  cSeatCount = Math.max(1, cSeatCount + change);
  document.getElementById('cseat-disp').textContent = cSeatCount;
}

function updateHistoryBadge() {
  const cnt = document.getElementById('history-cnt');
  cnt.textContent    = bookings.length;
  cnt.style.display  = bookings.length ? 'inline' : 'none';
}

function openBook(id) {
  activeEvtId = id;
  seatCount   = 1;
  const ev = events.find(e => e.id == id);
  if (!ev) { console.error("Event not found:", id); return; }

  // Set badge color dynamically on the modal
  const badge = document.getElementById('m-badge');
  badge.className   = `etype-badge ${ev.type}`;
  badge.textContent = ev.type === 'concert' ? '♪ Concert' : '▶ ' + ev.name;

  // Style confirm button to match event type
  const btn = document.getElementById('m-confirm-btn');
  btn.className = `modal-action ${ev.type}`;

  document.getElementById('m-name').textContent = ev.name;
  document.getElementById('m-meta').textContent = `${ev.date} · ${ev.venue}`;
  document.getElementById('seat-disp').textContent = 1;
  document.getElementById('inp-name').value = '';
  updateBookPrice();
  document.getElementById('book-overlay').classList.add('open');
}

function openCancel(id) {
  activeEvtId = id;
  cSeatCount  = 1;
  document.getElementById('cseat-disp').textContent = 1;
  document.getElementById('cinp-name').value = '';

  const ev = events.find(e => e.id == id);
  if (ev) {
    const badge = document.getElementById('cm-badge');
    badge.className   = `etype-badge ${ev.type}`;
    badge.textContent = ev.type === 'concert' ? '♪ Concert' : '▶ ' + ev.name;
    document.getElementById('cm-name').textContent = ev.name;
    document.getElementById('cm-meta').textContent = `${ev.date} · ${ev.venue}`;
  }
  document.getElementById('cancel-overlay').classList.add('open');
}

function closeModals() {
  document.getElementById('book-overlay').classList.remove('open');
  document.getElementById('cancel-overlay').classList.remove('open');
}

function openAddEvent()  { document.getElementById("add-overlay").classList.add("open"); }
function closeAddEvent() { document.getElementById("add-overlay").classList.remove("open"); }

function switchTab(tab) {
  const eventsWrap  = document.getElementById('events-wrap');
  const historyWrap = document.getElementById('history-wrap');
  document.querySelectorAll('.nav-btn').forEach((btn, i) => {
    btn.classList.toggle('active',
      (tab === 'events' && i === 0) || (tab === 'history' && i === 1));
  });
  eventsWrap.style.display  = tab === 'events'  ? 'block' : 'none';
  historyWrap.style.display = tab === 'history' ? 'block' : 'none';
}

function updateStats() {
  document.getElementById('stat-bookings').textContent = statsTotal;
  document.getElementById('stat-seats').textContent    = statsSeat;
  document.getElementById('stat-revenue').textContent  = statsRev;
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!bookings.length) {
    list.innerHTML = "<p style='color:gray;padding:1rem;'>No booking history yet</p>";
    return;
  }
  list.innerHTML = bookings.map(b => `
    <div class="history-item">
      <div class="h-avatar ${guessType(b.eventName)}">${(b.user || '?')[0].toUpperCase()}</div>
      <div class="h-info">
        <div class="h-user">${b.user}</div>
        <div class="h-event">${b.eventName || 'Event #' + b.eventId}</div>
      </div>
      <div class="h-right">
        <div class="h-seats">${b.seats} seat${b.seats > 1 ? 's' : ''}</div>
        <div class="h-time">${b.time || ''}</div>
      </div>
    </div>
  `).join('');
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── INIT ────────────────────────────────────────────
async function init() {
  await loadEvents();
  await loadHistory();
}

init();