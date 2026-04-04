const CACHE_NAME = 'gymlog-pro-v1';
// Das sind die Dinge, die der Butler in seinen Rucksack packt, 
// damit die App auch ohne Internet im Gym blitzschnell lädt:
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// 1. INSTALLATION: Der Butler zieht ein und packt seinen Rucksack
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Butler hat alle Dateien gesichert.');
            return cache.addAll(urlsToCache);
        })
    );
});

// 2. FETCH: Der Butler steht an der Tür und fängt alle Anfragen ab
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // Wenn die Datei im Rucksack (Cache) ist, gib sie sofort zurück.
            // Ansonsten lade sie ganz normal aus dem Internet.
            return response || fetch(event.request);
        })
    );
});

// 3. PUSH: Der Butler lauscht auf eingehende Benachrichtigungen (auch wenn die App zu ist)
self.addEventListener('push', event => {
    const title = 'GymLog Pro';
    const options = {
        // Falls ein extra Text mitgeschickt wird, zeige ihn. Ansonsten der Standard-Text:
        body: event.data ? event.data.text() : 'Guten Morgen! Zeit für deinen Check-In ☀️',
        icon: 'https://cdn-icons-png.flaticon.com/512/2964/2964082.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2964/2964082.png'
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// 4. KLICK: Was passiert, wenn du auf die Benachrichtigung tippst?
self.addEventListener('notificationclick', event => {
    event.notification.close(); // Schließt die Benachrichtigung oben auf dem Handy
    event.waitUntil(clients.openWindow('/')); // Öffnet die App
});