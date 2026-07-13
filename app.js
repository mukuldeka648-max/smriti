if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker Registered!'))
      .catch(err => console.log('Registration failed: ', err));
  });
}
const alarmAudio = new Audio('alarm.wav');
alarmAudio.loop = true; 

// 2. MAIN STATE METRICS
let activeFilter = 'today'; 
let selectedAlertId = null;

// Synchronize local browser system time elements
const sysDate = new Date();
const activeToday = `${sysDate.getFullYear()}-${String(sysDate.getMonth() + 1).padStart(2, '0')}-${String(sysDate.getDate()).padStart(2, '0')}`;

// Cleared baseline array so public users start completely fresh
const initialDataset = [];

let reminders = JSON.parse(localStorage.getItem('family_reminders')) || initialDataset;

// 3. CORE RUNTIME APP LAUNCHPAD
window.addEventListener('DOMContentLoaded', () => {
  checkUserIdentity(); 
  initFormInteractions();
  renderReminders();
  startRealTimeClockEngine();
  updateLiveHeaderStrings();
  initBottomDockNavigation();
  
  // Request notification permissions right away when app loads
 initInteractivePermissionCard();
  
  // Sync existing database items to the service worker on boot
  setTimeout(saveToDeviceStorage, 1000);
});

function saveToDeviceStorage() {
  localStorage.setItem('family_reminders', JSON.stringify(reminders));
  
  // Sync the updated list to the Service Worker for background operations
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_REMINDERS',
      reminders: reminders
    });
  }

  // Schedule native OS-level alerts if the browser natively supports Notification Triggers
  if ('Notification' in window && 'showTrigger' in Notification) {
    reminders.forEach(item => {
      if (!item.completed) {
        const scheduledTime = new Date(`${item.date}T${item.time}`).getTime();
        if (scheduledTime > Date.now()) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(`⏰ Task Due: ${item.title}`, {
              body: `Category: ${item.category.toUpperCase()}`,
              icon: './icon.png',
              tag: `reminder-${item.id}`,
              showTrigger: new TimestampTrigger(scheduledTime),
              requireInteraction: true,

             actions:[
              {
                action:'complete-task',
                title: '✅ Mark Complete',
                icon: './icon.png' 
              },
              {
                action:'open-app',
                title: '🔍 View Details'
              }
             ],
             data:{
              reminderID: item.id
             }
            });
          });
        }
      }
    });
  }
}

function updateLiveHeaderStrings() {
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const currentFormattedDate = new Date().toLocaleDateString('en-US', options);
  const dateEl = document.getElementById('live-date-string');
  if (dateEl) dateEl.textContent = currentFormattedDate;
}

// 4. PERSISTENT USER CUSTOM NAME ONBOARDING PROMPT
function checkUserIdentity(forceUpdate = false) {
  let savedName = localStorage.getItem('reminder_user_name');
  
  if (!savedName || forceUpdate) {
    const modal = document.getElementById('onboarding-modal');
    const inputField = document.getElementById('onboarding-name-input');
    if (modal) {
      modal.classList.remove('hidden');
      if (forceUpdate && inputField && savedName) {
        inputField.value = savedName;
      } 
    }
    return;
  }
  
  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = savedName;
}

function submitUserIdentity() {
  const inputField = document.getElementById('onboarding-name-input');
  let enteredName = inputField ? inputField.value.trim() : "";
  
  if (enteredName === "") {
    enteredName = "Guest";
  }
  
  localStorage.setItem('reminder_user_name', enteredName);
  
  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = enteredName;
  
  document.getElementById('onboarding-modal').classList.add('hidden');
}

// 5. INTERACTIVE FORM ELEMENT PICKERS
function initFormInteractions() {
  const catCards = document.querySelectorAll('.cat-select-card');
  catCards.forEach(card => {
    card.addEventListener('click', () => {
      catCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      document.getElementById('form-category').value = card.getAttribute('data-value');
    });
  });

  const priBtns = document.querySelectorAll('.pri-select-btn');
  priBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      priBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('form-priority').value = btn.getAttribute('data-value');
    });
  });
}

// 6. MASTER DATA RENDER PIPELINE
function renderReminders(customDataset = null, customTitle = null) {
  const container = document.getElementById('reminders-container');
  if (!container) return;
  container.innerHTML = '';

  const targetSource = customDataset || reminders;

  const filtered = targetSource.filter(item => {
    if (customDataset) return true; 
    if (activeFilter === 'completed') return item.completed;
    if (activeFilter === 'today') return !item.completed && item.date === activeToday;
    if (activeFilter === 'upcoming') return !item.completed && item.date > activeToday;
    return true; 
  });

  const sectionTitle = document.getElementById('section-title');
  if (sectionTitle) {
    if (customTitle) {
      sectionTitle.textContent = customTitle;
    } else {
      if (activeFilter === 'today') sectionTitle.textContent = "Today's Tasks";
      if (activeFilter === 'upcoming') sectionTitle.textContent = "Upcoming Tasks";
      if (activeFilter === 'completed') sectionTitle.textContent = "Completed Tasks";
      if (activeFilter === 'all') sectionTitle.textContent = "All Active Tasks";
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = `<p style="text-align:center;font-size:13px;color:#9ca3af;padding:20px;">No tasks recorded here.</p>`;
    updateMetrics();
    return;
  }

  const priorityWeight = { 'High': 3, 'Medium': 2, 'Low': 1 };
  filtered.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));

  filtered.forEach(item => {
    let categoryIcon = "📋";
    if (item.category === "Work") categoryIcon = "💼";
    if (item.category === "Study") categoryIcon = "📚";
    if (item.category === "Health") categoryIcon = "❤️";
    if (item.category === "Personal") categoryIcon = "🎁";

    const card = document.createElement('div');
    card.className = `reminder-card ${item.completed ? 'completed' : ''}`;
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 14px; flex: 1;" onclick="triggerAlertView(${item.id})">
        <div style="font-size: 20px; background: #f3f4f6; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${categoryIcon}
        </div>
        <div>
          <span style="font-size: 11px; color: #6b7280; font-weight: 700; display: block; margin-bottom: 2px; text-transform: uppercase;">• ${item.category}</span>
          <h4>${item.title}</h4>
          ${item.notes ? `<p class="notes-preview">${item.notes}</p>` : ''}
          <span class="time-badge">🕒 ${formatTimeToAMPM(item.time)} | 📅 ${formatDateToShort(item.date)}</span>
        </div>
      </div>
      <div style="display: flex;align-items:center;gap:12px;position:relative;z-index:5;">
        <div class="checkbox-trigger" onclick="toggleComplete(${item.id}); event.stopPropagation();"></div>
        <button style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:4px;" onclick="deleteReminder(${item.id});event.stopPropagation();">🗑️</button>
      </div>
      <span class="priority-pill ${item.priority.toLowerCase()}" style="right:70px;">${item.priority}</span>
    `;
    container.appendChild(card);
  });

  updateMetrics();
}

// 7. BOTTOM DOCK CLICK ACTION DELEGATION
function initBottomDockNavigation() {
  const dockItems = document.querySelectorAll('.bottom-nav-dock .nav-dock-item');
  
  dockItems.forEach((item, index) => {
    item.removeAttribute('onclick'); 
    
    item.addEventListener('click', () => {
      dockItems.forEach(d => d.classList.remove('active'));
      item.classList.add('active');

      if (index === 0) { 
        filterReminders('today');
      } else if (index === 1) { 
        filterReminders('upcoming');
      } else if (index === 2) { 
        showCategoriesView();
      } else if (index === 3) { 
        checkUserIdentity(true);
      }
    });
  });
}

function showCategoriesView() {
  activeFilter = 'all';
  const sortedByCat = [...reminders].sort((a, b) => a.category.localeCompare(b.category));
  renderReminders(sortedByCat, "Tasks by Category");
}

// 8. DASHBOARD NAVIGATION METRIC CARDS
function filterReminders(filterType) {
  activeFilter = filterType;
  const tabs = ['today', 'upcoming', 'completed', 'all'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.remove('active');
  });
  
  const activeTabEl = document.getElementById(`tab-${filterType}`);
  if (activeTabEl) activeTabEl.classList.add('active');

  document.getElementById('search-input').value = '';
  renderReminders();
}

// 9. LIVE STRING SEARCH FILTERS
function handleSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  if (query === '') {
    renderReminders();
    return;
  }

  const matches = reminders.filter(item => 
    item.title.toLowerCase().includes(query) || 
    item.notes.toLowerCase().includes(query) ||
    item.category.toLowerCase().includes(query)
  );

  renderReminders(matches, `Search Results (${matches.length})`);
}

// 10. DATABASE MUTATION METRICS
function toggleComplete(id) {
  const item = reminders.find(r => r.id === id);
  if (item) {
    item.completed = !item.completed;
    saveToDeviceStorage();
    renderReminders();
  }
}

function createNewReminder(e) {
  e.preventDefault();
  const newId = reminders.length > 0 ? Math.max(...reminders.map(r => r.id)) + 1 : 1;
  
  const newItem = {
    id: newId,
    title: document.getElementById('form-title').value,
    notes: document.getElementById('form-notes').value,
    date: document.getElementById('form-date').value,
    time: document.getElementById('form-time').value,
    category: document.getElementById('form-category').value,
    priority: document.getElementById('form-priority').value,
    completed: false
  };

  reminders.push(newItem);
  saveToDeviceStorage();
  closeAddModal();
  renderReminders();
}

function updateMetrics() {
  document.getElementById('count-all').textContent = reminders.length;
  document.getElementById('count-completed').textContent = reminders.filter(r => r.completed).length;
  document.getElementById('count-today').textContent = reminders.filter(r => !r.completed && r.date === activeToday).length;
  document.getElementById('count-upcoming').textContent = reminders.filter(r => !r.completed && r.date > activeToday).length;
}

// 11. MODAL HANDLING TRIGGERS
function openAddModal() {
  document.getElementById('form-date').value = activeToday;
  document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
  document.getElementById('reminder-form').reset();
  
  document.querySelectorAll('.cat-select-card').forEach(c => c.classList.remove('active'));
  document.querySelector('.cat-select-card[data-value="Work"]').classList.add('active');
  document.getElementById('form-category').value = "Work";

  document.querySelectorAll('.pri-select-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.pri-select-btn[data-value="Medium"]').classList.add('active');
  document.getElementById('form-priority').value = "Medium";
}

function closeAddModalViaOverlay(e) {
  if (e.target.id === 'add-modal') closeAddModal();
}

// ==========================================
// 12. ALARM DIALOG AND AUDIO UTILITIES
// ==========================================
function triggerAlertView(id) {
  const item = reminders.find(r => r.id === id);
  if (!item) return;

  selectedAlertId = id;
  document.getElementById('alert-title').textContent = item.title;
  document.getElementById('alert-notes').textContent = item.notes || 'No contextual notes recorded.';
  document.getElementById('alert-category').textContent = `⚡ ${item.category.toUpperCase()}`;
  document.getElementById('alert-time-string').textContent = formatTimeToAMPM(item.time);
  document.getElementById('alert-date-string').textContent = formatDateToShort(item.date);

  document.getElementById('alert-modal').classList.remove('hidden');
  
  alarmAudio.play().catch(() => {
    console.log("Audio alert playback waiting for user context interactions.");
  });
}

function dismissAlert() {
  if (selectedAlertId) toggleComplete(selectedAlertId);
  closeAlertModal();
}

function closeAlertModal() {
  document.getElementById('alert-modal').classList.add('hidden');
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
}

// 13. RUNTIME SYSTEM CLOCK LONG POLLS
function startRealTimeClockEngine() {
  setInterval(() => {
    const now = new Date();
    
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; 
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const clockTimeEl = document.getElementById('live-clock-time');
    const clockAmpmEl = document.getElementById('live-clock-ampm');
    
    if (clockTimeEl) clockTimeEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}`;
    if (clockAmpmEl) clockAmpmEl.textContent = ampm;

    const currentTimeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    reminders.forEach(item => {
      if (!item.completed && item.date === currentDateString && item.time === currentTimeString) {
        const alertModal = document.getElementById('alert-modal');
        if (alertModal && alertModal.classList.contains('hidden')) {
          triggerAlertView(item.id);
        }
      }
    });
  }, 1000);
}

// 14. TIME CONVERSION FORMATTERS
function formatTimeToAMPM(timeString) {
  const [H, M] = timeString.split(':');
  const h = H % 12 || 12;
  const ampm = H >= 12 ? 'PM' : 'AM';
  return `${String(h).padStart(2, '0')}:${M} ${ampm}`;
}

function formatDateToShort(dateString) {
  const [Y, M, D] = dateString.split('-');
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(D)} ${months[parseInt(M) - 1]}`;
}

// ==========================================
// 15. DELETION AND CLEANUP ENGINES
// ==========================================
let reminderIdToDelete = null;

function deleteReminder(id) {
  reminderIdToDelete = id;
  const modal = document.getElementById('delete-modal');
  if (modal) {
    modal.querySelector('h3').textContent = "Delete Task?";
    modal.querySelector('.delete-desc').textContent = "This action cannot be undone. It will permanently remove this item from your dashboard layers.";
    
    modal.classList.remove('hidden');
    
    const confirmBtn = document.getElementById('btn-final-delete');
    if (confirmBtn) {
      confirmBtn.onclick = executeFinalDelete;
    }
  }
}

function executeFinalDelete() {
  if (reminderIdToDelete !== null) {
    reminders = reminders.filter(r => r.id !== reminderIdToDelete);
    saveToDeviceStorage();
    renderReminders();
  }
  closeDeleteModal();
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  reminderIdToDelete = null;
}

function clearAllCompleted() {
  const completedCount = reminders.filter(r => r.completed).length;
  if (completedCount === 0) return; 
  
  const modal = document.getElementById('delete-modal');
  if (modal) {
    modal.querySelector('h3').textContent = "Clear Completed?";
    modal.querySelector('.delete-desc').textContent = `Are you sure you want to permanently delete all ${completedCount} completed tasks?`;
    
    modal.classList.remove('hidden');
    
    const confirmBtn = document.getElementById('btn-final-delete');
    if (confirmBtn) {
      confirmBtn.onclick = function() {
        reminders = reminders.filter(r => !r.completed);
        saveToDeviceStorage();
        renderReminders();
        closeDeleteModal();
      };
    }
  }
}
// ==========================================
// 16. NATIVE NOTIFICATION SYSTEM PERMISSIONS
// ==========================================
function initInteractivePermissionCard() {
  if (!('Notification' in window)) return;

  const promoCard = document.getElementById('permission-promo-card');
  const grantBtn = document.getElementById('btn-grant-notifications');
  const skipBtn = document.getElementById('btn-skip-notifications');

  // If they haven't decided yet ('default'), show our interactive promo card
  if (Notification.permission === 'default') {
    if (promoCard) promoCard.classList.remove('hidden');

    if (grantBtn) {
      grantBtn.onclick = () => {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted' || permission === 'denied') {
            if (promoCard) promoCard.classList.add('hidden');
            saveToDeviceStorage(); // Sync notifications immediately if granted
          }
        });
      };
    }

    if (skipBtn) {
      skipBtn.onclick = () => {
        if (promoCard) promoCard.classList.add('hidden');
      };
    }
  } else {
    // If they already allowed or blocked it before, keep our custom card hidden
    if (promoCard) promoCard.classList.add('hidden');
  }
}