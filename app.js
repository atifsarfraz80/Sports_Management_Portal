// for mobile only
function toggleMobileMenu() {
    const nav = $('#mainNav');
    nav.classList.toggle('mobile-active');
}


const originalShowPage = showPage;
showPage = function(pageId) {
    originalShowPage(pageId); 
    const nav = $('#mainNav');
    if (nav.classList.contains('mobile-active')) {
        nav.classList.remove('mobile-active');
    }
};


// GLOBAL APP STATE


const APP_DATA = {
    events: [],
    teams: [],
    sports: [],
    matches: [],
    myMatches: [],
    points: [],
    pendingTeams: [],
    venues: [],
    currentUser: null,
    token: localStorage.getItem('authToken') || null,
    activeEvent: null,
    sportPositions: {},
    registrationStatus: null  
};

// HELPER FUNCTIONS


const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function showPage(pageId) {
    $$('.page').forEach(p => p.classList.add('hidden'));
    const page = $('#' + pageId);
    if (page) page.classList.remove('hidden');
    $$('.topnav .navlink').forEach(a => a.classList.remove('active'));
    $$('.topnav .navlink').forEach(a => { 
        if (a.dataset.page === pageId) a.classList.add('active'); 
    });
    window.scrollTo(0, 0);
}

function showError(elementId, message) {
    const el = $(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
    }
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Loading states for API calls
function showLoading(show = true) {
    const loader = $('#globalLoader');
    if (loader) {
        loader.classList.toggle('hidden', !show);
    }
}

// Confirmation dialogs for destructive actions
function confirmAction(message) {
    return confirm(message);
}


// API CONFIGURATION 

const API_BASE_URL = 'https://sports-management-portal-kma6.onrender.com/api';

async function apiCall(endpoint, options = {}) {
    const headers = {};
    
    // Only add Content-Type for non-FormData
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    
    if (APP_DATA.token && !options.noAuth) {
        headers['Authorization'] = `Bearer ${APP_DATA.token}`;
    }
    
    // Merge with any additional headers
    Object.assign(headers, options.headers || {});
    
    // Show loading for all API calls except background fetches
    if (!options.silent) {
        showLoading(true);
    }
    
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log('API Call:', url);
        
        const fetchOptions = {
            method: options.method || 'GET',
            headers: headers
        };
        
        // Handle body properly - don't double-stringify
        if (options.body) {
            if (options.body instanceof FormData) {
                fetchOptions.body = options.body;
            } else if (typeof options.body === 'string') {
                fetchOptions.body = options.body;
            } else {
                fetchOptions.body = JSON.stringify(options.body);
            }
        }
        
        const response = await fetch(url, fetchOptions);
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showSuccess('Error: ' + error.message);
        throw error;
    } finally {
        if (!options.silent) {
            showLoading(false);
        }
    }
}

// AUTHENTICATION FUNCTIONS


function switchAuthTab(tab) {
    if (tab === 'login') {
        $('#loginForm').classList.remove('hidden');
        $('#signupForm').classList.add('hidden');
        $('#tabLogin').classList.add('active');
        $('#tabSignup').classList.remove('active');
    } else {
        $('#loginForm').classList.add('hidden');
        $('#signupForm').classList.remove('hidden');
        $('#tabLogin').classList.remove('active');
        $('#tabSignup').classList.add('active');
    }
}

async function signupUser() {
    const username = $('#signupUsername').value.trim();
    const email = $('#signupEmail').value.trim();
    const password = $('#signupPassword').value;
    
    if (!username || !email || !password) {
        showError('#signupError', 'Please fill all fields');
        return;
    }
    
    if (username.length < 3) {
        showError('#signupError', 'Username must be at least 3 characters');
        return;
    }
    
    if (password.length < 6) {
        showError('#signupError', 'Password must be at least 6 characters');
        return;
    }
    
    try {
        const result = await apiCall('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
            noAuth: true
        });
        
        showSuccess(result.message);
        switchAuthTab('login');
        $('#loginEmail').value = email;
        
        $('#signupUsername').value = '';
        $('#signupEmail').value = '';
        $('#signupPassword').value = '';
    } catch (error) {
        showError('#signupError', error.message);
    }
}

async function loginUser() {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    
    if (!email || !password) {
        showError('#loginError', 'Please fill all fields');
        return;
    }
    
    try {
        const result = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            noAuth: true
        });
        
        APP_DATA.token = result.token;
        APP_DATA.currentUser = result.user;
        localStorage.setItem('authToken', result.token);
        
        updateUIForLoggedInUser();
        showSuccess(`Welcome back, ${result.user.username}!`);
        
        if (result.user.role === 'admin') {
            showPage('adminDashboard');
        } else {
            showPage('managerDashboard');
        }
        
        await loadAllDataAndRenderUI();
    } catch (error) {
        showError('#loginError', error.message);
    }
}

//  Confirmation for logout
function logoutUser() {
    if (!confirmAction('Are you sure you want to logout?')) {
        return;
    }
    
    APP_DATA.token = null;
    APP_DATA.currentUser = null;
    localStorage.removeItem('authToken');
    updateUIForLoggedOutUser();
    showPage('home');
    showSuccess('Logged out successfully');
}

function updateUIForLoggedInUser() {
    $$('.navlink.auth').forEach(el => el.classList.add('hidden'));
    $$('.navlink.role').forEach(el => el.classList.remove('hidden'));
    
    if (APP_DATA.currentUser.role === 'admin') {
        $('#navAdmin').classList.remove('hidden');
        $('#navManager').classList.add('hidden');
    } else {
        $('#navManager').classList.remove('hidden');
        $('#navAdmin').classList.add('hidden');
    }
    
    updateHeroCTAs();
    updateEventsButton();
    updateActionButtons();
    updateUserInfoDisplay();
}

function updateUIForLoggedOutUser() {
    $$('.navlink.auth').forEach(el => el.classList.remove('hidden'));
    $$('.navlink.role').forEach(el => el.classList.add('hidden'));
    updateHeroCTAs();
    updateEventsButton();
    updateActionButtons();
    hideUserInfoDisplay();
}

// USER INFO DISPLAY


function updateUserInfoDisplay() {
    if (!APP_DATA.currentUser) {
        hideUserInfoDisplay();
        return;
    }
    
    const managerInfo = $('#managerUserInfo');
    const adminInfo = $('#adminUserInfo');
    
    const roleDisplay = APP_DATA.currentUser.role === 'admin' ? 
        '<span class="role-badge admin">Administrator</span>' : 
        '<span class="role-badge manager">Team Manager</span>';
    
    const infoHTML = `
        <div class="user-info-card">
            <div class="user-avatar">${APP_DATA.currentUser.username.charAt(0).toUpperCase()}</div>
            <div class="user-details">
                <h3>Welcome, ${APP_DATA.currentUser.username}! 👋</h3>
                <p class="user-email">${APP_DATA.currentUser.email}</p>
                ${roleDisplay}
            </div>
        </div>
    `;
    
    if (APP_DATA.currentUser.role === 'manager' && managerInfo) {
        managerInfo.innerHTML = infoHTML;
        managerInfo.classList.remove('hidden');
    } else if (APP_DATA.currentUser.role === 'admin' && adminInfo) {
        adminInfo.innerHTML = infoHTML;
        adminInfo.classList.remove('hidden');
    }
}

function hideUserInfoDisplay() {
    const managerInfo = $('#managerUserInfo');
    const adminInfo = $('#adminUserInfo');
    
    if (managerInfo) managerInfo.classList.add('hidden');
    if (adminInfo) adminInfo.classList.add('hidden');
}

async function checkAuthStatus() {
    if (APP_DATA.token) {
        try {
            const user = await apiCall('/auth/me', { silent: true });
            APP_DATA.currentUser = user;
            updateUIForLoggedInUser();
            updateUserInfoDisplay();
        } catch (error) {
            console.error('Auth check failed:', error);
            // Clear invalid token
            APP_DATA.token = null;
            APP_DATA.currentUser = null;
            localStorage.removeItem('authToken');
            updateUIForLoggedOutUser();
            // Don't show error message on page load - just silently log out
        }
    } else {
        updateUIForLoggedOutUser();
    }
}




// UI UPDATES BASED ON ROLE


function updateHeroCTAs() {
    const cta2 = $('#heroCTA2');
    
    if (!APP_DATA.currentUser) {
        cta2.textContent = 'Register a Team';
        cta2.onclick = () => showPage('auth');
    } else if (APP_DATA.currentUser.role === 'manager') {
        cta2.textContent = 'Dashboard';
        cta2.onclick = () => showPage('managerDashboard');
    } else {
        cta2.textContent = 'Dashboard';
        cta2.onclick = () => showPage('adminDashboard');
    }
}

function updateEventsButton() {
    const btn = $('#homeEventsBtn');
    if (btn) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
            btn.textContent = 'Manage Events';
        } else {
            btn.textContent = 'View Events';
        }
    }
}

function updateActionButtons() {
    // Events page actions
    const eventsActions = $('#eventsActions');
    if (eventsActions) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
            eventsActions.innerHTML = '<button class="btn" onclick="openModal(\'modal-add-event\')">Add Event</button>';
        } else {
            eventsActions.innerHTML = '';
        }
    }
    
    // Sports page actions
    const sportsActions = $('#sportsActions');
    if (sportsActions) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
            sportsActions.innerHTML = '<button class="btn" onclick="openModal(\'modal-add-sport\')">Add Sport</button>';
        } else {
            sportsActions.innerHTML = '';
        }
    }
    
    // Teams page actions
    const teamsActions = $('#teamsActions');
    if (teamsActions) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'manager') {
            teamsActions.innerHTML = '<button class="btn" onclick="openRegisterTeamModal()">Register Team</button>';
        } else {
            teamsActions.innerHTML = '';
        }
    }
    
    // Matches page actions
    const matchesActions = $('#matchesActions');
    if (matchesActions) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
        matchesActions.innerHTML = `<button class="btn" onclick="openModal('modal-schedule-match')">Schedule Match</button>`;
    } else {
        matchesActions.innerHTML = '';
    }
}
    
    // Match view filter
    const matchFilter = $('#matchViewFilter');
    if (matchFilter) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'manager') {
            matchFilter.classList.remove('hidden');
        } else {
            matchFilter.classList.add('hidden');
        }
    }
}


// DATA FETCHING FUNCTIONS

async function fetchEvents() {
    try {
        APP_DATA.events = await apiCall('/events', { noAuth: true, silent: true });
        console.log('✅ Events loaded:', APP_DATA.events.length);
    } catch (err) {
        console.error('❌ Events fetch failed:', err);
        APP_DATA.events = [];
    }
}

async function fetchActiveEvent() {
    try {
        APP_DATA.activeEvent = await apiCall('/events/active/current', { noAuth: true, silent: true });
        console.log('✅ Active event:', APP_DATA.activeEvent?.event_name || 'None');
        updateActiveEventBanner();
    } catch (err) {
        console.error('❌ Active event fetch failed:', err);
        APP_DATA.activeEvent = null;
        updateActiveEventBanner();
    }
}

// Fetch teams filtered by active event
async function fetchTeams() {
    try {
        let endpoint = '/teams';
        if (APP_DATA.activeEvent) {
            endpoint += `?event_id=${APP_DATA.activeEvent.event_id}`;
        }
        APP_DATA.teams = await apiCall(endpoint, { noAuth: true, silent: true });
        console.log('✅ Teams loaded:', APP_DATA.teams.length);
    } catch (err) {
        console.error('❌ Teams fetch failed:', err);
        APP_DATA.teams = [];
    }
}

async function fetchSports() {
    try {
        APP_DATA.sports = await apiCall('/sports', { noAuth: true, silent: true });
        console.log('✅ Sports loaded:', APP_DATA.sports.length);
    } catch (err) {
        console.error('❌ Sports fetch failed:', err);
        APP_DATA.sports = [];
    }
}

// Fetch matches filtered by active event
async function fetchMatches() {
    try {
        let endpoint = '/matches';
        if (APP_DATA.activeEvent) {
            endpoint += `?event_id=${APP_DATA.activeEvent.event_id}`;
        }
        APP_DATA.matches = await apiCall(endpoint, { noAuth: true, silent: true });
        console.log('✅ Matches loaded:', APP_DATA.matches.length);
        
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'manager') {
            APP_DATA.myMatches = await apiCall('/matches/my', { silent: true });
            console.log('✅ My matches loaded:', APP_DATA.myMatches.length);
        }
    } catch (err) {
        console.error('❌ Matches fetch failed:', err);
        APP_DATA.matches = [];
        APP_DATA.myMatches = [];
    }
}

// Fetch points filtered by active event
async function fetchPoints() {
    try {
        let endpoint = '/points';
        if (APP_DATA.activeEvent) {
            endpoint += `?event_id=${APP_DATA.activeEvent.event_id}`;
        }
        APP_DATA.points = await apiCall(endpoint, { noAuth: true, silent: true });
        console.log('✅ Points loaded:', APP_DATA.points.length);
    } catch (err) {
        console.error('❌ Points fetch failed:', err);
        APP_DATA.points = [];
    }
}

async function fetchPendingTeams() {
    if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
        try {
            APP_DATA.pendingTeams = await apiCall('/teams/pending', { silent: true });
            console.log('✅ Pending teams loaded:', APP_DATA.pendingTeams.length);
        } catch (err) {
            console.error('❌ Pending teams fetch failed:', err);
            APP_DATA.pendingTeams = [];
        }
    }
}

async function fetchVenues() {
    try {
        APP_DATA.venues = await apiCall('/venues', { noAuth: true, silent: true });
        console.log('✅ Venues loaded:', APP_DATA.venues.length);
    } catch (err) {
        console.error('❌ Venues fetch failed:', err);
        APP_DATA.venues = [];
    }
}

// RENDERING FUNCTIONS




//  updateActiveEventBanner 

function updateActiveEventBanner() {
    const banner = $('#activeEventBanner');
    const nameSpan = $('#activeEventName');
    
    if (!banner || !nameSpan) return;
    
    console.log('Updating active event banner, checking events:', APP_DATA.events.length);
    
    // Priority 1: Active event
    const activeEvent = APP_DATA.events.find(e => e.status === 'active');
    
    // Priority 2: Registration open event with open status
    const regOpenEvent = APP_DATA.events.find(e => 
        e.status === 'registration_open' && e.registration_status === 'open'
    );
    
    const displayEvent = activeEvent || regOpenEvent;
    
    console.log('Active event:', activeEvent);
    console.log('Reg open event:', regOpenEvent);
    console.log('Display event:', displayEvent);
    
    if (displayEvent) {
        let statusText = '';
        
        if (displayEvent.status === 'active') {
            statusText = '🏆 Current Event';
        } else if (displayEvent.status === 'registration_open') {
            if (displayEvent.registration_status === 'open') {
                statusText = '🎯 Registrations Open';
            } else if (displayEvent.registration_status === 'closed') {
                // Don't show closed registration events in banner
                banner.classList.add('hidden');
                APP_DATA.activeEvent = null;
                hideRegistrationBanner();
                return;
            } else {
                statusText = '📅 Registrations Coming Soon';
            }
        }
        
        nameSpan.textContent = `${statusText}: ${displayEvent.event_name}`;
        banner.classList.remove('hidden');
        
        APP_DATA.activeEvent = displayEvent;
        
        if (displayEvent.status === 'registration_open' && displayEvent.registration_status === 'open') {
            updateRegistrationBanner();
        } else {
            hideRegistrationBanner();
        }
    } else {
        console.log('No active/registration_open event found, hiding banner');
        banner.classList.add('hidden');
        APP_DATA.activeEvent = null;
        hideRegistrationBanner();
    }
}


function updateRegistrationBanner() {
    const regBanner = $('#registrationBanner');
    const regStatus = $('#registrationStatus');
    
    console.log('Updating registration banner for event:', APP_DATA.activeEvent);
    
    if (!regBanner || !APP_DATA.activeEvent) {
        if (regBanner) {
            console.log('No banner element or active event, hiding');
            regBanner.classList.add('hidden');
        }
        return;
    }
    
    const event = APP_DATA.activeEvent;
    
    if (!event.registration_start_date || !event.registration_end_date) {
        console.log('No registration dates, hiding banner');
        regBanner.classList.add('hidden');
        return;
    }
    
    // Only show banner if event has registration_open status AND status is 'open'
    if (event.status !== 'registration_open' || event.registration_status !== 'open') {
        console.log('Registration not open, hiding banner. Status:', event.status, 'Reg status:', event.registration_status);
        regBanner.classList.add('hidden');
        return;
    }
    
    console.log('Showing registration banner - registrations are OPEN');
    regBanner.classList.remove('hidden');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(event.registration_end_date);
    endDate.setHours(23, 59, 59, 999);
    
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    
    let deadlineText = '';
    if (daysLeft <= 0) {
        deadlineText = '<span class="urgent-badge">⏰ Last day to register!</span>';
    } else if (daysLeft <= 3) {
        deadlineText = `<span class="urgent-badge">⏰ ${daysLeft} day${daysLeft > 1 ? 's' : ''} left!</span>`;
    } else {
        deadlineText = `${daysLeft} day${daysLeft > 1 ? 's' : ''} remaining`;
    }
    
    const statusHTML = `
        <div class="reg-banner-content status-open">
            <span class="reg-icon">✅</span>
            <div class="reg-text">
                <strong>Team Registrations Open!</strong>
                <p>Deadline: ${formatDate(event.registration_end_date)} • ${deadlineText}</p>
            </div>
            ${APP_DATA.currentUser && APP_DATA.currentUser.role === 'manager' ? 
                '<button class="btn primary" onclick="openRegisterTeamModal()">Register Now</button>' : ''}
        </div>
    `;
    
    regStatus.innerHTML = statusHTML;
}

function hideRegistrationBanner() {
    const regBanner = $('#registrationBanner');
    if (regBanner) regBanner.classList.add('hidden');
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}


// REGISTRATION PERIOD MANAGEMENT

async function openRegistrationDatesModal(eventId) {
    try {
        const event = await apiCall(`/events/${eventId}`, { silent: true });
        
        if (!event) {
            showSuccess('Event not found');
            return;
        }
        
        document.querySelectorAll('#modal-registration-dates').forEach(m => m.remove());
        
        const modal = document.createElement('div');
        modal.id = 'modal-registration-dates';
        modal.className = 'modal';
        
        const today = new Date().toISOString().split('T')[0];
        const eventStartDate = event.start_date;
        
        const formatDisplayDate = (dateStr) => {
            if (!dateStr) return 'Not set';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { 
                weekday: 'short',
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        };
        
        modal.innerHTML = `
            <div class="modal-inner card">
                <div class="modal-head">
                    <h3>Manage Registration Period</h3>
                    <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="background: #eff6ff; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                        <strong>📅 Event:</strong> ${event.event_name}<br>
                        <strong>📍 Dates:</strong> ${formatDisplayDate(event.start_date)} to ${formatDisplayDate(event.end_date)}
                    </div>
                    
                    ${event.registration_start_date ? `
                        <div style="background: #fef3c7; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                            <strong>Current Registration Period:</strong><br>
                            <strong>Opens:</strong> ${formatDisplayDate(event.registration_start_date)}<br>
                            <strong>Closes:</strong> ${formatDisplayDate(event.registration_end_date)}<br>
                            <strong>Status:</strong> 
                            <span style="text-transform: uppercase; font-weight: 600; color: ${
                                event.registration_status === 'open' ? '#10b981' : 
                                event.registration_status === 'not_started' ? '#ff9a00' : '#ef4444'
                            }">
                                ${event.registration_status === 'open' ? '✅ OPEN' : 
                                  event.registration_status === 'not_started' ? '📅 NOT STARTED' : '🔒 CLOSED'}
                            </span>
                        </div>
                    ` : ''}
                    
                    <label>Registration Start Date <span class="required">*</span></label>
                    <input id="regStartDate" type="date" 
                           value="${event.registration_start_date || today}" 
                           min="${today}" required />
                    <p class="muted small">Registrations will open automatically on this date</p>
                    
                    <label>Registration End Date <span class="required">*</span></label>
                    <input id="regEndDate" type="date" 
                           value="${event.registration_end_date || ''}" 
                           required />
                    <p class="muted small">Registrations will close automatically on this date (must be before event starts: ${formatDisplayDate(eventStartDate)})</p>
                    
                    <div style="background: #eff6ff; padding: 12px; border-radius: 6px; margin-top: 16px;">
                        <strong>ℹ️ Automatic Registration Management:</strong>
                        <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                            <li>Registrations will open/close automatically based on these dates</li>
                            <li>You can activate the event after registrations close</li>
                            <li>Teams can only register during the open period</li>
                        </ul>
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn primary" onclick="saveRegistrationDates(${eventId})">
                        ${event.registration_start_date ? 'Update Dates' : 'Set Registration Period'}
                    </button>
                    <button class="btn ghost" onclick="this.closest('.modal').remove(); closeAllModals()">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        openModal('modal-registration-dates');
        
        const startInput = $('#regStartDate');
        const endInput = $('#regEndDate');
        
        startInput.addEventListener('change', () => {
            endInput.min = startInput.value;
            if (endInput.value && endInput.value < startInput.value) {
                endInput.value = '';
            }
        });
        
    } catch (error) {
        showSuccess('Error loading event: ' + error.message);
    }
}

// Update your saveRegistrationDates function in app.js
async function saveRegistrationDates(eventId) {
    const regStartDate = $('#regStartDate').value;
    const regEndDate = $('#regEndDate').value;
    
    // Existing basic checks...
    if (regEndDate < regStartDate) {
        showSuccess('Error: Registration end date cannot be before start date');
        return;
    }

    try {
        const result = await apiCall(`/events/${eventId}`, {
            method: 'PUT',
            body: { registration_start_date: regStartDate, registration_end_date: regEndDate }
        });
        
        showSuccess(result.message);
        // ... rest of your UI refresh logic ...
    } catch (error) {
        // This will now catch the "Clash detected" error from the backend
        showSuccess(error.message); 
    }
}

async function reopenRegistrations(eventId) {
    try {
        const event = await apiCall(`/events/${eventId}`, { silent: true });
        
        if (!event) {
            showSuccess('Event not found');
            return;
        }
        
        const today = new Date();
        const eventStart = new Date(event.start_date);
        
        if (today >= eventStart) {
            showSuccess('Cannot reopen registrations after event has started');
            return;
        }
        
        // Remove existing modal if any
        document.querySelectorAll('#modal-reopen-registrations').forEach(m => m.remove());
        
        const modal = document.createElement('div');
        modal.id = 'modal-reopen-registrations';
        modal.className = 'modal';
        
        const todayStr = new Date().toISOString().split('T')[0];
        const maxEndDate = new Date(event.start_date);
        maxEndDate.setDate(maxEndDate.getDate() - 1);
        const maxEndDateStr = maxEndDate.toISOString().split('T')[0];
        
        modal.innerHTML = `
            <div class="modal-inner card">
                <div class="modal-head">
                    <h3>🔄 Reopen Registrations</h3>
                    <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="background: #fef3c7; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                        <strong>📅 Event:</strong> ${event.event_name}<br>
                        <strong>📍 Event Dates:</strong> ${event.start_date} to ${event.end_date}<br>
                        <strong>Previous Registration Period:</strong> ${event.registration_start_date} to ${event.registration_end_date}
                    </div>
                    
                    <label>New Registration Start Date <span class="required">*</span></label>
                    <input id="reopenStartDate" type="date" 
                           value="${todayStr}" 
                           min="${todayStr}" 
                           max="${maxEndDateStr}" required />
                    <p class="muted small">Can start immediately or in the future</p>
                    
                    <label>New Registration End Date <span class="required">*</span></label>
                    <input id="reopenEndDate" type="date" 
                           min="${todayStr}"
                           max="${maxEndDateStr}" required />
                    <p class="muted small">Must be before event starts (${event.start_date})</p>
                    
                    <div style="background: #eff6ff; padding: 12px; border-radius: 6px; margin-top: 16px;">
                        <strong>📧 Notifications:</strong>
                        <p style="margin: 8px 0 0 0;">All managers with teams in this event will be notified about the reopened registrations.</p>
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn primary" onclick="submitReopenRegistrations(${eventId})">Reopen Registrations</button>
                    <button class="btn ghost" onclick="this.closest('.modal').remove(); closeAllModals()">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        openModal('modal-reopen-registrations');
        
        // Auto-adjust end date min based on start date
        const startInput = $('#reopenStartDate');
        const endInput = $('#reopenEndDate');
        
        startInput.addEventListener('change', () => {
            endInput.min = startInput.value;
            if (endInput.value && endInput.value <= startInput.value) {
                endInput.value = '';
            }
        });
        
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function submitReopenRegistrations(eventId) {
    const startDate = $('#reopenStartDate').value;
    const endDate = $('#reopenEndDate').value;
    
    if (!startDate || !endDate) {
        showSuccess('Both dates are required');
        return;
    }
    
    if (endDate <= startDate) {
        showSuccess('End date must be after start date');
        return;
    }
    
    if (!confirmAction('Reopen registrations? All managers will be notified.')) {
        return;
    }
    
    try {
        // FIXED: Remove /api/ prefix
        const result = await apiCall(`/events/${eventId}/reopen-registrations`, {
            method: 'POST',
            body: { registration_start_date: startDate, registration_end_date: endDate }
        });
        
        showSuccess(result.message);
        document.querySelector('#modal-reopen-registrations')?.remove();
        closeAllModals();
        
        await fetchEvents();
        await fetchActiveEvent();
        renderEvents();
        updateActiveEventBanner();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function manuallyCloseRegistrations(eventId) {
    if (!confirmAction('Close registrations now? Teams will no longer be able to register.')) {
        return;
    }
    
    try {
        const result = await apiCall(`/events/${eventId}/close-registrations`, {
            method: 'POST'
        });
        
        showSuccess(result.message);
        document.querySelector('#modal-registration-dates')?.remove();
        closeAllModals();
        
        // CRITICAL FIX: Force reload data
        await Promise.all([
            fetchEvents(),
            fetchActiveEvent()
        ]);
        
        renderEvents();
        updateActiveEventBanner();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function openRegistrationsForEvent(eventId) {
    try {
        const result = await apiCall(`/events/${eventId}/open-registrations`, {
            method: 'POST'
        });
        
        showSuccess(result.message);
        await fetchEvents();
        await fetchActiveEvent();
        renderEvents();
        updateActiveEventBanner();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}


async function closeRegistrationsForEvent(eventId) {
    try {
        // Check for pending teams first
        const pendingTeams = await apiCall(`/teams/pending`, { silent: true });
        const eventPendingTeams = pendingTeams.filter(t => t.event_id == eventId);
        
        if (eventPendingTeams.length > 0) {
            showSuccess(`Cannot close registrations. ${eventPendingTeams.length} team registration${eventPendingTeams.length > 1 ? 's are' : ' is'} still pending. Please approve or reject all teams before closing registrations.`);
            return;
        }
        
        if (!confirmAction('Close registrations for this event? Teams will no longer be able to register. After closing, you can activate the event to start matches.')) {
            return;
        }
        
        const result = await apiCall(`/events/${eventId}/close-registrations`, {
            method: 'POST'
        });
        
        showSuccess(result.message);
        
        // CRITICAL: Force complete reload of ALL event data
        console.log('Reloading all data after closing registrations...');
        
        await Promise.all([
            fetchEvents(),
            fetchActiveEvent(),
            fetchTeams(),
            fetchMatches(),
            fetchPendingTeams()
        ]);
        
        console.log('Data reloaded, re-rendering UI...');
        
        // Force re-render EVERYTHING
        renderEvents();
        updateActiveEventBanner();
        updateRegistrationBanner();
        renderTeams();
        
        // Update admin dashboard if admin
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
            await updateAdminDashboard();
        }
        
        console.log('UI updated successfully');
    } catch (error) {
        console.error('Error in closeRegistrationsForEvent:', error);
        showSuccess('Error: ' + error.message);
    }
}



//  renderEvents 

function renderEvents() {
    const statEvents = $('#stat-events');
    if (statEvents) statEvents.textContent = APP_DATA.events.length;

    const container = $('#eventsList');
    if (!container) return;
    container.innerHTML = '';
    
    if (!APP_DATA.events.length) {
        container.innerHTML = '<p class="muted">No events found.</p>';
        return;
    }
    
    APP_DATA.events.forEach(ev => {
        console.log(`Rendering event: ${ev.event_name}, status: ${ev.status}, reg_status: ${ev.registration_status}`);
        
        const card = document.createElement('div');
        card.className = 'card mb-4';
        
        const statusColors = {
            'registration_open': '#ff9a00',
            'active': '#10b981',
            'planned': '#0078ff',
            'completed': '#6b7280'
        };

        const statusLabels = {
            'registration_open': 'REGISTRATIONS OPEN',
            'active': 'ACTIVE',
            'planned': 'PLANNED',
            'completed': 'COMPLETED'
        };
        
        // Main status badge
        let mainStatusColor = statusColors[ev.status];
        let mainStatusLabel = statusLabels[ev.status] || ev.status.toUpperCase();
        
        // Override display for closed registrations
        if (ev.status === 'registration_open' && ev.registration_status === 'closed') {
            mainStatusColor = '#6b7280';
            mainStatusLabel = 'REG CLOSED';
        }
        
        // Additional badge ONLY for currently OPEN registrations
        let additionalBadge = '';
        if (ev.status === 'registration_open' && ev.registration_status === 'open') {
            additionalBadge = `
                <span style="background: #10b981; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px;">
                    ✅ OPEN NOW
                </span>
            `;
        }
        
        // SIMPLIFIED Admin action buttons
        let adminButtons = '';
        
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
            if (ev.status === 'completed') {
                adminButtons = `
                    <button class="btn primary" style="margin-top: 8px; background: #ff9a00;" onclick="reopenCompletedEvent(${ev.event_id})">🔄 Reopen Event</button>
                `;
            } else if (ev.status === 'active') {
                adminButtons = `
                    <button class="btn ghost" style="margin-top: 8px; background: #fef2f2; color: #ef4444;" onclick="completeEvent(${ev.event_id})">✅ Complete Event</button>
                `;
            } else if (ev.status === 'registration_open') {
                if (ev.registration_status === 'closed') {
                    // Registrations AUTOMATICALLY closed by date - show Activate button
                    adminButtons = `
                        <button class="btn primary" style="margin-top: 8px; background: #10b981;" onclick="activateEvent(${ev.event_id})">🚀 Activate Event</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px; background: #fef3c7;" onclick="reopenRegistrations(${ev.event_id})">📅 Reopen Registrations</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="deleteEvent(${ev.event_id})">Delete</button>
                    `;
                } else if (ev.registration_status === 'open') {
                    // Registrations are OPEN - only show manage options
                    adminButtons = `
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="openManageSportsModal(${ev.event_id})">Manage Sports</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px; background: #fef3c7;" onclick="openRegistrationDatesModal(${ev.event_id})">📅 Edit Reg Dates</button>
                    `;
                } else {
                    // not_started - registrations will open automatically
                    adminButtons = `
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="openManageSportsModal(${ev.event_id})">Manage Sports</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px; background: #fef3c7;" onclick="openRegistrationDatesModal(${ev.event_id})">📅 Edit Reg Dates</button>
                    `;
                }
            } else if (ev.status === 'planned') {
                if (ev.registration_start_date && ev.registration_end_date) {
                    adminButtons = `
                        <button class="btn primary" style="margin-top: 8px; background: #ff9a00;" onclick="openRegistrationsForEvent(${ev.event_id})">Open Registrations</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="openManageSportsModal(${ev.event_id})">Manage Sports</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px; background: #fef3c7;" onclick="openRegistrationDatesModal(${ev.event_id})">📅 Edit Reg Dates</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="deleteEvent(${ev.event_id})">Delete</button>
                    `;
                } else {
                    adminButtons = `
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="openManageSportsModal(${ev.event_id})">Manage Sports</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px; background: #fef3c7;" onclick="openRegistrationDatesModal(${ev.event_id})">📅 Set Reg Dates</button>
                        <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="deleteEvent(${ev.event_id})">Delete</button>
                    `;
                }
            }
        }
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1; cursor: pointer;" onclick="showEventDetails(${ev.event_id})">
                    <h3 style="color: var(--color-primary); margin-top: 0;">${ev.event_name}</h3>
                    <p class="muted"><strong>Location:</strong> ${ev.location || 'N/A'}</p>
                    <p class="muted"><strong>Dates:</strong> ${ev.start_date} to ${ev.end_date}</p>
                    ${ev.registration_start_date ? `
                        <p class="muted"><strong>Registration:</strong> ${ev.registration_start_date} to ${ev.registration_end_date}</p>
                    ` : ''}
                    <p class="muted"><strong>Teams:</strong> ${ev.team_count || 0} | <strong>Matches:</strong> ${ev.match_count || 0}</p>
                    <p style="margin-top: 12px;">${ev.description || 'No description available.'}</p>
                </div>
                <div style="text-align: right;">
                    <span style="background: ${mainStatusColor}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                        ${mainStatusLabel}
                    </span>${additionalBadge}
                    ${adminButtons}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}



async function completeEvent(eventId) {
    if (!confirmAction('Mark this event as completed? This will finalize all results and lock modifications.')) {
        return;
    }
    
    try {
        const result = await apiCall(`/events/${eventId}/complete`, {
            method: 'POST'
        });
        
        showSuccess(result.message);
        await fetchEvents();
        await fetchActiveEvent();
        renderEvents();
        await loadAllDataAndRenderUI();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function reopenCompletedEvent(eventId) {
    if (!confirmAction('Reopen this completed event? This will change its status back to active and allow modifications.')) {
        return;
    }
    
    try {
        const result = await apiCall(`/events/${eventId}/reopen`, {
            method: 'POST'
        });
        
        showSuccess(result.message);
        await fetchEvents();
        await fetchActiveEvent();
        renderEvents();
        await loadAllDataAndRenderUI();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

// Show only active event teams
function renderTeams() {
    const statTeams = $('#stat-teams');
    if (statTeams) statTeams.textContent = APP_DATA.teams.length;

    const container = $('#teamsList');
    if (!container) return;
    container.innerHTML = '';
    
    if (!APP_DATA.teams.length) {
        container.innerHTML = '<p class="muted">No approved teams found.</p>';
        return;
    }
    
    APP_DATA.teams.forEach(t => {
    const card = document.createElement('div');
    card.className = 'card mb-4';
    card.style.cursor = 'pointer';
    card.onclick = () => showTeamDetails(t.team_id);
    
    // Add disqualified badge
    const disqualifiedBadge = t.status === 'disqualified' 
        ? '<span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 8px;">DISQUALIFIED</span>' 
        : '';
    
    card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 16px;">
            <img src="${t.logo || 'https://placehold.co/60x60'}" 
                 style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; ${t.status === 'disqualified' ? 'opacity: 0.5; filter: grayscale(100%);' : ''}" 
                 onerror="this.src='https://placehold.co/60x60'" />
            <div style="flex: 1;">
                <h4 style="margin: 0; ${t.status === 'disqualified' ? 'color: #991b1b; text-decoration: line-through;' : ''}">${t.team_name}${disqualifiedBadge}</h4>
                <p class="muted" style="margin: 4px 0;">${t.sport_name} • ${t.event_name}</p>
                <p class="muted" style="margin: 4px 0;">Manager: ${t.manager_name}</p>
            </div>
            <div style="text-align: right;">
                <button class="btn ghost" onclick="event.stopPropagation(); showTeamDetails(${t.team_id})">View Details</button>
            </div>
        </div>
    `;
    container.appendChild(card);
});
}

function renderSports() {
    const statSports = $('#stat-sports');
    if (statSports) statSports.textContent = APP_DATA.sports.length;

    const container = $('#sportsList');
    if (!container) return;
    container.innerHTML = '';
    
    if (!APP_DATA.sports.length) {
        container.innerHTML = '<p class="muted">No sports found.</p>';
        return;
    }
    
    APP_DATA.sports.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card mb-4';
        card.style.cursor = 'pointer';
        card.onclick = () => showSportDetails(s.sport_id);
        
        // Admin-only delete button
        const deleteButton = APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin' ? 
            `<button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="event.stopPropagation(); deleteSport(${s.sport_id})">Delete</button>` : '';
        
        card.innerHTML = `
            <h3 style="color: var(--color-primary); margin-top: 0;">${s.sport_name}</h3>
            <p class="muted">Team size: ${s.team_size} main players</p>
            <p class="muted">Max substitutes: ${s.max_substitutes}</p>
            <p class="muted">Status: <span style="text-transform: capitalize;">${s.status}</span></p>
            ${deleteButton}
        `;
        container.appendChild(card);
    });
}

// Show only active event matches with smart status indicators
function renderMatches() {
    const statMatches = $('#stat-matches');
    if (statMatches) statMatches.textContent = APP_DATA.matches.length;

    const container = $('#matchesList');
    if (!container) return;
    container.innerHTML = '';
    
    let matchesToShow = APP_DATA.matches;
    const filter = $('#matchViewFilter');
    if (filter && filter.value === 'my' && APP_DATA.myMatches) {
        matchesToShow = APP_DATA.myMatches;
    }
    
    if (!matchesToShow.length) {
        container.innerHTML = '<p class="muted">No matches found.</p>';
        return;
    }
    
    //  Categorize matches with smart indicators
    const now = new Date();
    const categorized = matchesToShow.map(m => {
        const matchDate = new Date(m.match_date);
        const hoursPast = (now - matchDate) / (1000 * 60 * 60);
        
        let indicator = '';
        let priority = 0;
        let statusStyle = '';
        
        if (m.status === 'completed') {
            indicator = '✅ Completed';
            statusStyle = 'color: #0078ff; font-weight: 600;';
            priority = 4; // Show last
        } else if (m.status === 'cancelled') {
            indicator = '❌ Cancelled';
            statusStyle = 'color: #6b7280; font-weight: 600;';
            priority = 5; // Show very last
        } else if (hoursPast > 6) {
            // Match was more than 6 hours ago and still not completed
            indicator = '⚠️ OVERDUE - Score Needed';
            statusStyle = 'color: #ef4444; font-weight: 700; background: #fef2f2; padding: 4px 8px; border-radius: 4px;';
            priority = 1; // Show first (highest priority)
        } else if (hoursPast > 0 && hoursPast <= 6) {
            // Match time has passed but within 6 hours
            indicator = '🟡 Ongoing / Awaiting Score';
            statusStyle = 'color: #ff9a00; font-weight: 600; background: #fef3c7; padding: 4px 8px; border-radius: 4px;';
            priority = 2; // Show second
        } else if (hoursPast > -2 && hoursPast <= 0) {
            // Match is within 2 hours (imminent)
            indicator = '🔴 Starting Soon';
            statusStyle = 'color: #ef4444; font-weight: 600;';
            priority = 3; // Show third
        } else {
            // Future match
            indicator = '🟢 Upcoming';
            statusStyle = 'color: #10b981; font-weight: 600;';
            priority = 3.5; // Show after imminent matches
        }

        
        return { ...m, indicator, priority, statusStyle, hoursPast };
    });
    
    // Sort: Overdue first, then ongoing, then by date
    categorized.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.match_date) - new Date(b.match_date);
    });
    
    categorized.forEach(m => {
        const card = document.createElement('div');
        card.className = 'card mb-4';
        
        // Add visual emphasis for overdue matches
        if (m.priority === 1) {
            card.style.border = '2px solid #ef4444';
            card.style.background = '#fffbeb';
        }
        
        const scoreDisplay = m.team1_score !== undefined && m.team2_score !== undefined
            ? `<p style="font-size: 20px; font-weight: 700; color: var(--color-primary); margin: 8px 0;">
                ${m.team1_score} - ${m.team2_score}
               </p>`
            : '';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <h4 style="margin: 0;">${m.team1_name} vs ${m.team2_name}</h4>
                    ${scoreDisplay}
                    <p class="muted" style="margin: 4px 0;">${m.sport_name} • ${m.event_name}</p>
                    ${m.venue_name ? `<p class="muted" style="margin: 4px 0;">📍 Venue: ${m.venue_name}</p>` : ''}
                    <p style="margin: 8px 0 0 0; ${m.statusStyle}">${m.indicator}</p>
                </div>
                <div style="text-align: right;">
                    <p class="muted" style="margin: 0; font-weight: 600;">${new Date(m.match_date).toLocaleString()}</p>
                    ${m.hoursPast > 0 && m.hoursPast <= 6 ? 
                        `<p style="font-size: 12px; color: #ff9a00; margin: 4px 0;">${Math.floor(m.hoursPast)}h ${Math.floor((m.hoursPast % 1) * 60)}m ago</p>` : ''}
                    ${m.hoursPast > 6 ? 
                        `<p style="font-size: 12px; color: #ef4444; margin: 4px 0; font-weight: 600;">${Math.floor(m.hoursPast)} hours overdue!</p>` : ''}
                    
                     ${APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin' && m.status === 'scheduled' ? 
                    `${m.hoursPast > 0 ? 
                        `<button class="btn ghost" style="margin-top: 8px; font-size: 12px; background: #fef2f2; color: #ef4444;" onclick="cancelMatch(${m.match_id}, '${m.team1_name}', '${m.team2_name}')">Cancel Match (No Show)</button>` 
                    : `<button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="deleteMatch(${m.match_id})">Delete</button>`}
                    <button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="editMatch(${m.match_id})">Reschedule</button>
                    <button class="btn primary" style="margin-top: 4px; font-size: 12px;" onclick="completeMatch(${m.match_id}, '${m.team1_name}', '${m.team2_name}')">Enter Score</button>` 
                    : ''}
                    ${APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin' && m.status === 'completed' ? 
                        `<button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="completeMatch(${m.match_id}, '${m.team1_name}', '${m.team2_name}')">Edit Score</button>` : ''}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    
            // Add summary for ADMIN ONLY
// Add summary for ADMIN ONLY
if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
    const overdueCount = categorized.filter(m => m.priority === 1).length;
    const ongoingCount = categorized.filter(m => m.priority === 2).length;
    
    if (overdueCount > 0 || ongoingCount > 0) {
        const summary = document.createElement('div');
        summary.className = 'card';
        summary.style.marginBottom = '16px';
        summary.style.background = '#fef3c7';
        summary.style.border = '2px solid #ff9a00';
        
        summary.innerHTML = `
            <h4 style="margin: 0 0 8px 0; color: #ff9a00;">⚠️ Admin Alert</h4>
            ${overdueCount > 0 ? `<p style="margin: 4px 0; color: #ef4444; font-weight: 600;">🔴 ${overdueCount} match${overdueCount > 1 ? 'es' : ''} overdue (needs score urgently)</p>` : ''}
            ${ongoingCount > 0 ? `<p style="margin: 4px 0; color: #ff9a00; font-weight: 600;">🟡 ${ongoingCount} match${ongoingCount > 1 ? 'es' : ''} awaiting score</p>` : ''}
        `;
        
        container.insertBefore(summary, container.firstChild);
    }
}
}


//  Render points with goal difference - UPDATED
function renderPoints() {
    const container = $('#pointsList');
    if (!container) return;

    const eventId = $('#leaderboardEvent')?.value;
    const sportId = $('#leaderboardSport')?.value;
    
    if (!eventId || !sportId) {
        container.innerHTML = '<p class="muted">Please select both Event and Sport to view leaderboard.</p>';
        return;
    }
    
    let filteredPoints = APP_DATA.points.filter(p => 
        p.event_id == eventId && p.sport_id == sportId
    );
    
    if (!filteredPoints.length) {
        container.innerHTML = '<p class="muted">No leaderboard data available for this event and sport.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table';
    
    let html = `
        <thead>
            <tr>
                <th>#</th>
                <th>Team</th>
                <th>MP</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Points</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    filteredPoints.forEach((p, index) => {
    const goalDiff = p.goal_difference || (p.goals_for - p.goals_against);
    const disqualifiedBadge = p.team_status === 'disqualified' 
        ? '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 8px; font-size: 10px; font-weight: 700; margin-left: 6px;">DISQUALIFIED</span>' 
        : '';
    
    html += `
        <tr style="${p.team_status === 'disqualified' ? 'opacity: 0.6; background: #fef2f2;' : ''}">
            <td><strong>${index + 1}</strong></td>
            <td><strong style="${p.team_status === 'disqualified' ? 'text-decoration: line-through; color: #991b1b;' : ''}">${p.team_name}</strong>${disqualifiedBadge}</td>
            <td>${p.matches_played}</td>
            <td>${p.wins}</td>
            <td>${p.draws}</td>
            <td>${p.losses}</td>
            <td>${p.goals_for}</td>
            <td>${p.goals_against}</td>
            <td style="font-weight: 600; color: ${goalDiff >= 0 ? '#10b981' : '#ef4444'};">${goalDiff > 0 ? '+' : ''}${goalDiff}</td>
            <td><strong style="color: var(--color-primary);">${p.points}</strong></td>
        </tr>
    `;
});
    
    html += '</tbody>';
    table.innerHTML = html;
    container.innerHTML = '';
    container.appendChild(table);
}

// Render Venues
function renderVenues() {
    const container = $('#venuesList');
    if (!container) return;
    container.innerHTML = '';
    
    // Update venues action button
    const venuesActions = $('#venuesActions');
    if (venuesActions) {
        if (APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin') {
            venuesActions.innerHTML = '<button class="btn" onclick="openModal(\'modal-add-venue\')">Add Venue</button>';
        } else {
            venuesActions.innerHTML = '';
        }
    }
    
    if (!APP_DATA.venues.length) {
        container.innerHTML = '<p class="muted">No venues found.</p>';
        return;
    }
    
    APP_DATA.venues.forEach(v => {
        const card = document.createElement('div');
        card.className = 'card mb-4';
        
        // Get sport name
        const sport = APP_DATA.sports.find(s => s.sport_id === v.sport_id);
        const sportName = sport ? sport.sport_name : 'General';
        
        const deleteButton = APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin' ? 
            `<button class="btn ghost" style="margin-top: 8px; font-size: 12px;" onclick="deleteVenue(${v.venue_id})">Delete</button>` : '';
        
        card.innerHTML = `
            <h4 style="margin: 0; color: var(--color-primary);">${v.venue_name}</h4>
            <p class="muted" style="margin: 4px 0;"><strong>Sport:</strong> ${sportName}</p>
            ${v.location ? `<p class="muted" style="margin: 4px 0;"><strong>Location:</strong> ${v.location}</p>` : ''}
            ${v.capacity ? `<p class="muted" style="margin: 4px 0;"><strong>Capacity:</strong> ${v.capacity}</p>` : ''}
            ${deleteButton}
        `;
        container.appendChild(card);
    });
}

// Delete Venue
// Delete Venue - FIXED
async function deleteVenue(venueId) {
    if (!confirmAction('Are you sure you want to delete this venue?')) {
        return;
    }
    
    try {
        const res = await apiCall(`/venues/${venueId}`, { method: 'DELETE' });
        showSuccess(res.message);
        await fetchVenues();
        renderVenues();
    } catch (err) {
        showSuccess(err.message || 'Failed to delete venue');
    }
}

function populateLeaderboardFilters() {
    const eventSelect = $('#leaderboardEvent');
    const sportSelect = $('#leaderboardSport');
    
    if (eventSelect) {
        eventSelect.innerHTML = '<option value="">Select Event</option>';
        APP_DATA.events.forEach(e => {
            eventSelect.innerHTML += `<option value="${e.event_id}">${e.event_name}</option>`;
        });
        
        // Auto-select active event
        if (APP_DATA.activeEvent) {
            eventSelect.value = APP_DATA.activeEvent.event_id;
            
            // Trigger sport population
            if (sportSelect) {
                updateLeaderboardSports();
            }
        }
    }
}

//  Update sports dropdown based on selected event
async function updateLeaderboardSports() {
    const eventSelect = $('#leaderboardEvent');
    const sportSelect = $('#leaderboardSport');
    
    if (!eventSelect || !sportSelect) return;
    
    const eventId = eventSelect.value;
    
    if (!eventId) {
        sportSelect.innerHTML = '<option value="">Select Event First</option>';
        sportSelect.disabled = true;
        return;
    }
    
    sportSelect.disabled = false;
    
    try {
        const eventSports = await apiCall(`/events/${eventId}/sports`, { noAuth: true, silent: true });
        
        if (eventSports.length === 0) {
            sportSelect.innerHTML = '<option value="">No sports in this event</option>';
        } else {
            sportSelect.innerHTML = '<option value="">Select Sport</option>' +
                eventSports.map(s => `<option value="${s.sport_id}">${s.sport_name}</option>`).join('');
        }
        
        // Trigger render if both are selected
        if (sportSelect.value) {
            renderPoints();
        }
    } catch (error) {
        console.error('Error loading sports:', error);
        sportSelect.innerHTML = '<option value="">Error loading sports</option>';
    }
}


// HOME PAGE RECAP CARDS


async function updateHomeRecaps() {
    await updateMatchesRecap();
    await updatePointsRecap();
    await updateEventsRecap();
}

async function updateMatchesRecap() {
    const container = $('#homeMatchesRecap');
    if (!container) return;
    
    const upcomingMatches = APP_DATA.matches
        .filter(m => new Date(m.match_date) >= new Date() && m.status === 'scheduled')
        .slice(0, 3);

    if (upcomingMatches.length === 0) {
        container.innerHTML = '<p class="muted">No upcoming matches scheduled.</p>';
        return;
    }

    container.innerHTML = upcomingMatches.map(match => `
        <div style="padding: 12px 0; border-bottom: 1px solid #eef2f7;">
            <div style="font-weight: 600;">${match.team1_name} vs ${match.team2_name}</div>
            <div class="muted" style="font-size: 14px; margin-top: 4px;">
                ${new Date(match.match_date).toLocaleDateString()} • ${match.sport_name}
            </div>
        </div>
    `).join('');
}

async function updatePointsRecap() {
    const container = $('#homePointsRecap');
    if (!container) return;

    let topTeams = APP_DATA.points;
    
    if (APP_DATA.activeEvent) {
        topTeams = topTeams.filter(p => p.event_id === APP_DATA.activeEvent.event_id);
    }
    
    topTeams = topTeams.slice(0, 5);

    if (topTeams.length === 0) {
        container.innerHTML = '<p class="muted">No leaderboard data available.</p>';
        return;
    }

    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 2px solid #eef2f7;">
                    <th style="text-align: left; padding: 8px; font-size: 14px;">#</th>
                    <th style="text-align: left; padding: 8px; font-size: 14px;">Team</th>
                    <th style="text-align: right; padding: 8px; font-size: 14px;">Pts</th>
                </tr>
            </thead>
            <tbody>
                ${topTeams.map((team, index) => `
                    <tr style="border-bottom: 1px solid #eef2f7;">
                        <td style="padding: 8px; font-size: 14px;">${index + 1}</td>
                        <td style="padding: 8px; font-size: 14px;"><strong>${team.team_name}</strong></td>
                        <td style="padding: 8px; text-align: right; font-weight: 600; color: var(--color-primary); font-size: 14px;">
                            ${team.points}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function updateEventsRecap() {
    const container = $('#homeEventsRecap');
    if (!container) return;

    const topEvents = APP_DATA.events.slice(0, 3);

    if (topEvents.length === 0) {
        container.innerHTML = '<p class="muted">No recent events to display.</p>';
        return;
    }

    container.innerHTML = topEvents.map(event => `
        <div style="padding: 12px 0; border-bottom: 1px solid #eef2f7; cursor: pointer;" onclick="showEventDetails(${event.event_id})">
            <div style="font-weight: 600;">${event.event_name}</div>
            <div class="muted" style="font-size: 14px; margin-top: 4px;">
                ${event.start_date} - ${event.end_date}
            </div>
        </div>
    `).join('');
}


// MODAL FUNCTIONS


function openModal(modalId) {
    const modal = $('#' + modalId);
    const overlay = $('#modalOverlay');
    
    if (modal && overlay) {
        modal.classList.remove('hidden');
        overlay.classList.remove('hidden');
        
        if (modalId === 'modal-schedule-match') {
            populateScheduleMatchModal();
        }
        
        // ADD THIS NEW CASE
        if (modalId === 'modal-add-venue') {
            const sportSelect = $('#venueSport');
            if (sportSelect && APP_DATA.activeEvent) {
                apiCall(`/events/${APP_DATA.activeEvent.event_id}/sports`, { noAuth: true, silent: true })
                    .then(sports => {
                        sportSelect.innerHTML = '<option value="">Select Sport</option>' +
                            sports.map(s => `<option value="${s.sport_id}">${s.sport_name}</option>`).join('');
                    })
                    .catch(() => {
                        sportSelect.innerHTML = '<option value="">Select Sport</option>' +
                            APP_DATA.sports.map(s => `<option value="${s.sport_id}">${s.sport_name}</option>`).join('');
                    });
            }
        }
    }
}

function closeModal(modalId) {
    const modal = $('#' + modalId);
    const overlay = $('#modalOverlay');
    
    if (modal) modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

function closeAllModals() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
    $('#modalOverlay').classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});


// Create Venue 
async function createVenue() {
    const name = $('#venueName')?.value?.trim();
    const location = $('#venueLocation')?.value?.trim();
    const capacity = parseInt($('#venueCapacity')?.value, 10) || null;
    const sportId = $('#venueSport')?.value;

    if (!name) {
        showSuccess('Venue name required');
        return;
    }
    
    if (!sportId) {
        showSuccess('Please select a sport for this venue');
        return;
    }
    
    try {
        const res = await apiCall('/venues', {
            method: 'POST',
            body: JSON.stringify({ 
                venue_name: name, 
                location, 
                capacity,
                sport_id: sportId 
            })
        });
        showSuccess(res.message || 'Venue created');
        closeModal('modal-add-venue');
        await fetchVenues();
        
        // Clear form
        $('#venueName').value = '';
        $('#venueLocation').value = '';
        $('#venueCapacity').value = '';
        $('#venueSport').value = '';
    } catch (err) {
        showSuccess(err.message || 'Failed to create venue');
    }
}

async function createNewEvent() {
    const name = $('#evName')?.value?.trim();
    const start = $('#evStart')?.value;
    const end = $('#evEnd')?.value;
    const regStart = $('#evRegStart')?.value;
    const regEnd = $('#evRegEnd')?.value;
    const location = $('#evLocation')?.value?.trim();
    const description = $('#evDescription')?.value?.trim();

    if (!name || !start || !end || !regStart || !regEnd) {
        showSuccess('All required fields must be filled');
        return;
    }

    const startD = new Date(start);
    const endD = new Date(end);
    const regStartD = new Date(regStart);
    const regEndD = new Date(regEnd);
    
    if (endD < startD) {
        showSuccess('End date must be after start date');
        return;
    }
    
    if (regEndD < regStartD) {
        showSuccess('Registration end date must be after start date');
        return;
    }
    
    if (regEndD > startD) {
        showSuccess('Registration must close before event starts');
        return;
    }

    try {
        const res = await apiCall('/events', {
            method: 'POST',
            body: JSON.stringify({
                event_name: name,
                start_date: start,
                end_date: end,
                registration_start_date: regStart,
                registration_end_date: regEnd,
                location,
                description
            })
        });

        showSuccess(res.message || 'Event created');
        closeModal('modal-add-event');
        await fetchEvents();
        renderEvents();
        
        // Clear form
        $('#evName').value = '';
        $('#evStart').value = '';
        $('#evEnd').value = '';
        $('#evRegStart').value = '';
        $('#evRegEnd').value = '';
        $('#evLocation').value = '';
        $('#evDescription').value = '';
    } catch (err) {
        showSuccess(err.message || 'Failed to create event');
    }
}

// Delete Event with confirmation
async function deleteEvent(eventId) {
    if (!confirmAction('Are you sure you want to delete this event? This cannot be undone.')) {
        return;
    }
    
    try {
        const res = await apiCall(`/events/${eventId}`, { method: 'DELETE' });
        showSuccess(res.message);
        await fetchEvents();
        renderEvents();
    } catch (err) {
        showSuccess(err.message || 'Failed to delete event');
    }
}

// TEAM REGISTRATION


async function openRegisterTeamModal() {
    if (!APP_DATA.activeEvent) {
        showSuccess('No event available for registration.');
        return;
    }
    
    // FIX: Check BOTH status and registration_status
    if (APP_DATA.activeEvent.status !== 'registration_open' || APP_DATA.activeEvent.registration_status !== 'open') {
        showSuccess('Team registrations are currently closed.');
        return;
    }
    
    // ... rest of your existing code to load sports ...
    const sportSelect = $('#regTeamSport');
    sportSelect.innerHTML = '<option value="">Select Sport</option>';
    
    try {
        const sports = await apiCall(`/events/${APP_DATA.activeEvent.event_id}/sports`, { noAuth: true });
        sports.forEach(s => {
            const feeText = s.registration_fee > 0 ? ` - Fee: Rs.${s.registration_fee}` : ' - FREE';
            sportSelect.innerHTML += `<option value="${s.sport_id}" data-team-size="${s.team_size}" data-max-subs="${s.max_substitutes}" data-sport-name="${s.sport_name}" data-fee="${s.registration_fee}">${s.sport_name}${feeText}</option>`;
        });
        
        openModal('modal-register-team');
    } catch (error) {
        showSuccess('Error loading sports: ' + error.message);
    }    
}



async function submitTeamRegistration() {
    const teamName = $('#regTeamName').value.trim();
    const sportId = $('#regTeamSport').value;
    const logoFile = $('#regTeamLogo').files[0];
    const paymentFile = $('#regPaymentScreenshot')?.files[0];
    
    if (!teamName || teamName.length < 3) {
        showSuccess('Team name must be at least 3 characters');
        return;
    }
    
    if (!sportId) {
        showSuccess('Please select a sport');
        return;
    }
    
    if (!APP_DATA.activeEvent) {
        showSuccess('No active event available');
        return;
    }
    
    // Collect players
    const players = [];
    const mainPlayerInputs = $$('#mainPlayersContainer .player-row');
    const subPlayerInputs = $$('#subsPlayersContainer .player-row');
    
    // Collect main players
    for (const row of mainPlayerInputs) {
        const nameInput = row.querySelector('[data-field="name"]');
        const jerseyInput = row.querySelector('[data-field="jersey"]');
        
        if (!nameInput.value.trim() || !jerseyInput.value.trim()) {
            showSuccess('All main players must have name and jersey number');
            return;
        }
        
        players.push({
            player_name: nameInput.value.trim(),
            jersey_no: jerseyInput.value.trim(),
            player_type: 'main'
        });
    }
    
    // Collect substitutes
    for (const row of subPlayerInputs) {
        const nameInput = row.querySelector('[data-field="name"]');
        const jerseyInput = row.querySelector('[data-field="jersey"]');
        
        if (nameInput.value.trim() && jerseyInput.value.trim()) {
            players.push({
                player_name: nameInput.value.trim(),
                jersey_no: jerseyInput.value.trim(),
                player_type: 'substitute'
            });
        }
    }
    
    // Check payment requirement
    const sportSelect = $('#regTeamSport');
    const selectedOption = sportSelect.options[sportSelect.selectedIndex];
    const fee = parseFloat(selectedOption.dataset.fee || 0);
    
    if (fee > 0 && !paymentFile) {
        showSuccess(`Payment screenshot required. Registration fee: Rs.${fee}`);
        return;
    }
    
    // Create FormData
    const formData = new FormData();
    formData.append('team_name', teamName);
    formData.append('sport_id', sportId);
    formData.append('event_id', APP_DATA.activeEvent.event_id);
    formData.append('players', JSON.stringify(players));
    
    if (logoFile) {
        formData.append('logo', logoFile);
    }
    
    if (paymentFile) {
        formData.append('payment_screenshot', paymentFile);
    }
    
    try {
        const result = await apiCall('/teams/register', {
            method: 'POST',
            body: formData
        });
        
        showSuccess(result.message);
        closeModal('modal-register-team');
        
        // Clear form
        $('#regTeamName').value = '';
        $('#regTeamSport').value = '';
        $('#regTeamLogo').value = '';
        if ($('#regPaymentScreenshot')) $('#regPaymentScreenshot').value = '';
        $('#mainPlayersContainer').innerHTML = '';
        $('#subsPlayersContainer').innerHTML = '';
        $('#playersSection').classList.add('hidden');
        $('#paymentSection')?.classList.add('hidden');
        
        await fetchTeams();
        renderTeams();
        await updateManagerDashboard();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function updatePlayerFields() {
    const sportSelect = $('#regTeamSport');
    const selectedOption = sportSelect.options[sportSelect.selectedIndex];
    
    if (!sportSelect.value) {
        $('#playersSection').classList.add('hidden');
        $('#paymentSection')?.classList.add('hidden');
        return;
    }
    
    const teamSize = parseInt(selectedOption.dataset.teamSize);
    const maxSubs = parseInt(selectedOption.dataset.maxSubs);
    const sportName = selectedOption.dataset.sportName;
    const fee = parseFloat(selectedOption.dataset.fee);
    
    $('#playersSection').classList.remove('hidden');
    $('#reqPlayersLabel').textContent = `(Required: ${teamSize})`;
    $('#subsLabel').textContent = `(Optional, Max: ${maxSubs})`;
    
    // Show/hide payment section based on fee
    const paymentSection = $('#paymentSection');
    if (paymentSection) {
        if (fee > 0) {
            paymentSection.classList.remove('hidden');
            $('#regFeeAmount').textContent = fee.toFixed(2);
        } else {
            paymentSection.classList.add('hidden');
        }
    }
    
    // Rest of existing code for positions and players...
    try {
        const positionsData = await apiCall(`/sports/${encodeURIComponent(sportName)}/positions`, { noAuth: true, silent: true });
        const positions = positionsData.positions || [];
        
        const mainContainer = $('#mainPlayersContainer');
        mainContainer.innerHTML = '';
        
        for (let i = 1; i <= teamSize; i++) {
    mainContainer.innerHTML += `
<div class="player-row" style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px; margin-bottom: 8px;">
    <input type="text" 
           placeholder="Player ${i} Name" 
           data-player-index="${i}" 
           data-player-type="main" 
           data-field="name" 
           minlength="2"
           maxlength="50"
           required />
    <input type="text" 
           placeholder="Jersey" 
           data-player-index="${i}" 
           data-player-type="main" 
           data-field="jersey" 
           minlength="1"
           maxlength="2"
           required />
</div>
`;
}
        
        $('#subsPlayersContainer').innerHTML = '';
        
        const addSubBtn = $('#addSubBtn');
        addSubBtn.onclick = () => addSubstituteField(maxSubs, positions);
        
        if (maxSubs === 0) {
            addSubBtn.style.display = 'none';
        } else {
            addSubBtn.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching positions:', error);
    }
}

function addSubstituteField(maxSubs, positions = []) {
    const container = $('#subsPlayersContainer');
    const currentSubs = container.querySelectorAll('.player-row').length;
    
    if (currentSubs >= maxSubs) {
        showSuccess(`Maximum ${maxSubs} substitutes allowed.`);
        return;
    }
    
    const subIndex = currentSubs + 1;
    const row = document.createElement('div');
    row.className = 'player-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; margin-bottom: 8px;';
    
    const positionField = positions.length > 0 ? `
        <select data-player-index="${subIndex}" data-player-type="substitute" data-field="position">
            <option value="">Position</option>
            ${positions.map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
    ` : `<input type="text" placeholder="Position" data-player-index="${subIndex}" data-player-type="substitute" data-field="position" />`;
    
    row.innerHTML = `
<input type="text" 
       placeholder="Substitute ${subIndex} Name" 
       data-player-index="${subIndex}" 
       data-player-type="substitute" 
       data-field="name"
       minlength="2"
       maxlength="50" />
<input type="text" 
       placeholder="Jersey" 
       data-player-index="${subIndex}" 
       data-player-type="substitute" 
       data-field="jersey"
       minlength="1"
       maxlength="2" />
<button type="button" class="btn ghost" style="padding: 8px 12px;" onclick="this.parentElement.remove()">×</button>
`;
    container.appendChild(row);
}



// Add these functions after the existing team functions

async function showEditTeamModal(teamId) {
    try {
        const team = await apiCall(`/teams/${teamId}/details`, { silent: true });
        
        if (team.status !== 'pending') {
            showSuccess('Can only edit pending teams');
            return;
        }
        
        // Get sport details for player fields
        const sportSelect = APP_DATA.sports.find(s => s.sport_id === team.sport_id);
        
        const modal = document.createElement('div');
        modal.id = 'modal-edit-team';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-inner card large-modal">
                <div class="modal-head">
                    <h3>Edit Team - ${team.team_name}</h3>
                    <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
                </div>
                <div class="modal-body">
                    <label>Team Name <span class="required">*</span></label>
                    <input id="editTeamName" type="text" value="${team.team_name}" minlength="3" maxlength="50" required />
                    
                    <label>Update Logo (optional)</label>
                    <input id="editTeamLogo" type="file" accept="image/jpeg,image/jpg,image/png,image/gif" />
                    <p class="muted small">Leave empty to keep current logo</p>
                    
                    ${team.logo ? `<img src="${team.logo}" style="max-width: 100px; margin-top: 10px; border-radius: 8px;" />` : ''}
                    
                    <h4 style="margin-top: 24px;">Edit Players</h4>
                    <p class="muted small">Update player names and jersey numbers. Team size: ${sportSelect.team_size}</p>
                    
                    <div id="editMainPlayersContainer"></div>
                    
                    <h4 style="margin-top: 20px;">Substitutes</h4>
                    <div id="editSubsPlayersContainer"></div>
                    <button type="button" class="btn ghost" id="editAddSubBtn" onclick="addEditSubstituteField(${sportSelect.max_substitutes})">+ Add Substitute</button>
                </div>
                <div class="form-actions">
                    <button class="btn primary" onclick="submitTeamUpdate(${teamId})">Update Team</button>
                    <button class="btn ghost" onclick="this.closest('.modal').remove(); closeAllModals()">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        openModal('modal-edit-team');
        
        // Populate existing players
        const mainContainer = $('#editMainPlayersContainer');
        const subsContainer = $('#editSubsPlayersContainer');
        
        team.players.forEach((player, idx) => {
            if (player.player_type === 'main') {
                mainContainer.innerHTML += `
                    <div class="player-row" style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px; margin-bottom: 8px;">
                        <input type="text" 
                               placeholder="Player ${idx + 1} Name" 
                               value="${player.player_name}"
                               data-player-index="${idx}" 
                               data-player-type="main" 
                               data-field="name" 
                               minlength="2"
                               maxlength="50"
                               required />
                        <input type="text" 
                               placeholder="Jersey" 
                               value="${player.jersey_no}"
                               data-player-index="${idx}" 
                               data-player-type="main" 
                               data-field="jersey" 
                               minlength="1"
                               maxlength="2"
                               required />
                    </div>
                `;
            } else {
                subsContainer.innerHTML += `
                    <div class="player-row" style="display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; margin-bottom: 8px;">
                        <input type="text" 
                               placeholder="Substitute Name" 
                               value="${player.player_name}"
                               data-player-type="substitute" 
                               data-field="name"
                               minlength="2"
                               maxlength="50" />
                        <input type="text" 
                               placeholder="Jersey" 
                               value="${player.jersey_no}"
                               data-player-type="substitute" 
                               data-field="jersey"
                               minlength="1"
                               maxlength="2" />
                        <button type="button" class="btn ghost" style="padding: 8px 12px;" onclick="this.parentElement.remove()">×</button>
                    </div>
                `;
            }
        });
        
        // Hide add sub button if max reached
        if (team.players.filter(p => p.player_type === 'substitute').length >= sportSelect.max_substitutes) {
            $('#editAddSubBtn').style.display = 'none';
        }
        
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

// Add helper function for adding subs in edit mode
function addEditSubstituteField(maxSubs) {
    const container = $('#editSubsPlayersContainer');
    const currentSubs = container.querySelectorAll('.player-row').length;
    
    if (currentSubs >= maxSubs) {
        showSuccess(`Maximum ${maxSubs} substitutes allowed.`);
        return;
    }
    
    const row = document.createElement('div');
    row.className = 'player-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; margin-bottom: 8px;';
    
    row.innerHTML = `
        <input type="text" 
               placeholder="Substitute Name" 
               data-player-type="substitute" 
               data-field="name"
               minlength="2"
               maxlength="50" />
        <input type="text" 
               placeholder="Jersey" 
               data-player-type="substitute" 
               data-field="jersey"
               minlength="1"
               maxlength="2" />
        <button type="button" class="btn ghost" style="padding: 8px 12px;" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
    
    if (currentSubs + 1 >= maxSubs) {
        $('#editAddSubBtn').style.display = 'none';
    }
}

async function submitTeamUpdate(teamId) {
    const teamName = $('#editTeamName').value.trim();
    const logoFile = $('#editTeamLogo').files[0];
    
    if (!teamName || teamName.length < 3) {
        showSuccess('Team name must be at least 3 characters');
        return;
    }
    
    // Collect players
    const players = [];
    const mainPlayerInputs = $$('#editMainPlayersContainer .player-row');
    const subPlayerInputs = $$('#editSubsPlayersContainer .player-row');
    
    // Collect main players
    for (const row of mainPlayerInputs) {
        const nameInput = row.querySelector('[data-field="name"]');
        const jerseyInput = row.querySelector('[data-field="jersey"]');
        
        if (!nameInput.value.trim() || !jerseyInput.value.trim()) {
            showSuccess('All main players must have name and jersey number');
            return;
        }
        
        players.push({
            player_name: nameInput.value.trim(),
            jersey_no: jerseyInput.value.trim(),
            player_type: 'main'
        });
    }
    
    // Collect substitutes
    for (const row of subPlayerInputs) {
        const nameInput = row.querySelector('[data-field="name"]');
        const jerseyInput = row.querySelector('[data-field="jersey"]');
        
        if (nameInput.value.trim() && jerseyInput.value.trim()) {
            players.push({
                player_name: nameInput.value.trim(),
                jersey_no: jerseyInput.value.trim(),
                player_type: 'substitute'
            });
        }
    }
    
    const formData = new FormData();
    formData.append('team_name', teamName);
    formData.append('players', JSON.stringify(players));
    
    if (logoFile) {
        formData.append('logo', logoFile);
    }
    
    try {
        const result = await apiCall(`/teams/${teamId}`, {
            method: 'PUT',
            body: formData
        });
        
        showSuccess(result.message);
        document.querySelector('#modal-edit-team')?.remove();
        closeAllModals();
        await fetchTeams();
        renderTeams();
        await updateManagerDashboard();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function deleteTeamByManager(teamId, teamName) {
    if (!confirmAction(`Delete team "${teamName}"? This cannot be undone.`)) {
        return;
    }
    
    try {
        const result = await apiCall(`/teams/${teamId}`, { method: 'DELETE' });
        showSuccess(result.message);
        await fetchTeams();
        renderTeams();
        await updateManagerDashboard();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}



// activateEvent - Handle server response properly

async function activateEvent(eventId) {
    try {
        const eventData = await apiCall(`/events/${eventId}`, { silent: true });
        const event = Array.isArray(eventData) ? eventData[0] : eventData;
        
        if (!event) {
            showSuccess('Event not found');
            return;
        }
        
        // ONLY check if registrations are closed (automatically by date)
        if (event.registration_status !== 'closed') {
            showSuccess('Registrations must be closed before activating the event. Wait until the registration end date passes.');
            return;
        }
        
        // Check for pending teams
        const pendingTeams = await apiCall(`/teams/pending?event_id=${eventId}`, { silent: true });
        
        if (pendingTeams.length > 0) {
            showSuccess(`Cannot activate event. ${pendingTeams.length} team registration${pendingTeams.length > 1 ? 's are' : ' is'} still pending approval. Please approve or reject all teams first.`);
            return;
        }
        
        // Confirm activation
        if (!confirmAction(`Activate "${event.event_name}"? This will make it the current active event.`)) {
            return;
        }
        
        const result = await apiCall(`/events/${eventId}/activate`, {
            method: 'POST',
            body: { force: false }
        });
        
        showSuccess(result.message);
        await fetchEvents();
        await fetchActiveEvent();
        renderEvents();
        await loadAllDataAndRenderUI();
    } catch (error) {
        if (error.message.includes('pending matches')) {
            const forceActivate = confirmAction(
                error.message + '\n\nForce activate and cancel pending matches?'
            );
            
            if (forceActivate) {
                try {
                    const result = await apiCall(`/events/${eventId}/activate`, {
                        method: 'POST',
                        body: { force: true }
                    });
                    showSuccess(result.message);
                    await fetchEvents();
                    await fetchActiveEvent();
                    renderEvents();
                    await loadAllDataAndRenderUI();
                } catch (err) {
                    showSuccess('Error: ' + err.message);
                }
            }
        } else {
            showSuccess('Error: ' + error.message);
        }
    }
}

async function showPendingTeamsModal() {
    await fetchPendingTeams();
    
    const container = $('#pendingTeamsList');
    
    if (!APP_DATA.pendingTeams.length) {
        container.innerHTML = '<p class="muted">No pending team registrations.</p>';
    } else {
        container.innerHTML = '';
        
        for (const team of APP_DATA.pendingTeams) {
            let playersHTML = '';
            try {
                const players = await apiCall(`/players/${team.team_id}`, { noAuth: true, silent: true });
                playersHTML = `
                    <div style="margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 6px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 14px;">Players (${players.length}):</h4>
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${players.map(p => `
                                <div style="padding: 4px 0; font-size: 13px;">
                                    <strong>${p.player_name}</strong> #${p.jersey_no} 
                                    ${p.position ? `- ${p.position}` : ''} 
                                    <span style="color: #6b7280;">(${p.player_type})</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } catch (error) {
                playersHTML = '<p class="muted">Unable to load players</p>';
            }
            
            // Show payment screenshot if exists
            const paymentHTML = team.payment_screenshot ? `
                <div style="margin-top: 10px; padding: 10px; background: #fef3c7; border-radius: 6px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px;">💳 Payment Screenshot:</h4>
                    <a href="${team.payment_screenshot}" target="_blank">
                        <img src="${team.payment_screenshot}" style="max-width: 100%; max-height: 300px; border-radius: 6px; cursor: pointer;" />
                    </a>
                    <p class="muted small" style="margin-top: 4px;">Click to view full size</p>
                </div>
            ` : '<p class="muted" style="margin-top: 8px;">No payment screenshot provided</p>';
            
            const card = document.createElement('div');
            card.className = 'card mb-4';
            card.innerHTML = `
                <h4>${team.team_name}</h4>
                <p class="muted">Sport: ${team.sport_name} | Event: ${team.event_name}</p>
                <p class="muted">Manager: ${team.manager_name} (${team.manager_email})</p>
                <p class="muted">Players: ${team.main_count} main + ${team.sub_count} subs</p>
                ${paymentHTML}
                ${playersHTML}
                <div class="form-actions" style="margin-top: 12px;">
                    <button class="btn primary" onclick="approveTeam(${team.team_id})">Approve</button>
                    <button class="btn ghost" onclick="rejectTeamPrompt(${team.team_id})">Reject</button>
                </div>
            `;
            container.appendChild(card);
        }
    }
    
    openModal('modal-pending-teams');
}

async function approveTeam(teamId) {
    if (!confirmAction('Approve this team?')) return;
    
    try {
        const result = await apiCall(`/teams/${teamId}/approve`, {
            method: 'POST'
        });
        
        showSuccess(result.message);
        await fetchTeams();
        await fetchPendingTeams();
        await fetchPoints();
        renderTeams();
        renderPoints();
        showPendingTeamsModal();
        await updateAdminDashboard();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

function rejectTeamPrompt(teamId) {
    const reason = prompt('Rejection reason (optional):');
    if (reason !== null) {
        rejectTeam(teamId, reason);
    }
}

async function rejectTeam(teamId, reason) {
    try {
        const result = await apiCall(`/teams/${teamId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || null })
        });
        
        showSuccess(result.message);
        await fetchTeams();
        await fetchPendingTeams();
        renderTeams();
        showPendingTeamsModal();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

// Disqualify Team
async function disqualifyTeam(teamId) {
    const reason = prompt('Reason for disqualification:');
    if (reason === null) return;
    
    if (!confirmAction('Disqualify this team? Future matches will be cancelled but completed records will be preserved.')) {
        return;
    }
    
    try {
        const result = await apiCall(`/teams/${teamId}/disqualify`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || null })
        });
        
        showSuccess(result.message);
        await fetchTeams();
        await fetchMatches();
        renderTeams();
        renderMatches();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function createSport() {
    const name = $('#sportName').value.trim();
    const teamSize = $('#sportTeamSize').value;
    const maxSubs = $('#sportMaxSubs').value;
    const fee = parseFloat($('#sportFee').value);
    
    if (!name || !teamSize) {
        showSuccess('Please fill required fields');
        return;
    }
    
    if (fee < 0) {
        showSuccess('Fee cannot be negative');
        return;
    }
    
    // Validate fee range (200-5000 if not free)
    if (fee > 0 && (fee < 200 || fee > 5000)) {
        showSuccess('Registration fee must be between Rs.200 and Rs.5000, or set to 0 for free registration');
        return;
    }
    
    try {
        const result = await apiCall('/sports', {
            method: 'POST',
            body: JSON.stringify({
                sport_name: name,
                team_size: parseInt(teamSize),
                max_substitutes: parseInt(maxSubs) || 0,
                registration_fee: fee,
                status: 'planned'
            })
        });
        
        showSuccess(result.message);
        closeModal('modal-add-sport');
        await fetchSports();
        renderSports();
        
        $('#sportName').value = '';
        $('#sportTeamSize').value = '11';
        $('#sportMaxSubs').value = '7';
        $('#sportFee').value = '0';
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}


// MANAGE EVENT SPORTS


let currentEventIdForSports = null;

async function openManageSportsModal(eventId) {
    currentEventIdForSports = eventId;
    
    try {
        // Check event status first
        const event = APP_DATA.events.find(e => e.event_id === eventId);
        
        if (!event) {
            showSuccess('Event not found');
            return;
        }
        
        // Lock sports management if registrations closed or event completed
        if (event.registration_status === 'closed' || event.status === 'completed') {
            showSuccess('Cannot modify sports after registrations close or event is completed. Teams have already registered.');
            return;
        }
        
        // Fetch event sports
        const eventSports = await apiCall(`/events/${eventId}/sports`, { noAuth: true, silent: true });
        const allSports = APP_DATA.sports;
        
        const eventSportIds = eventSports.map(s => s.sport_id);
        const availableSports = allSports.filter(s => !eventSportIds.includes(s.sport_id));
        
        // Render sports in event
        const eventList = $('#eventSportsList');
        if (eventSports.length === 0) {
            eventList.innerHTML = '<p class="muted">No sports added to this event yet.</p>';
        } else {
            eventList.innerHTML = eventSports.map(sport => `
                <div class="card" style="padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${sport.sport_name}</strong>
                        <span class="muted" style="font-size: 12px; margin-left: 8px;">
                            Team size: ${sport.team_size} | Max subs: ${sport.max_substitutes}
                        </span>
                    </div>
                    <button class="btn ghost" style="font-size: 12px; padding: 6px 12px;" 
                            onclick="removeSportFromEvent(${eventId}, ${sport.sport_id})">Remove</button>
                </div>
            `).join('');
        }
        
        // Render available sports
        const availableList = $('#availableSportsList');
        if (availableSports.length === 0) {
            availableList.innerHTML = '<p class="muted">All sports have been added to this event.</p>';
        } else {
            availableList.innerHTML = availableSports.map(sport => `
                <div class="card" style="padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${sport.sport_name}</strong>
                        <span class="muted" style="font-size: 12px; margin-left: 8px;">
                            Team size: ${sport.team_size} | Max subs: ${sport.max_substitutes}
                        </span>
                    </div>
                    <button class="btn primary" style="font-size: 12px; padding: 6px 12px;" 
                            onclick="addSportToEvent(${eventId}, ${sport.sport_id})">Add to Event</button>
                </div>
            `).join('');
        }
        
        openModal('modal-manage-sports');
    } catch (error) {
        showSuccess('Error loading sports: ' + error.message);
    }
}

async function addSportToEvent(eventId, sportId) {
    try {
        await apiCall(`/events/${eventId}/sports`, {
            method: 'POST',
            body: JSON.stringify({ sport_id: sportId })
        });
        
        showSuccess('Sport added to event!');
        await fetchSports(); // Refresh sports data
        openManageSportsModal(eventId); // Refresh modal
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function removeSportFromEvent(eventId, sportId) {
    if (!confirmAction('Remove this sport from the event? Teams registered for this sport will be affected.')) {
        return;
    }
    
    try {
        await apiCall(`/events/${eventId}/sports/${sportId}`, {
            method: 'DELETE'
        });
        
        showSuccess('Sport removed from event');
        await fetchSports(); // Refresh sports data
        openManageSportsModal(eventId); // Refresh modal
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function deleteSport(sportId) {
    if (!confirmAction('Delete this sport? This will remove it from all events.')) return;
    
    try {
        await apiCall(`/sports/${sportId}`, { method: 'DELETE' });
        showSuccess('Sport deleted');
        await fetchSports();
        renderSports();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

// Complete Match with score entry
async function completeMatch(matchId, team1Name, team2Name) {
    const team1Score = prompt(`Enter score for ${team1Name}:`, '0');
    if (team1Score === null) return;
    
    const team2Score = prompt(`Enter score for ${team2Name}:`, '0');
    if (team2Score === null) return;
    
    const score1 = parseInt(team1Score);
    const score2 = parseInt(team2Score);
    
    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
        showSuccess('Invalid scores. Please enter non-negative numbers.');
        return;
    }
    
    if (!confirmAction(`Confirm score: ${team1Name} ${score1} - ${score2} ${team2Name}?`)) {
        return;
    }
    
    try {
        const result = await apiCall(`/matches/${matchId}/score`, {
            method: 'POST',
            body: JSON.stringify({
                team1_score: score1,
                team2_score: score2
            })
        });
        
        showSuccess(result.message);
        await fetchMatches();
        await fetchPoints();
        renderMatches();
        renderPoints();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function scheduleMatch() {
    const eventId = $('#matchEvent').value;
    const sportId = $('#matchSport').value;
    const team1Id = $('#matchTeam1').value;
    const team2Id = $('#matchTeam2').value;
    const datetime = $('#matchDatetime').value;
    const venueId = $('#matchVenue').value;
    
    if (!eventId || !sportId || !team1Id || !team2Id || !datetime) {
        showSuccess('Please fill all required fields');
        return;
    }
    
    if (team1Id === team2Id) {
        showSuccess('Please select different teams');
        return;
    }
    
    try {
        const result = await apiCall('/matches', {
            method: 'POST',
            body: JSON.stringify({
                event_id: eventId,
                sport_id: sportId,
                team1_id: team1Id,
                team2_id: team2Id,
                venue_id: venueId || null,
                match_date: datetime
            })
        });
        
        showSuccess(result.message);
        closeModal('modal-schedule-match');
        await fetchMatches();
        renderMatches();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function deleteMatch(matchId) {
    if (!confirmAction('Delete this match? This cannot be undone.')) return;
    
    try {
        await apiCall(`/matches/${matchId}`, { method: 'DELETE' });
        showSuccess('Match deleted');
        await fetchMatches();
        renderMatches();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function cancelMatch(matchId, team1Name, team2Name) {
    const reason = prompt(`Why is this match being cancelled?\n\n${team1Name} vs ${team2Name}`, 'Match did not take place');
    
    if (reason === null) return; // User clicked cancel
    
    if (!confirmAction(`Cancel this match? This action preserves the record but marks it as not played.\n\nReason: ${reason}`)) {
        return;
    }
    
    try {
        await apiCall(`/matches/${matchId}`, {
            method: 'PUT',
            body: { status: 'cancelled' }
        });
        
        showSuccess('Match cancelled successfully');
        await fetchMatches();
        renderMatches();
    } catch (error) {
        showSuccess('Error cancelling match: ' + error.message);
    }
}

//  populateScheduleMatchModal


function populateScheduleMatchModal() {
    const eventSelect = $('#matchEvent');
    const sportSelect = $('#matchSport');
    const venueSelect = $('#matchVenue');
    
    if (eventSelect) {
        eventSelect.innerHTML = '<option value="">Select Event</option>';
        
        // Show events where registrations are closed OR event is active
        const eligibleEvents = APP_DATA.events.filter(e => 
            (e.status === 'planned' && e.registration_status === 'closed') || 
            e.status === 'active'
        );
        
        eligibleEvents.forEach(e => {
            const label = e.status === 'active' ? `${e.event_name} (Active)` : `${e.event_name} (Ready to Start)`;
            eventSelect.innerHTML += `<option value="${e.event_id}">${label}</option>`;
        });
        
        // Auto-select active event if exists
        if (APP_DATA.activeEvent && eligibleEvents.some(e => e.event_id === APP_DATA.activeEvent.event_id)) {
            eventSelect.value = APP_DATA.activeEvent.event_id;
            
            // Trigger sport population immediately
            if (sportSelect) {
                sportSelect.innerHTML = '<option value="">Select Sport</option>';
                APP_DATA.sports.forEach(s => {
                    sportSelect.innerHTML += `<option value="${s.sport_id}">${s.sport_name}</option>`;
                });
            }
        }
    }
    
    if (sportSelect && !eventSelect.value) {
        sportSelect.innerHTML = '<option value="">Select Event First</option>';
    }
    
    if (venueSelect) {
        venueSelect.innerHTML = '<option value="">Select Venue (Optional)</option>';
    }
}

function loadTeamsForSport() {
    const sportId = $('#matchSport').value;
    const eventId = $('#matchEvent').value;
    
    if (!sportId || !eventId) return;
    
    // Load teams
    const teams = APP_DATA.teams.filter(t => 
        t.sport_id == sportId && 
        t.event_id == eventId && 
        t.status === 'approved'
    );
    
    const team1Select = $('#matchTeam1');
    const team2Select = $('#matchTeam2');
    
    const options = '<option value="">Select Team</option>' +
        teams.map(t => `<option value="${t.team_id}">${t.team_name}</option>`).join('');
    
    if (team1Select) team1Select.innerHTML = options;
    if (team2Select) team2Select.innerHTML = options;
    
    // Load venues filtered by sport
    const venueSelect = $('#matchVenue');
    if (venueSelect && sportId) {
        // Filter venues: either general (no sport_id) OR matching this sport
        const filteredVenues = APP_DATA.venues.filter(v => 
            !v.sport_id || v.sport_id == sportId
        );
        
        if (filteredVenues.length === 0) {
            venueSelect.innerHTML = '<option value="">No venues available for this sport</option>';
        } else {
            venueSelect.innerHTML = '<option value="">Select Venue (Optional)</option>' +
                filteredVenues.map(v => {
                    const sport = APP_DATA.sports.find(s => s.sport_id === v.sport_id);
                    const label = sport ? `${v.venue_name} (${sport.sport_name})` : `${v.venue_name} (General)`;
                    return `<option value="${v.venue_id}">${label}</option>`;
                }).join('');
        }
    }
}


// DASHBOARD UPDATES


async function updateManagerDashboard() {
    if (!APP_DATA.currentUser || APP_DATA.currentUser.role !== 'manager') return;
    
    try {
        const myTeams = await apiCall('/teams/my/all', { silent: true });
        const myMatches = await apiCall('/matches/my', { silent: true });
        
        $('#mgrTeamCount').textContent = myTeams.length;
        $('#mgrMatchCount').textContent = myMatches.length;
        
        const container = $('#mgrTeamsContainer');
        if (myTeams.length === 0) {
            container.innerHTML = '<p class="muted">You haven\'t registered any teams yet.</p>';
        } else {
            container.innerHTML = myTeams.map(team => {
                const statusColors = {
                    'approved': '#10b981',
                    'pending': '#ff9a00',
                    'rejected': '#ef4444',
                    'disqualified': '#991b1b'
                };
                
                const disqualifiedBadge = team.status === 'disqualified' 
                    ? '<span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 8px;">DISQUALIFIED</span>' 
                    : '';
                
                // FIXED: Add Edit/Delete buttons for pending teams
                let actionButtons = '';
                if (team.status === 'pending') {
                    actionButtons = `
                        <button class="btn ghost" style="font-size: 12px; margin-top: 4px;" 
                                onclick="showEditTeamModal(${team.team_id})">
                            Edit
                        </button>
                        <button class="btn ghost" style="font-size: 12px; margin-top: 4px; background: #fef2f2; color: #ef4444;" 
                                onclick="deleteTeamByManager(${team.team_id}, '${team.team_name}')">
                            Delete
                        </button>
                    `;
                }
                
                return `
                    <div class="card mb-4">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0; ${team.status === 'disqualified' ? 'text-decoration: line-through; color: #991b1b;' : ''}">${team.team_name}${disqualifiedBadge}</h4>
                                <p class="muted" style="margin: 4px 0;">${team.sport_name} • ${team.event_name}</p>
                                <p class="muted" style="margin: 4px 0;">Players: ${team.player_count}</p>
                            </div>
                            <div style="text-align: right;">
                                <span style="color: ${statusColors[team.status]}; font-weight: 600; display: block; margin-bottom: 8px;">
                                    ${team.status.toUpperCase()}
                                </span>
                                <button class="btn ghost" style="font-size: 12px;" onclick="showTeamDetails(${team.team_id})">View Details</button>
                                ${actionButtons}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error updating manager dashboard:', error);
    }
}

async function updateAdminDashboard() {
    if (!APP_DATA.currentUser || APP_DATA.currentUser.role !== 'admin') return;
    
    $('#adminEvents').textContent = APP_DATA.events.length;
    $('#adminSports').textContent = APP_DATA.sports.length;
    $('#adminPendingTeams').textContent = APP_DATA.pendingTeams.length;
    $('#adminMatches').textContent = APP_DATA.matches.length;
}


// DETAIL PAGES


async function showEventDetails(eventId) {

    document.querySelectorAll('[id^="modal-"][id$="-details"]').forEach(m => m.remove());
    try {
        const event = await apiCall(`/events/${eventId}`, { silent: true });
        
        const modal = document.createElement('div');
        modal.id = 'modal-event-details';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-inner card large-modal">
                <div class="modal-head">
                    <h3>${event.event_name}</h3>
                    <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>Status:</strong> ${event.status.toUpperCase()}</p>
                    <p><strong>Dates:</strong> ${event.start_date} to ${event.end_date}</p>
                    <p><strong>Location:</strong> ${event.location}</p>
                    <p><strong>Teams:</strong> ${event.team_count} | <strong>Matches:</strong> ${event.match_count}</p>
                    
                    ${event.winners && event.winners.length > 0 ? `
                        <h4 style="margin-top: 20px;">Winners by Sport</h4>
                        ${event.winners.map(w => `
                            <div class="card" style="padding: 12px; margin-bottom: 8px;">
                                <strong>${w.sport_name}:</strong> ${w.winner_team} 
                                (${w.points} pts, GD: ${w.goal_difference > 0 ? '+' : ''}${w.goal_difference})
                            </div>
                        `).join('')}
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        openModal('modal-event-details');
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function showTeamDetails(teamId) {
    // Remove any existing detail modals first
    document.querySelectorAll('[id^="modal-"][id$="-details"]').forEach(m => m.remove());
    
    try {
        const team = await apiCall(`/teams/${teamId}/details`, { silent: true });
        
        const modal = document.createElement('div');
        modal.id = 'modal-team-details';
        modal.className = 'modal';
        
        // Status badge colors
        const statusColors = {
            'approved': '#10b981',
            'pending': '#ff9a00',
            'rejected': '#ef4444',
            'disqualified': '#6b7280'
        };
        
        modal.innerHTML = `
            <div class="modal-inner card large-modal">
                <div class="modal-head">
                    <h3>${team.team_name}</h3>
                    <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>Sport:</strong> ${team.sport_name}</p>
                    <p><strong>Event:</strong> ${team.event_name}</p>
                    <p><strong>Manager:</strong> ${team.manager_name}</p>
                    <p><strong>Status:</strong> <span style="color: ${statusColors[team.status]}; font-weight: 600;">${team.status.toUpperCase()}</span></p>
                    ${team.rejection_reason ? `<p><strong>Reason:</strong> ${team.rejection_reason}</p>` : ''}
                    
                    <h4 style="margin-top: 20px;">Players (${team.players.length})</h4>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${team.players.map(p => `
                            <div style="padding: 8px; background: #f8fafc; margin-bottom: 6px; border-radius: 6px;">
                                <strong>${p.player_name}</strong> #${p.jersey_no}
                                ${p.position ? ` - ${p.position}` : ''}
                                <span style="color: #6b7280;"> (${p.player_type})</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${APP_DATA.currentUser && APP_DATA.currentUser.role === 'admin' && team.status === 'approved' ? `
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #eef2f7;">
                            <button class="btn ghost" style="background: #fef2f2; color: #ef4444; border-color: #ef4444;" 
                                    onclick="event.stopPropagation(); disqualifyTeam(${teamId})">
                                Disqualify Team
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        openModal('modal-team-details');
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function showSportDetails(sportId) {
    document.querySelectorAll('[id^="modal-"][id$="-details"]').forEach(m => m.remove());
    try {
        const sport = await apiCall(`/sports/${sportId}`, { silent: true });
        
        const modal = document.createElement('div');
        modal.id = 'modal-sport-details';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-inner card large-modal">
                <div class="modal-head">
                    <h3>${sport.sport_name}</h3>
                    <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>Team Size:</strong> ${sport.team_size}</p>
                    <p><strong>Max Substitutes:</strong> ${sport.max_substitutes}</p>
                    <p><strong>Teams:</strong> ${sport.teams?.length || 0}</p>
                    <p><strong>Matches:</strong> ${sport.matches?.length || 0}</p>
                    
                    ${sport.leaderboard && sport.leaderboard.length > 0 ? `
    <h4 style="margin-top: 20px;">Leaderboard</h4>
    <table class="table">
        <thead>
            <tr><th>#</th><th>Team</th><th>Pts</th><th>GD</th></tr>
        </thead>
        <tbody>
            ${sport.leaderboard.slice(0, 10).map((t, i) => {
                const disqualifiedBadge = t.team_status === 'disqualified' 
                    ? '<span style="color: #991b1b; font-size: 9px; margin-left: 4px; font-weight: 700;">(DISQUALIFIED)</span>' 
                    : '';
                return `
                    <tr style="${t.team_status === 'disqualified' ? 'opacity: 0.6; background: #fef2f2;' : ''}">
                        <td>${i + 1}</td>
                        <td style="${t.team_status === 'disqualified' ? 'text-decoration: line-through; color: #991b1b;' : ''}">${t.team_name}${disqualifiedBadge}</td>
                        <td>${t.points}</td>
                        <td>${t.goal_difference > 0 ? '+' : ''}${t.goal_difference}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    </table>
` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        openModal('modal-sport-details');
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}

async function editMatch(matchId) {
    // Get match details first
    const match = APP_DATA.matches.find(m => m.match_id === matchId);
    if (!match) {
        showSuccess('Match not found');
        return;
    }
    
    // Create a modal for rescheduling
    const modal = document.createElement('div');
    modal.id = 'modal-reschedule-match';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-inner card">
            <div class="modal-head">
                <h3>Reschedule Match</h3>
                <button class="close" onclick="this.closest('.modal').remove(); closeAllModals()">&times;</button>
            </div>
            <div class="modal-body">
                <p><strong>${match.team1_name}</strong> vs <strong>${match.team2_name}</strong></p>
                <p class="muted">Current: ${new Date(match.match_date).toLocaleString()}</p>
                
                <label>New Date & Time <span class="required">*</span></label>
                <input id="rescheduleDateTime" type="datetime-local" required 
                       value="${match.match_date.slice(0, 16)}" />
                <p class="muted small">Match time must be between 8:00 AM and 10:00 PM</p>
            </div>
            <div class="form-actions">
                <button class="btn primary" onclick="submitReschedule(${matchId})">Confirm Reschedule</button>
                <button class="btn ghost" onclick="this.closest('.modal').remove(); closeAllModals()">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    openModal('modal-reschedule-match');
}

async function submitReschedule(matchId) {
    const newDate = $('#rescheduleDateTime').value;
    
    if (!newDate) {
        showSuccess('Please select a date and time');
        return;
    }
    
    try {
        await apiCall(`/matches/${matchId}`, {
            method: 'PUT',
            body: JSON.stringify({ match_date: newDate })
        });
        showSuccess('Match rescheduled successfully');
        document.querySelector('#modal-reschedule-match')?.remove();
        closeAllModals();
        await fetchMatches();
        renderMatches();
    } catch (error) {
        showSuccess('Error: ' + error.message);
    }
}


// INITIALIZATION


async function loadAllDataAndRenderUI() {
    try {
        await Promise.all([
            fetchEvents(),
            fetchActiveEvent(),
            fetchSports(),
            fetchVenues()
        ]);
        
        // After getting active event, fetch filtered data
        await Promise.all([
            fetchTeams(),
            fetchMatches(),
            fetchPoints(),
            fetchPendingTeams()
        ]);
        
        renderEvents();
        renderTeams();
        renderSports();
        renderMatches();
        renderPoints();
        renderVenues();
        updateHomeRecaps();
        populateLeaderboardFilters();
        // Populate match sport filter
        const matchSportFilter = $('#matchSportFilter');
        if (matchSportFilter) {
            matchSportFilter.innerHTML = '<option value="">All Sports</option>' +
            APP_DATA.sports.map(s => `<option value="${s.sport_id}">${s.sport_name}</option>`).join('');
        }
        updateActionButtons();
        
        if (APP_DATA.currentUser) {
            if (APP_DATA.currentUser.role === 'manager') {
                await updateManagerDashboard();
            } else {
                await updateAdminDashboard();
            }
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Tournament Portal Initializing...');
    
    await checkAuthStatus();
    await loadAllDataAndRenderUI();
    
    if (APP_DATA.currentUser) {
        if (APP_DATA.currentUser.role === 'admin') {
            showPage('adminDashboard');
        } else {
            showPage('managerDashboard');
        }
    } else {
        showPage('home');
    }
    
    const matchEventSelect = $('#matchEvent');
if (matchEventSelect) {
    matchEventSelect.addEventListener('change', loadTeamsForSport);
}

console.log('✅ Tournament Portal Ready!')});

window.APP_DATA = APP_DATA;
window.showPage = showPage;
window.apiCall = apiCall;

console.log('📦 App.js loaded successfully');
