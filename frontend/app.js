// ⚠️ MAKE SURE YOU KEEP THE QUOTES AROUND YOUR URL!
const API_URL = 'https://studioweb-production.up.railway.app/api'; 
const SOCKET_URL = API_URL.replace('/api', '');

let currentUser, currentToken;
let fullCalendarInstance = null;
let allBookings = [];
let allPettyCash =[];
let socket = null;
let inactivityTimer;
let lastClickedDate = null; 
let currentBaseDP = 0;

// [NEW] View Modes for Tabs
let viewModeBookings = 'upcoming';
let viewModeFinance = 'upcoming';

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

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (localStorage.getItem('token')) {
        inactivityTimer = setTimeout(logout, 15 * 60 * 1000); 
    }
}
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

function logout() { localStorage.clear(); window.location.reload(); }

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
        socket.on('connect', () => { const el = document.getElementById('sync-status'); if(el) el.style.display = 'block'; });
        socket.on('disconnect', () => { const el = document.getElementById('sync-status'); if(el) el.style.display = 'none'; });
        socket.on('bookings_changed', async () => { await fetchAllBookings(); refreshActiveSection(); });
        socket.on('finance_changed', async () => { await fetchPettyCash(); refreshActiveSection(); });
    }
}

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
    if (section === 'pettycash') await fetchPettyCash();

    refreshActiveSection();
}

function refreshActiveSection() {
    const activeEl = document.querySelector('.section:not(.hidden)');
    if(!activeEl) return;
    const active = activeEl.id.replace('-section', '');
    if (active === 'calendar') renderCalendar();
    if (active === 'bookings') renderListTable();
    if (active === 'finance') renderFinanceTable();
    if (active === 'pettycash') renderPettyCash();
    if (active === 'accounts') renderAccountsTable();
}

async function fetchAllBookings() {
    try { allBookings = await safeFetch(`${API_URL}/bookings`, { headers: getHeaders() }); } catch (err) { console.error(err); }
}
async function fetchPettyCash() {
    try { allPettyCash = await safeFetch(`${API_URL}/petty_cash`, { headers: getHeaders() }); } catch (err) { console.error(err); }
}

// [NEW] Date Check Logic: Returns true if booking has completely ended
function isBookingRecent(dateStr, endTimeStr) {
    const dateTimeStr = `${dateStr.split('T')[0]}T${endTimeStr}`;
    const bookingEnd = new Date(dateTimeStr);
    const now = new Date();
    return bookingEnd < now; // If it's in the past, it's 'recent'
}

// [NEW] Tab Toggles
function toggleBookingView(mode) {
    viewModeBookings = mode;
    document.querySelectorAll('#bookings-section .tab-btn').forEach(btn => btn.classList.remove('active-tab'));
    document.getElementById(`tab-booking-${mode}`).classList.add('active-tab');
    renderListTable();
}

function toggleFinanceView(mode) {
    viewModeFinance = mode;
    document.querySelectorAll('#finance-section .tab-btn').forEach(btn => btn.classList.remove('active-tab'));
    document.getElementById(`tab-finance-${mode}`).classList.add('active-tab');
    renderFinanceTable();
}

// --- RENDERING CALENDAR ---
function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;
    const isMobile = window.innerWidth <= 768;

    const events = allBookings.map(b => ({
        id: b.id, title: b.client_name, 
        start: `${b.date.split('T')[0]}T${b.start_time}`, end: `${b.date.split('T')[0]}T${b.end_time}`,
        backgroundColor: isMobile ? '#D1D5DB' : (b.status === 'Paid' ? '#10B981' : (b.status === 'Partial' ? '#F59E0B' : '#EF4444')),
        extendedProps: b
    }));

    if (fullCalendarInstance) fullCalendarInstance.destroy();
    fullCalendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', 
        height: isMobile ? 'auto' : '100%', 
        contentHeight: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        editable: false, 
        events: events,
        
        eventClick: (info) => {
            openDetailModal(info.event.extendedProps);
        },
        
        dateClick: (info) => { 
            if (isMobile) {
                if (lastClickedDate === info.dateStr) {
                    fullCalendarInstance.changeView('timeGridWeek', info.dateStr);
                    lastClickedDate = null; 
                    return;
                }
                
                lastClickedDate = info.dateStr; 
                document.querySelectorAll('.selected-date').forEach(el => el.classList.remove('selected-date'));
                info.dayEl.classList.add('selected-date');

                const dayBookings = allBookings.filter(b => b.date.split('T')[0] === info.dateStr);
                const listEl = document.getElementById('mobile-event-list');
                const itemsEl = document.getElementById('mobile-event-items');
                
                document.getElementById('mobile-event-date').textContent = new Date(info.dateStr).toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});
                listEl.classList.remove('hidden');
                
                if (dayBookings.length === 0) {
                    itemsEl.innerHTML = '<p style="color: #9CA3AF; text-align: center; margin-top: 20px;">No Events</p>';
                } else {
                    itemsEl.innerHTML = dayBookings.map(b => `
                        <div class="mobile-event-card" onclick="openDetailModalById(${b.id})">
                            <div class="left-info">
                                <span class="time">${b.start_time.substring(0,5)}</span>
                                <span class="client">${b.client_name}</span>
                            </div>
                            <div>
                                <span class="status-pill status-${b.status}">${b.status}</span>
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                fullCalendarInstance.changeView('timeGridWeek', info.dateStr);
            }
        }
    });
    fullCalendarInstance.render();
}

function renderListTable() {
    const tbody = document.querySelector('#bookings-table tbody');
    if(!tbody) return;

    // Filter based on View Mode
    let filtered = allBookings.filter(b => {
        const recent = isBookingRecent(b.date, b.end_time);
        return viewModeBookings === 'upcoming' ? !recent : recent;
    });

    // Sort: Upcoming (ASC), Recent (DESC)
    if (viewModeBookings === 'recent') {
        filtered.sort((a, b) => new Date(b.date.split('T')[0]+'T'+b.end_time) - new Date(a.date.split('T')[0]+'T'+a.end_time));
    } else {
        filtered.sort((a, b) => new Date(a.date.split('T')[0]+'T'+a.start_time) - new Date(b.date.split('T')[0]+'T'+b.start_time));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #9CA3AF; padding: 20px;">No ${viewModeBookings} bookings found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => `
        <tr>
            <td>${b.date.split('T')[0]}</td>
            <td class="hide-mobile">${b.start_time.substring(0,5)}</td>
            <td><strong>${b.client_name}</strong></td>
            <td class="hide-mobile">${b.customer_type}</td>
            <td class="hide-mobile text-green">${formatIDR(b.dp_paid)}</td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
            <td><button class="primary-btn" style="padding: 6px 12px" onclick="openDetailModalById(${b.id})">Detail</button></td>
        </tr>
    `).join('');
}

function renderFinanceTable() {
    let gross = 0, dp = 0, remain = 0;
    const tbody = document.querySelector('#finance-table tbody');
    if(!tbody) return;
    
    // Summary Cards ALWAYS calculate from ALL bookings.
    allBookings.forEach(b => { 
        gross += parseFloat(b.total_price); 
        dp += parseFloat(b.dp_paid); 
        remain += parseFloat(b.remaining_payment); 
    });

    document.getElementById('fin-income').textContent = formatIDR(gross);
    document.getElementById('fin-dp').textContent = formatIDR(dp);
    document.getElementById('fin-remain').textContent = formatIDR(remain);

    // Filter table rows based on View Mode
    let filtered = allBookings.filter(b => {
        const recent = isBookingRecent(b.date, b.end_time);
        return viewModeFinance === 'upcoming' ? !recent : recent;
    });

    if (viewModeFinance === 'recent') {
        filtered.sort((a, b) => new Date(b.date.split('T')[0]+'T'+b.end_time) - new Date(a.date.split('T')[0]+'T'+a.end_time));
    } else {
        filtered.sort((a, b) => new Date(a.date.split('T')[0]+'T'+a.start_time) - new Date(b.date.split('T')[0]+'T'+b.start_time));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #9CA3AF; padding: 20px;">No ${viewModeFinance} transactions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => `
        <tr>
            <td>${b.date.split('T')[0]}</td>
            <td>
                <strong>${b.client_name}</strong><br>
                <span style="font-size: 12px; color: #666;">📞 ${b.client_phone}</span>
            </td>
            <td class="hide-mobile">${formatIDR(b.total_price)}</td>
            <td class="hide-mobile text-green">${formatIDR(b.dp_paid)}</td>
            <td class="hide-mobile text-red"><strong>${formatIDR(b.remaining_payment)}</strong></td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
        </tr>
    `).join('');
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
            <td class="hide-mobile"><span class="role-pill" style="background:${t.type==='IN'?'#D1FAE5':'#FEE2E2'}; color:${t.type==='IN'?'#065F46':'#991B1B'}">${t.type}</span></td>
            <td class="${t.type==='IN'?'text-green':'text-red'}">${t.type==='IN'?'+':'-'} ${formatIDR(amt)}</td>
            <td><button class="primary-btn" style="padding: 6px 12px" onclick="openPcDetailModalById(${t.id})">Detail</button></td>
        </tr>`;
    }).join('');
    
    document.getElementById('pc-in').textContent = formatIDR(totalIn);
    document.getElementById('pc-out').textContent = formatIDR(totalOut);
    document.getElementById('pc-balance').textContent = formatIDR(totalIn - totalOut);
}

// --- PETTY CASH MODALS ---
function openPcDetailModalById(id) { 
    const t = allPettyCash.find(x => x.id === id); 
    if(t) openPcDetailModal(t); 
}

function openPcDetailModal(t) {
    document.getElementById('pc_det_date').textContent = t.date.split('T')[0];
    document.getElementById('pc_det_desc').textContent = t.description;
    
    const typeEl = document.getElementById('pc_det_type');
    typeEl.textContent = t.type;
    typeEl.style.background = t.type === 'IN' ? '#D1FAE5' : '#FEE2E2';
    typeEl.style.color = t.type === 'IN' ? '#065F46' : '#991B1B';

    document.getElementById('pc_det_amount').textContent = formatIDR(t.amount);
    document.getElementById('pc_det_amount').className = t.type === 'IN' ? 'text-green text-lg' : 'text-red text-lg';

    document.getElementById('btn-edit-pc').onclick = () => openEditPcModal(t);
    document.getElementById('btn-del-pc').onclick = () => deletePettyCash(t.id);
    document.getElementById('pc-detail-modal').classList.remove('hidden');
}

function closePcDetailModal() { document.getElementById('pc-detail-modal').classList.add('hidden'); }

function openPcModal() {
    document.getElementById('pc-form').reset();
    document.getElementById('pc_id').value = "";
    document.getElementById('pc-modal-title').textContent = "Add Petty Cash";
    document.getElementById('pc-modal').classList.remove('hidden');
}

function openEditPcModal(t) {
    closePcDetailModal();
    document.getElementById('pc_id').value = t.id;
    document.getElementById('pc-modal-title').textContent = "Edit Petty Cash";
    document.getElementById('pc_date').value = t.date.split('T')[0];
    document.getElementById('pc_desc').value = t.description;
    document.getElementById('pc_type').value = t.type;
    document.getElementById('pc_amount').value = t.amount;
    document.getElementById('pc-modal').classList.remove('hidden');
}
function closePcModal() { document.getElementById('pc-modal').classList.add('hidden'); }

// --- BOOKING MODALS & SETTLEMENT LOGIC ---
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

function handleManualDP() {
    currentBaseDP = parseFloat(document.getElementById('dp_paid').value) || 0;
    document.getElementById('settlement_input').value = '';
    calcRemaining();
}

function addSettlementToDP() {
    const added = parseFloat(document.getElementById('settlement_input').value) || 0;
    document.getElementById('dp_paid').value = currentBaseDP + added;
    calcRemaining();
}

function markAsFullyPaid() {
    const total = parseFloat(document.getElementById('total_price').value) || 0;
    const remain = total - currentBaseDP;
    if (remain > 0) {
        document.getElementById('settlement_input').value = remain;
        addSettlementToDP();
    }
}

function openBookingModal() {
    document.getElementById('booking-form').reset();
    document.getElementById('booking_id').value = "";
    document.getElementById('modal-title').textContent = "New Booking";
    
    currentBaseDP = 0;
    document.getElementById('settlement-section').classList.add('hidden');

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
    
    currentBaseDP = parseFloat(b.dp_paid) || 0;
    document.getElementById('settlement_input').value = '';

    if (b.status !== 'Paid') {
        document.getElementById('settlement-section').classList.remove('hidden');
    } else {
        document.getElementById('settlement-section').classList.add('hidden');
    }

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
        const pcId = document.getElementById('pc_id').value;
        const payload = {
            date: document.getElementById('pc_date').value,
            description: document.getElementById('pc_desc').value.trim(),
            type: document.getElementById('pc_type').value,
            amount: parseFloat(document.getElementById('pc_amount').value)
        };
        try {
            await safeFetch(pcId ? `${API_URL}/petty_cash/${pcId}` : `${API_URL}/petty_cash`, { 
                method: pcId ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(payload) 
            });
            showAlert(pcId ? "Transaction updated!" : "Transaction added!");
            closePcModal();
        } catch (err) { showAlert(err.message, true); }
    });
}

async function deletePettyCash(id) {
    if(!confirm("Delete transaction?")) return;
    try {
        await safeFetch(`${API_URL}/petty_cash/${id}`, { method: 'DELETE', headers: getHeaders() });
        showAlert("Transaction deleted");
        closePcDetailModal();
    } catch(err) { showAlert(err.message, true); }
}

async function renderAccountsTable() {
    try {
        const users = await safeFetch(`${API_URL}/users`, { headers: getHeaders() });
        const tbody = document.querySelector('#accounts-table tbody');
        if(!tbody) return;
        tbody.innerHTML = users.map(u => `
            <tr><td><strong>${u.email}</strong></td><td><span class="role-pill">${u.role}</span></td>
            <td class="hide-mobile">${new Date(u.created_at).toLocaleDateString()}</td>
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

window.onload = () => { 
    resetInactivityTimer();
    if(localStorage.getItem('token')) { initApp(); }
};
