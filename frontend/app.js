// ⚠️ MAKE SURE YOU KEEP THE QUOTES AROUND YOUR URL!
const API_URL = 'https://studioweb-production.up.railway.app/api'; 
const SOCKET_URL = API_URL.replace('/api', '');

let currentUser, currentToken;
let fullCalendarInstance = null;
let allBookings =[];
let allPettyCash =[];
let socket = null;
let inactivityTimer;

const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);

function showAlert(msg, isError = false) {
    const alertBox = document.getElementById('alert-box');
    alertBox.textContent = msg;
    alertBox.className = `alert ${isError ? 'error' : ''}`;
    alertBox.classList.remove('hidden');
    setTimeout(() => alertBox.classList.add('hidden'), 3000);
}

function getHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` };
}

async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) throw new Error("API Route Error");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Server error");
        return data;
    } catch (err) { throw err; }
}

// --- AUTO LOGOUT & AUTH ---
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (localStorage.getItem('token')) {
        inactivityTimer = setTimeout(logout, 15 * 60 * 1000); // 15 Minutes
    }
}

// Listen for user activity
document.onmousemove = resetInactivityTimer;
document.onkeypress = resetInactivityTimer;
document.onclick = resetInactivityTimer;
document.onscroll = resetInactivityTimer;

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = await safeFetch(`${API_URL}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        initApp();
    } catch (err) { showAlert(err.message, true); }
});

function logout() { 
    localStorage.clear(); 
    window.location.reload(); 
}

function initApp() {
    currentToken = localStorage.getItem('token');
    if (!currentToken) return;

    currentUser = JSON.parse(localStorage.getItem('user'));
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');
    
    if (currentUser.role !== 'Admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }
    initRealTime();
    showSection('calendar');
    resetInactivityTimer();
}

function initRealTime() {
    if (!socket) {
        socket = io(SOCKET_URL);
        socket.on('connect', () => {
            const statusEl = document.getElementById('sync-status');
            if(statusEl) statusEl.style.display = 'block';
        });
        socket.on('disconnect', () => {
            const statusEl = document.getElementById('sync-status');
            if(statusEl) statusEl.style.display = 'none';
        });
        
        socket.on('bookings_changed', async () => {
            await fetchAllBookings();
            refreshActiveSection();
        });
        socket.on('finance_changed', async () => {
            if (currentUser && currentUser.role === 'Admin') await fetchPettyCash();
            refreshActiveSection();
        });
    }
}

// --- NAVIGATION & FETCH ---
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

async function showSection(section) {
    document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
    const secEl = document.getElementById(`${section}-section`);
    if(secEl) secEl.classList.remove('hidden');
    
    const titleEl = document.getElementById('section-title');
    if(titleEl) titleEl.textContent = section.charAt(0).toUpperCase() + section.slice(1).replace('cash', ' Cash');

    if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();

    await fetchAllBookings();
    if (currentUser && currentUser.role === 'Admin' && section === 'pettycash') await fetchPettyCash();

    refreshActiveSection();
}

function refreshActiveSection() {
    const activeEl = document.querySelector('.section:not(.hidden)');
    if(!activeEl) return;
    const active = activeEl.id.replace('-section', '');
    if (active === 'calendar') renderCalendar();
    if (active === 'bookings') renderListTable();
    if (active === 'finance' && currentUser && currentUser.role === 'Admin') renderFinanceTable();
    if (active === 'pettycash' && currentUser && currentUser.role === 'Admin') renderPettyCash();
    if (active === 'accounts' && currentUser && currentUser.role === 'Admin') renderAccountsTable();
}

async function fetchAllBookings() {
    try { allBookings = await safeFetch(`${API_URL}/bookings`, { headers: getHeaders() }); } catch (err) { console.error(err); }
}
async function fetchPettyCash() {
    try { allPettyCash = await safeFetch(`${API_URL}/petty_cash`, { headers: getHeaders() }); } catch (err) { console.error(err); }
}

// --- RENDERING CALENDAR & TABLES ---
function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;
    const events = allBookings.map(b => ({
        id: b.id, title: `${b.client_name} (${b.customer_type})`, 
        start: `${b.date.split('T')[0]}T${b.start_time}`, end: `${b.date.split('T')[0]}T${b.end_time}`,
        backgroundColor: b.status === 'Paid' ? '#10B981' : (b.status === 'Partial' ? '#F59E0B' : '#EF4444'),
        extendedProps: b
    }));

    if (fullCalendarInstance) fullCalendarInstance.destroy();
    fullCalendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'dayGridMonth', // Better mobile view
        height: '100%', stickyHeaderDates: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        editable: false, // DRAG & DROP DISABLED
        events: events,
        eventClick: (info) => openDetailModal(info.event.extendedProps),
        dateClick: (info) => { 
            // Click date to jump to week view
            fullCalendarInstance.changeView('timeGridWeek', info.dateStr);
        }
    });
    fullCalendarInstance.render();
}

function renderListTable() {
    const tbody = document.querySelector('#bookings-table tbody');
    if(!tbody) return;
    tbody.innerHTML = allBookings.map(b => `
        <tr>
            <td>${b.date.split('T')[0]}</td>
            <td>${b.start_time.substring(0,5)}</td>
            <td><strong>${b.client_name}</strong></td>
            <td>${b.customer_type}</td>
            <td class="text-green">${formatIDR(b.dp_paid)}</td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
            <td><button class="primary-btn" style="padding: 6px 12px" onclick="openDetailModalById(${b.id})">Detail</button></td>
        </tr>
    `).join('');
}

function renderFinanceTable() {
    let gross = 0, dp = 0, remain = 0;
    allBookings.forEach(b => { gross += parseFloat(b.total_price); dp += parseFloat(b.dp_paid); remain += parseFloat(b.remaining_payment); });
    const inc = document.getElementById('fin-income'); if(inc) inc.textContent = formatIDR(gross);
    const dpe = document.getElementById('fin-dp'); if(dpe) dpe.textContent = formatIDR(dp);
    const rem = document.getElementById('fin-remain'); if(rem) rem.textContent = formatIDR(remain);
}

function renderPettyCash() {
    let totalIn = 0, totalOut = 0;
    const tbody = document.querySelector('#pc-table tbody');
    if(!tbody) return;
    tbody.innerHTML = allPettyCash.map(t => {
        const amt = parseFloat(t.amount);
        if (t.type === 'IN') totalIn += amt; else totalOut += amt;
        return `<tr>
            <td>${t.date.split('T')[0]}</td>
            <td>${t.description}</td>
            <td><span class="role-pill" style="background:${t.type==='IN'?'#D1FAE5':'#FEE2E2'}; color:${t.type==='IN'?'#065F46':'#991B1B'}">${t.type}</span></td>
            <td class="${t.type==='IN'?'text-green':'text-red'}">${t.type==='IN'?'+':'-'} ${formatIDR(amt)}</td>
            <td><button class="del-btn" style="padding: 6px 12px" onclick="deletePettyCash(${t.id})">Del</button></td>
        </tr>`;
    }).join('');
    
    const pIn = document.getElementById('pc-in'); if(pIn) pIn.textContent = formatIDR(totalIn);
    const pOut = document.getElementById('pc-out'); if(pOut) pOut.textContent = formatIDR(totalOut);
    const pBal = document.getElementById('pc-balance'); if(pBal) pBal.textContent = formatIDR(totalIn - totalOut);
}

// --- MODALS ---
function openDetailModalById(id) { const b = allBookings.find(x => x.id === id); if(b) openDetailModal(b); }

function openDetailModal(b) {
    document.getElementById('det_name').textContent = b.client_name;
    document.getElementById('det_type').textContent = b.customer_type;
    document.getElementById('det_phone').textContent = b.client_phone;
    document.getElementById('det_email').textContent = b.client_email || "N/A";
    document.getElementById('det_date').textContent = b.date.split('T')[0];
    document.getElementById('det_time').textContent = `${b.start_time.substring(0,5)} - ${b.end_time.substring(0,5)}`;
    document.getElementById('det_total').textContent = formatIDR(b.total_price);
    document.getElementById('det_dp').textContent = formatIDR(b.dp_paid);
    document.getElementById('det_remain').textContent = formatIDR(b.remaining_payment);
    document.getElementById('det_status').textContent = b.status;
    document.getElementById('det_status').className = `status-pill status-${b.status}`;

    document.getElementById('btn-edit-from-detail').onclick = () => openEditModal(b);
    document.getElementById('delete-btn').onclick = () => deleteFromModal(b.id);
    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetailModal() { document.getElementById('detail-modal').classList.add('hidden'); }

function calcRemaining() {
    const p = parseFloat(document.getElementById('total_price').value) || 0;
    const dp = parseFloat(document.getElementById('dp_paid').value) || 0;
    document.getElementById('remaining-text').textContent = formatIDR(p - dp);
}

function openBookingModal() {
    document.getElementById('booking-form').reset();
    document.getElementById('booking_id').value = "";
    document.getElementById('modal-title').textContent = "New Booking";
    calcRemaining();
    document.getElementById('booking-modal').classList.remove('hidden');
}

function openEditModal(b) {
    closeDetailModal(); 
    document.getElementById('booking_id').value = b.id;
    document.getElementById('modal-title').textContent = "Edit Booking";
    document.getElementById('customer_type').value = b.customer_type;
    document.getElementById('client_name').value = b.client_name;
    document.getElementById('client_phone').value = b.client_phone;
    document.getElementById('client_email').value = b.client_email || "";
    document.getElementById('date').value = b.date.split('T')[0];
    document.getElementById('start_time').value = b.start_time.substring(0,5);
    document.getElementById('end_time').value = b.end_time.substring(0,5);
    document.getElementById('total_price').value = b.total_price;
    document.getElementById('dp_paid').value = b.dp_paid;
    calcRemaining();
    document.getElementById('booking-modal').classList.remove('hidden');
}

function closeBookingModal() { document.getElementById('booking-modal').classList.add('hidden'); }

// --- API SUBMISSIONS ---
const bookingForm = document.getElementById('booking-form');
if(bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            customer_type: document.getElementById('customer_type').value,
            client_name: document.getElementById('client_name').value.trim(),
            client_phone: document.getElementById('client_phone').value.trim(),
            client_email: document.getElementById('client_email').value.trim(),
            date: document.getElementById('date').value,
            start_time: document.getElementById('start_time').value,
            end_time: document.getElementById('end_time').value,
            total_price: parseFloat(document.getElementById('total_price').value) || 0,
            dp_paid: parseFloat(document.getElementById('dp_paid').value) || 0
        };
        if(!payload.customer_type) return showAlert("Please select Customer Type", true);

        const bookingId = document.getElementById('booking_id').value;
        try {
            await safeFetch(bookingId ? `${API_URL}/bookings/${bookingId}` : `${API_URL}/bookings`, { 
                method: bookingId ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(payload) 
            });
            showAlert(bookingId ? "Updated!" : "Saved!");
            closeBookingModal();
        } catch (err) { showAlert(err.message, true); }
    });
}

async function deleteFromModal(id) {
    if (!confirm("Delete this booking?")) return;
    try {
        await safeFetch(`${API_URL}/bookings/${id}`, { method: 'DELETE', headers: getHeaders() });
        showAlert("Deleted!");
        closeDetailModal();
    } catch (err) { showAlert(err.message, true); }
}

const pcForm = document.getElementById('pc-form');
if(pcForm) {
    pcForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await safeFetch(`${API_URL}/petty_cash`, { 
                method: 'POST', headers: getHeaders(), 
                body: JSON.stringify({
                    date: document.getElementById('pc_date').value,
                    description: document.getElementById('pc_desc').value.trim(),
                    type: document.getElementById('pc_type').value,
                    amount: parseFloat(document.getElementById('pc_amount').value)
                }) 
            });
            showAlert("Transaction added!");
            document.getElementById('pc-form').reset();
        } catch (err) { showAlert(err.message, true); }
    });
}

async function deletePettyCash(id) {
    if(!confirm("Delete transaction?")) return;
    try {
        await safeFetch(`${API_URL}/petty_cash/${id}`, { method: 'DELETE', headers: getHeaders() });
        showAlert("Transaction deleted");
    } catch(err) { showAlert(err.message, true); }
}

async function renderAccountsTable() {
    try {
        const users = await safeFetch(`${API_URL}/users`, { headers: getHeaders() });
        const tbody = document.querySelector('#accounts-table tbody');
        if(!tbody) return;
        tbody.innerHTML = users.map(u => `
            <tr><td><strong>${u.email}</strong></td><td><span class="role-pill">${u.role}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
            <td><button class="del-btn" style="padding:6px 12px" onclick="deleteAccount(${u.id})">Del</button></td></tr>
        `).join('');
    } catch (err) { console.error(err); }
}

const accForm = document.getElementById('account-form');
if(accForm) {
    accForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await safeFetch(`${API_URL}/users`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({
                role: document.getElementById('acc_role').value, email: document.getElementById('acc_email').value.trim(), password: document.getElementById('acc_password').value
            }) });
            showAlert("Account created!"); document.getElementById('account-form').reset(); renderAccountsTable();
        } catch (err) { showAlert(err.message, true); }
    });
}

async function deleteAccount(id) {
    if(!confirm("Delete account?")) return;
    try { await safeFetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: getHeaders() }); renderAccountsTable(); } catch (err) { showAlert(err.message, true); }
}

// --- INITIALIZE APP ---
window.onload = () => { 
    resetInactivityTimer();
    if(localStorage.getItem('token')) {
        initApp(); 
    }
};
