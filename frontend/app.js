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
let alertTimeout; 

let viewModeBookings = 'upcoming';
let viewModeFinance = 'upcoming';
let financeFilterType = 'month';

const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
const formatTimestamp = (ts) => ts ? new Date(ts).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'}) : 'N/A';

function showAlert(msg, isError = false) {
    const alertBox = document.getElementById('alert-box');
    clearTimeout(alertTimeout);
    alertBox.textContent = msg;
    alertBox.className = `alert ${isError ? 'error' : ''}`;
    alertBox.classList.remove('hidden', 'closing');
    alertTimeout = setTimeout(() => {
        alertBox.classList.add('closing');
        setTimeout(() => { alertBox.classList.add('hidden'); alertBox.classList.remove('closing'); }, 200);
    }, 3000);
}

function closeModalAnim(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('closing');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('closing'); }, 200);
}

function getHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` }; }

async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.headers.get("content-type")?.includes("application/json")) throw new Error("API Route Error");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Server error");
        return data;
    } catch (err) { throw err; }
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (sessionStorage.getItem('token')) inactivityTimer = setTimeout(logout, 15 * 60 * 1000); 
}
document.onmousemove = resetInactivityTimer; document.onkeypress = resetInactivityTimer;
document.onclick = resetInactivityTimer; document.onscroll = resetInactivityTimer;

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = await safeFetch(`${API_URL}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
        });
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        initApp();
    } catch (err) { showAlert(err.message, true); }
});

function logout() { sessionStorage.clear(); window.location.reload(); }

function initApp() {
    currentToken = sessionStorage.getItem('token');
    if (!currentToken) return;
    currentUser = JSON.parse(sessionStorage.getItem('user'));
    document.getElementById('login-view').classList.add('hidden', 'closing');
    document.getElementById('app-view').classList.remove('hidden');
    if (currentUser.role !== 'Admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    initRealTime(); showSection('calendar'); resetInactivityTimer();
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
    if (active === 'accounts' && currentUser && currentUser.role === 'Admin') renderAccountsTable();
}

async function fetchAllBookings() { try { allBookings = await safeFetch(`${API_URL}/bookings`, { headers: getHeaders() }); } catch (err) {} }
async function fetchPettyCash() { try { allPettyCash = await safeFetch(`${API_URL}/petty_cash`, { headers: getHeaders() }); } catch (err) {} }

function isBookingRecent(dateStr, endTimeStr) { return new Date(`${dateStr.split('T')[0]}T${endTimeStr}`) < new Date(); }
function isBookingOngoing(dateStr, startStr, endStr) {
    const now = new Date();
    return now >= new Date(`${dateStr.split('T')[0]}T${startStr}`) && now <= new Date(`${dateStr.split('T')[0]}T${endStr}`);
}

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

function applyFinanceFilter() {
    financeFilterType = document.getElementById('finance-filter-type').value;
    if (financeFilterType === 'custom') {
        document.getElementById('finance-start').style.display = 'block';
        document.getElementById('finance-end').style.display = 'block';
    } else {
        document.getElementById('finance-start').style.display = 'none';
        document.getElementById('finance-end').style.display = 'none';
    }
    renderFinanceTable();
}

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
        initialView: 'dayGridMonth', height: isMobile ? 'auto' : '100%', contentHeight: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        editable: false, events: events,
        eventClick: (info) => { if(!isMobile) openDetailModal(info.event.extendedProps); },
        dateClick: (info) => { 
            if (isMobile) {
                if (lastClickedDate === info.dateStr) {
                    fullCalendarInstance.changeView('timeGridDay', info.dateStr);
                    lastClickedDate = null; return;
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
                            <div class="left-info"><span class="time">${b.start_time.substring(0,5)}</span><span class="client">${b.client_name}</span></div>
                            <div><span class="status-pill status-${b.status}">${b.status}</span></div>
                        </div>
                    `).join('');
                }
            } else { fullCalendarInstance.changeView('timeGridDay', info.dateStr); }
        }
    });
    fullCalendarInstance.render();
}

function renderListTable() {
    const tbody = document.querySelector('#bookings-table tbody');
    const ongoingContainer = document.getElementById('ongoing-session-container');
    if(!tbody) return;

    const ongoingBookings = allBookings.filter(b => isBookingOngoing(b.date, b.start_time, b.end_time));
    if (ongoingContainer) {
        if (ongoingBookings.length > 0) {
            ongoingContainer.innerHTML = ongoingBookings.map(b => `
                <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%); color: white; padding: 20px 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4); display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.4); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); flex-wrap: wrap; gap: 15px;" onclick="openDetailModalById(${b.id})">
                    <div style="flex: 1;">
                        <h3 style="color: rgba(255,255,255,0.95); font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                            <span class="live-dot"></span> CURRENT ONGOING SESSION
                        </h3>
                        <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${b.client_name}</div>
                        <div style="font-size: 14px; opacity: 0.95; font-weight: 500;">${b.start_time.substring(0,5)} - ${b.end_time.substring(0,5)} &nbsp;|&nbsp; ${b.customer_type}</div>
                    </div>
                    <div style="text-align: right; background: rgba(0,0,0,0.15); padding: 12px 20px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.2);">
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">Status</div>
                        <div style="font-weight: 800; padding: 6px 14px; background: #FFFFFF; color: #059669; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: inline-block;">${b.status}</div>
                    </div>
                </div>
            `).join('');
        } else { ongoingContainer.innerHTML = ''; }
    }

    let filtered = allBookings.filter(b => {
        const recent = isBookingRecent(b.date, b.end_time);
        return viewModeBookings === 'upcoming' ? !recent : recent;
    });

    if (viewModeBookings === 'recent') filtered.sort((a, b) => new Date(b.date.split('T')[0]+'T'+b.end_time) - new Date(a.date.split('T')[0]+'T'+a.end_time));
    else filtered.sort((a, b) => new Date(a.date.split('T')[0]+'T'+a.start_time) - new Date(b.date.split('T')[0]+'T'+b.start_time));

    if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: rgba(0,0,0,0.4); padding: 20px;">No ${viewModeBookings} bookings found.</td></tr>`; return; }

    tbody.innerHTML = filtered.map(b => {
        const isLive = isBookingOngoing(b.date, b.start_time, b.end_time);
        const liveBadge = isLive ? `<span style="background: #10B981; color: white; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; margin-left: 8px; vertical-align: middle; display: inline-block; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">LIVE</span>` : '';
        const rowHighlight = isLive ? `background-color: rgba(16, 185, 129, 0.08);` : '';
        return `
        <tr style="${rowHighlight}">
            <td>${b.date.split('T')[0]}</td>
            <td class="hide-mobile">${b.start_time.substring(0,5)}</td>
            <td><strong>${b.client_name}</strong> ${liveBadge}</td>
            <td class="hide-mobile">${b.customer_type}</td>
            <td class="hide-mobile text-green">${formatIDR(parseFloat(b.dp_paid) + parseFloat(b.settlement_paid))}</td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
            <td><button class="primary-btn" style="padding: 6px 12px" onclick="openDetailModalById(${b.id})">Detail</button></td>
        </tr>
    `}).join('');
}

// [UPDATED] Finance Table Generation & Filtering
function renderFinanceTable() {
    const tbody = document.querySelector('#finance-table tbody');
    if(!tbody) return;
    
    // 1. Flatten Bookings into explicit Transactions
    let transactions =[];
    allBookings.forEach(b => {
        if (parseFloat(b.dp_paid) > 0 || b.customer_type === 'Management') {
            transactions.push({ ...b, tx_date: b.dp_timestamp || b.date, tx_type: b.customer_type === 'Management' ? 'Mgmt Free' : 'Down Payment', tx_amount: parseFloat(b.dp_paid) });
        }
        if (parseFloat(b.settlement_paid) > 0) {
            transactions.push({ ...b, tx_date: b.full_timestamp || b.date, tx_type: 'Settlement', tx_amount: parseFloat(b.settlement_paid) });
        }
    });

    // 2. Filter by Time Mode
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let dateFiltered = transactions.filter(tx => {
        const txDate = new Date(tx.tx_date);
        if (financeFilterType === 'month') {
            return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
        } else if (financeFilterType === 'week') {
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            return txDate >= startOfWeek && txDate <= endOfWeek;
        } else if (financeFilterType === 'day') {
            return txDate.toDateString() === now.toDateString();
        } else if (financeFilterType === 'custom') {
            const startStr = document.getElementById('finance-start').value;
            const endStr = document.getElementById('finance-end').value;
            if (startStr && endStr) return txDate >= new Date(startStr) && txDate <= new Date(`${endStr}T23:59:59`);
            return true;
        }
        return true; 
    });

    // 3. Summary Cards (Only calculates from filtered matching bookings, avoiding double counts)
    let gross = 0, dp = 0, remain = 0;
    const uniqueIds = new Set();
    dateFiltered.forEach(tx => { 
        dp += tx.tx_amount;
        if (!uniqueIds.has(tx.id)) {
            uniqueIds.add(tx.id);
            gross += parseFloat(tx.total_price);
            remain += parseFloat(tx.remaining_payment);
        }
    });
    document.getElementById('fin-income').textContent = formatIDR(gross);
    document.getElementById('fin-dp').textContent = formatIDR(dp);
    document.getElementById('fin-remain').textContent = formatIDR(remain);

    // 4. View Mode Split (Upcoming vs Recent)
    let finalFiltered = dateFiltered.filter(tx => {
        const recent = isBookingRecent(tx.date, tx.end_time);
        return viewModeFinance === 'upcoming' ? !recent : recent;
    });

    if (viewModeFinance === 'recent') finalFiltered.sort((a, b) => new Date(b.tx_date) - new Date(a.tx_date));
    else finalFiltered.sort((a, b) => new Date(a.tx_date) - new Date(b.tx_date));

    if (finalFiltered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: rgba(0,0,0,0.4); padding: 20px;">No transactions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = finalFiltered.map(tx => `
        <tr>
            <td>${formatTimestamp(tx.tx_date).split(',')[0]}</td>
            <td><strong>${tx.client_name}</strong><br><span style="font-size: 12px; color: #666;">📞 ${tx.client_phone}</span></td>
            <td class="hide-mobile"><span class="role-pill" style="background: #EEF2FF; color: var(--primary-dark);">${tx.tx_type}</span></td>
            <td class="hide-mobile text-green">${formatIDR(tx.tx_amount)}</td>
            <td><span class="status-pill status-${tx.status}">${tx.status}</span></td>
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

// --- MODALS ---
function openPcDetailModalById(id) { const t = allPettyCash.find(x => x.id === id); if(t) openPcDetailModal(t); }
function openPcDetailModal(t) {
    document.getElementById('pc_det_date').textContent = t.date.split('T')[0];
    document.getElementById('pc_det_desc').textContent = t.description;
    const typeEl = document.getElementById('pc_det_type');
    typeEl.textContent = t.type;
    typeEl.style.background = t.type === 'IN' ? '#D1FAE5' : '#FEE2E2'; typeEl.style.color = t.type === 'IN' ? '#065F46' : '#991B1B';
    document.getElementById('pc_det_amount').textContent = formatIDR(t.amount);
    document.getElementById('pc_det_amount').className = t.type === 'IN' ? 'text-green text-lg' : 'text-red text-lg';
    document.getElementById('btn-edit-pc').onclick = () => openEditPcModal(t);
    document.getElementById('btn-del-pc').onclick = () => deletePettyCash(t.id);
    document.getElementById('pc-detail-modal').classList.remove('hidden', 'closing');
}
function closePcDetailModal() { closeModalAnim('pc-detail-modal'); }

function openPcModal() {
    document.getElementById('pc-form').reset();
    document.getElementById('pc_id').value = "";
    document.getElementById('pc-modal-title').textContent = "Add Petty Cash";
    document.getElementById('pc-modal').classList.remove('hidden', 'closing');
}
function openEditPcModal(t) {
    closePcDetailModal();
    document.getElementById('pc_id').value = t.id;
    document.getElementById('pc-modal-title').textContent = "Edit Petty Cash";
    document.getElementById('pc_date').value = t.date.split('T')[0];
    document.getElementById('pc_desc').value = t.description;
    document.getElementById('pc_type').value = t.type;
    document.getElementById('pc_amount').value = t.amount;
    document.getElementById('pc-modal').classList.remove('hidden', 'closing');
}
function closePcModal() { closeModalAnim('pc-modal'); }

async function withdrawPettyCash() {
    if(!confirm("Are you sure you want to withdraw all balance to 0?")) return;
    try {
        await safeFetch(`${API_URL}/petty_cash/reset`, { method: 'POST', headers: getHeaders() });
        showAlert("Balance withdrawn to 0!");
    } catch (err) { showAlert(err.message, true); }
}

function openDetailModalById(id) { const b = allBookings.find(x => x.id === id); if(b) openDetailModal(b); }
function openDetailModal(b) {
    if(document.getElementById('det_name')) document.getElementById('det_name').textContent = b.client_name;
    if(document.getElementById('det_type')) document.getElementById('det_type').textContent = b.customer_type;
    if(document.getElementById('det_phone')) document.getElementById('det_phone').textContent = b.client_phone;
    if(document.getElementById('det_email')) document.getElementById('det_email').textContent = b.client_email || "N/A"; 
    if(document.getElementById('det_date')) document.getElementById('det_date').textContent = b.date.split('T')[0];
    if(document.getElementById('det_time')) document.getElementById('det_time').textContent = `${b.start_time.substring(0,5)} to ${b.end_time.substring(0,5)}`;
    if(document.getElementById('det_total')) document.getElementById('det_total').textContent = formatIDR(b.total_price);
    
    // Updated Detail Modals to show exact payment breakdown
    if(document.getElementById('det_dp_ts')) document.getElementById('det_dp_ts').textContent = formatTimestamp(b.dp_timestamp);
    if(document.getElementById('det_full_ts')) document.getElementById('det_full_ts').textContent = formatTimestamp(b.full_timestamp);
    if(document.getElementById('det_dp')) document.getElementById('det_dp').textContent = formatIDR(b.dp_paid);
    if(document.getElementById('det_settlement')) document.getElementById('det_settlement').textContent = formatIDR(b.settlement_paid);
    
    if(document.getElementById('det_remain')) document.getElementById('det_remain').textContent = formatIDR(b.remaining_payment);
    if(document.getElementById('det_status')) {
        document.getElementById('det_status').textContent = b.status;
        document.getElementById('det_status').className = `status-pill status-${b.status}`;
    }
    if(document.getElementById('btn-edit-from-detail')) document.getElementById('btn-edit-from-detail').onclick = () => openEditModal(b);
    if(document.getElementById('delete-btn')) document.getElementById('delete-btn').onclick = () => deleteFromModal(b.id);
    document.getElementById('detail-modal').classList.remove('hidden', 'closing');
}
function closeDetailModal() { closeModalAnim('detail-modal'); }

function handleCustomerTypeChange() {
    const val = document.getElementById('customer_type').value;
    const priceSec = document.getElementById('price-section');
    if (val === 'Management') {
        priceSec.style.display = 'none';
        document.getElementById('total_price').value = 0;
        document.getElementById('dp_paid').value = 0;
        document.getElementById('total_price').removeAttribute('required');
        document.getElementById('dp_paid').removeAttribute('required');
        document.getElementById('settlement-section').classList.add('hidden');
    } else {
        priceSec.style.display = 'block';
        document.getElementById('total_price').setAttribute('required', 'true');
        document.getElementById('dp_paid').setAttribute('required', 'true');
    }
    calcRemaining();
}

function calcRemaining() {
    const p = parseFloat(document.getElementById('total_price').value) || 0;
    const dp = parseFloat(document.getElementById('dp_paid').value) || 0;
    const sett = parseFloat(document.getElementById('settlement_input').value) || 0;
    document.getElementById('remaining-text').textContent = formatIDR(p - (dp + sett));
}

function handleManualDP() { calcRemaining(); }

function markAsFullyPaid() {
    const p = parseFloat(document.getElementById('total_price').value) || 0;
    const dp = parseFloat(document.getElementById('dp_paid').value) || 0;
    const remain = p - dp;
    if (remain > 0) {
        document.getElementById('settlement_input').value = remain;
        calcRemaining();
    }
}

function openBookingModal() {
    document.getElementById('booking-form').reset();
    document.getElementById('booking_id').value = "";
    document.getElementById('modal-title').textContent = "New Booking";
    document.getElementById('price-section').style.display = 'block';
    document.getElementById('total_price').setAttribute('required', 'true');
    document.getElementById('dp_paid').setAttribute('required', 'true');
    document.getElementById('settlement-section').classList.add('hidden');
    calcRemaining();
    document.getElementById('booking-modal').classList.remove('hidden', 'closing');
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
    document.getElementById('settlement_input').value = parseFloat(b.settlement_paid) > 0 ? b.settlement_paid : '';

    if (b.customer_type === 'Management') {
        document.getElementById('price-section').style.display = 'none';
        document.getElementById('total_price').removeAttribute('required');
        document.getElementById('dp_paid').removeAttribute('required');
        document.getElementById('settlement-section').classList.add('hidden');
    } else {
        document.getElementById('price-section').style.display = 'block';
        document.getElementById('total_price').setAttribute('required', 'true');
        document.getElementById('dp_paid').setAttribute('required', 'true');
        if (b.status !== 'Paid' || parseFloat(b.settlement_paid) > 0) {
            document.getElementById('settlement-section').classList.remove('hidden');
        } else {
            document.getElementById('settlement-section').classList.add('hidden');
        }
    }
    calcRemaining();
    document.getElementById('booking-modal').classList.remove('hidden', 'closing');
}
function closeBookingModal() { closeModalAnim('booking-modal'); }

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
            dp_paid: parseFloat(document.getElementById('dp_paid').value) || 0,
            settlement_paid: parseFloat(document.getElementById('settlement_input').value) || 0
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

setInterval(() => {
    const activeEl = document.querySelector('.section:not(.hidden)');
    if (activeEl && activeEl.id === 'bookings-section') renderListTable();
}, 60000);

window.onload = () => { 
    resetInactivityTimer();
    if(sessionStorage.getItem('token')) { initApp(); }
};
function logout() { sessionStorage.clear(); window.location.reload(); }

function initApp() {
    currentToken = sessionStorage.getItem('token');
    if (!currentToken) return;

    currentUser = JSON.parse(sessionStorage.getItem('user'));
    document.getElementById('login-view').classList.add('hidden', 'closing');
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
    if (active === 'accounts' && currentUser && currentUser.role === 'Admin') renderAccountsTable();
}

async function fetchAllBookings() {
    try { allBookings = await safeFetch(`${API_URL}/bookings`, { headers: getHeaders() }); } catch (err) { console.error(err); }
}
async function fetchPettyCash() {
    try { allPettyCash = await safeFetch(`${API_URL}/petty_cash`, { headers: getHeaders() }); } catch (err) { console.error(err); }
}

function isBookingRecent(dateStr, endTimeStr) {
    const dateTimeStr = `${dateStr.split('T')[0]}T${endTimeStr}`;
    return new Date(dateTimeStr) < new Date(); 
}
function isBookingOngoing(dateStr, startStr, endStr) {
    const now = new Date();
    const start = new Date(`${dateStr.split('T')[0]}T${startStr}`);
    const end = new Date(`${dateStr.split('T')[0]}T${endStr}`);
    return now >= start && now <= end;
}

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

// [NEW] Finance Date Filter Logic
function applyFinanceFilter() {
    financeFilterType = document.getElementById('finance-filter-type').value;
    if (financeFilterType === 'custom') {
        document.getElementById('finance-start').style.display = 'block';
        document.getElementById('finance-end').style.display = 'block';
    } else {
        document.getElementById('finance-start').style.display = 'none';
        document.getElementById('finance-end').style.display = 'none';
    }
    renderFinanceTable();
}

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
                    fullCalendarInstance.changeView('timeGridDay', info.dateStr);
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
                fullCalendarInstance.changeView('timeGridDay', info.dateStr);
            }
        }
    });
    fullCalendarInstance.render();
}

function renderListTable() {
    const tbody = document.querySelector('#bookings-table tbody');
    const ongoingContainer = document.getElementById('ongoing-session-container');
    if(!tbody) return;

    const ongoingBookings = allBookings.filter(b => isBookingOngoing(b.date, b.start_time, b.end_time));
    if (ongoingContainer) {
        if (ongoingBookings.length > 0) {
            ongoingContainer.innerHTML = ongoingBookings.map(b => `
                <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%); color: white; padding: 20px 25px; border-radius: 20px; box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4); display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.4); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); flex-wrap: wrap; gap: 15px;" onclick="openDetailModalById(${b.id})">
                    <div style="flex: 1;">
                        <h3 style="color: rgba(255,255,255,0.95); font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                            <span class="live-dot"></span> CURRENT ONGOING SESSION
                        </h3>
                        <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${b.client_name}</div>
                        <div style="font-size: 14px; opacity: 0.95; font-weight: 500;">${b.start_time.substring(0,5)} - ${b.end_time.substring(0,5)} &nbsp;|&nbsp; ${b.customer_type}</div>
                    </div>
                    <div style="text-align: right; background: rgba(0,0,0,0.15); padding: 12px 20px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.2);">
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">Status</div>
                        <div style="font-weight: 800; padding: 6px 14px; background: #FFFFFF; color: #059669; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: inline-block;">${b.status}</div>
                    </div>
                </div>
            `).join('');
        } else {
            ongoingContainer.innerHTML = '';
        }
    }

    let filtered = allBookings.filter(b => {
        const recent = isBookingRecent(b.date, b.end_time);
        return viewModeBookings === 'upcoming' ? !recent : recent;
    });

    if (viewModeBookings === 'recent') {
        filtered.sort((a, b) => new Date(b.date.split('T')[0]+'T'+b.end_time) - new Date(a.date.split('T')[0]+'T'+a.end_time));
    } else {
        filtered.sort((a, b) => new Date(a.date.split('T')[0]+'T'+a.start_time) - new Date(b.date.split('T')[0]+'T'+b.start_time));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: rgba(0,0,0,0.4); padding: 20px;">No ${viewModeBookings} bookings found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        const isLive = isBookingOngoing(b.date, b.start_time, b.end_time);
        const liveBadge = isLive ? `<span style="background: #10B981; color: white; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; margin-left: 8px; vertical-align: middle; display: inline-block; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">LIVE</span>` : '';
        const rowHighlight = isLive ? `background-color: rgba(16, 185, 129, 0.08);` : '';

        return `
        <tr style="${rowHighlight}">
            <td>${b.date.split('T')[0]}</td>
            <td class="hide-mobile">${b.start_time.substring(0,5)} to ${b.end_time.substring(0,5)}</td>
            <td><strong>${b.client_name}</strong> ${liveBadge}</td>
            <td class="hide-mobile">${b.customer_type}</td>
            <td class="hide-mobile text-green">${formatIDR(b.dp_paid)}</td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
            <td><button class="primary-btn" style="padding: 6px 12px" onclick="openDetailModalById(${b.id})">Detail</button></td>
        </tr>
    `}).join('');
}

function renderFinanceTable() {
    const tbody = document.querySelector('#finance-table tbody');
    if(!tbody) return;
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Filter Logic based on Time Period
    let dateFiltered = allBookings.filter(b => {
        const bDate = new Date(b.date.split('T')[0]);
        if (financeFilterType === 'month') {
            return bDate.getMonth() === now.getMonth() && bDate.getFullYear() === now.getFullYear();
        } else if (financeFilterType === 'week') {
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            return bDate >= startOfWeek && bDate <= endOfWeek;
        } else if (financeFilterType === 'day') {
            return bDate.toDateString() === now.toDateString();
        } else if (financeFilterType === 'custom') {
            const startStr = document.getElementById('finance-start').value;
            const endStr = document.getElementById('finance-end').value;
            if (startStr && endStr) return bDate >= new Date(startStr) && bDate <= new Date(endStr);
            return true;
        }
        return true; // 'all'
    });

    // Calculate Summary ONLY for the filtered period
    let gross = 0, dp = 0, remain = 0;
    dateFiltered.forEach(b => { 
        gross += parseFloat(b.total_price); 
        dp += parseFloat(b.dp_paid); 
        remain += parseFloat(b.remaining_payment); 
    });

    document.getElementById('fin-income').textContent = formatIDR(gross);
    document.getElementById('fin-dp').textContent = formatIDR(dp);
    document.getElementById('fin-remain').textContent = formatIDR(remain);

    // Apply View Tab Filter (Upcoming / Recent)
    let finalFiltered = dateFiltered.filter(b => {
        const recent = isBookingRecent(b.date, b.end_time);
        return viewModeFinance === 'upcoming' ? !recent : recent;
    });

    if (viewModeFinance === 'recent') {
        finalFiltered.sort((a, b) => new Date(b.date.split('T')[0]+'T'+b.end_time) - new Date(a.date.split('T')[0]+'T'+a.end_time));
    } else {
        finalFiltered.sort((a, b) => new Date(a.date.split('T')[0]+'T'+a.start_time) - new Date(b.date.split('T')[0]+'T'+b.start_time));
    }

    if (finalFiltered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: rgba(0,0,0,0.4); padding: 20px;">No transactions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = finalFiltered.map(b => `
        <tr>
            <td>${b.date.split('T')[0]}</td>
            <td>${b.start_time.substring(0,5)} to ${b.end_time.substring(0,5)}</td>
            <td>
                <strong>${b.client_name}</strong><br>
                <span style="font-size: 12px; color: #666;">📞 ${b.client_phone}</span>
            </td>
            <td class="hide-mobile">${formatIDR(b.total_price)}</td>
            <td class="hide-mobile text-green">${formatIDR(b.dp_paid)}</td>
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

// --- PETTY CASH MODALS & ADMIN WITHDRAWAL ---
function openPcDetailModalById(id) { const t = allPettyCash.find(x => x.id === id); if(t) openPcDetailModal(t); }

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
    document.getElementById('pc-detail-modal').classList.remove('hidden', 'closing');
}

function closePcDetailModal() { closeModalAnim('pc-detail-modal'); }

function openPcModal() {
    document.getElementById('pc-form').reset();
    document.getElementById('pc_id').value = "";
    document.getElementById('pc-modal-title').textContent = "Add Petty Cash";
    document.getElementById('pc-modal').classList.remove('hidden', 'closing');
}

function openEditPcModal(t) {
    closePcDetailModal();
    document.getElementById('pc_id').value = t.id;
    document.getElementById('pc-modal-title').textContent = "Edit Petty Cash";
    document.getElementById('pc_date').value = t.date.split('T')[0];
    document.getElementById('pc_desc').value = t.description;
    document.getElementById('pc_type').value = t.type;
    document.getElementById('pc_amount').value = t.amount;
    document.getElementById('pc-modal').classList.remove('hidden', 'closing');
}

function closePcModal() { closeModalAnim('pc-modal'); }

async function withdrawPettyCash() {
    if(!confirm("Are you sure you want to withdraw all balance to 0?")) return;
    try {
        await safeFetch(`${API_URL}/petty_cash/reset`, { method: 'POST', headers: getHeaders() });
        showAlert("Balance withdrawn to 0!");
    } catch (err) { showAlert(err.message, true); }
}

// --- BOOKING MODALS & SETTLEMENT LOGIC ---
function openDetailModalById(id) { const b = allBookings.find(x => x.id === id); if(b) openDetailModal(b); }

function openDetailModal(b) {
    // Safety checks added to prevent crashing if HTML elements are missing
    if(document.getElementById('det_name')) document.getElementById('det_name').textContent = b.client_name;
    if(document.getElementById('det_type')) document.getElementById('det_type').textContent = b.customer_type;
    if(document.getElementById('det_phone')) document.getElementById('det_phone').textContent = b.client_phone;
    if(document.getElementById('det_email')) document.getElementById('det_email').textContent = b.client_email || "N/A"; 
    
    if(document.getElementById('det_date')) document.getElementById('det_date').textContent = b.date.split('T')[0];
    if(document.getElementById('det_time')) document.getElementById('det_time').textContent = `${b.start_time.substring(0,5)} to ${b.end_time.substring(0,5)}`;
    
    if(document.getElementById('det_total')) document.getElementById('det_total').textContent = formatIDR(b.total_price);
    
    // Formatting timestamps
    if(document.getElementById('det_dp_ts')) document.getElementById('det_dp_ts').textContent = formatTimestamp(b.dp_timestamp);
    if(document.getElementById('det_full_ts')) document.getElementById('det_full_ts').textContent = formatTimestamp(b.full_timestamp);

    if(document.getElementById('det_dp')) document.getElementById('det_dp').textContent = formatIDR(b.dp_paid);
    if(document.getElementById('det_remain')) document.getElementById('det_remain').textContent = formatIDR(b.remaining_payment);
    
    if(document.getElementById('det_status')) {
        document.getElementById('det_status').textContent = b.status;
        document.getElementById('det_status').className = `status-pill status-${b.status}`;
    }

    if(document.getElementById('btn-edit-from-detail')) document.getElementById('btn-edit-from-detail').onclick = () => openEditModal(b);
    if(document.getElementById('delete-btn')) document.getElementById('delete-btn').onclick = () => deleteFromModal(b.id);
    
    document.getElementById('detail-modal').classList.remove('hidden', 'closing');
}

function closeDetailModal() { closeModalAnim('detail-modal'); }

function handleCustomerTypeChange() {
    const val = document.getElementById('customer_type').value;
    const priceSec = document.getElementById('price-section');
    if (val === 'Management') {
        priceSec.style.display = 'none';
        document.getElementById('total_price').value = 0;
        document.getElementById('dp_paid').value = 0;
        document.getElementById('total_price').removeAttribute('required');
        document.getElementById('dp_paid').removeAttribute('required');
        document.getElementById('settlement-section').classList.add('hidden');
    } else {
        priceSec.style.display = 'block';
        document.getElementById('total_price').setAttribute('required', 'true');
        document.getElementById('dp_paid').setAttribute('required', 'true');
    }
    calcRemaining();
}

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
    document.getElementById('price-section').style.display = 'block';
    document.getElementById('total_price').setAttribute('required', 'true');
    document.getElementById('dp_paid').setAttribute('required', 'true');
    document.getElementById('settlement-section').classList.add('hidden');

    calcRemaining();
    document.getElementById('booking-modal').classList.remove('hidden', 'closing');
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

    if (b.customer_type === 'Management') {
        document.getElementById('price-section').style.display = 'none';
        document.getElementById('total_price').removeAttribute('required');
        document.getElementById('dp_paid').removeAttribute('required');
        document.getElementById('settlement-section').classList.add('hidden');
    } else {
        document.getElementById('price-section').style.display = 'block';
        document.getElementById('total_price').setAttribute('required', 'true');
        document.getElementById('dp_paid').setAttribute('required', 'true');
        
        if (b.status !== 'Paid') {
            document.getElementById('settlement-section').classList.remove('hidden');
        } else {
            document.getElementById('settlement-section').classList.add('hidden');
        }
    }

    calcRemaining();
    document.getElementById('booking-modal').classList.remove('hidden', 'closing');
}

function closeBookingModal() { closeModalAnim('booking-modal'); }

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

setInterval(() => {
    const activeEl = document.querySelector('.section:not(.hidden)');
    if (activeEl && activeEl.id === 'bookings-section') renderListTable();
}, 60000);

window.onload = () => { 
    resetInactivityTimer();
    if(sessionStorage.getItem('token')) { initApp(); }
};
