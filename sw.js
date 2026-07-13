const CACHE_NAME = 'reminder-cache-v3'; 
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './alarm.wav',
  './icon.png'
];

let backgroundReminders = [];
let backgroundTimer = null;

// Install Event - Cache all local files for offline usage
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event - Clean up old caches if necessary
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Fetch Event - Serve files from cache when offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});

// Listen for updates from app.js when reminders change
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    backgroundReminders = event.data.reminders;
    
    // Reset structural tracking intervals cleanly
    if (backgroundTimer) {
      clearInterval(backgroundTimer);
    }
    backgroundTimer = setInterval(checkDueReminders, 60000); 
  }
});

// Background Clock Engine
function checkDueReminders() {
  const now = new Date();
  
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = new Date(now.getTime() - offset);
  
  const curDate = localISOTime.toISOString().split('T')[0]; 
  const curTime = localISOTime.toTimeString().slice(0, 5); 

  backgroundReminders.forEach(item => {
    if (!item.completed && item.date === curDate && item.time === curTime) {
      self.registration.showNotification(`⏰ Task Due: ${item.title}`, {
        body: `Category: ${item.category.toUpperCase()}`,
        icon: './icon.png', 
        sound: './alarm.wav', 
        tag: `reminder-${item.id}`,
        requireInteraction: true 
      });
    }
  });
}
// Listen for clicks on the notification banner or its interactive buttons
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const reminderId = notification.data ? notification.data.reminderId : null;

  // Always close the notification banner once an action is taken
  notification.close();

  if (action === 'complete-task' && reminderId) {
    // 1. Interactive Button: Mark complete directly from the lockscreen
    event.waitUntil(
      /* 
        Optional Backend/IndexedDB sync can happen here.
        For standard localStorage, we wake up or focus the app window 
        so it can sync the completion state instantly.
      */
      focusOrCreateWindow(event)
    );
  } else {
    // 2. Clicked the banner itself or the "View Details" button
    event.waitUntil(
      focusOrCreateWindow(event)
    );
  }
});

// Helper function to focus the app tab or open it if it's closed
function focusOrCreateWindow(event) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      // If the app is already open in a background tab, bring it to the front
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // If the app is completely closed, open a fresh window instance
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    });
}