// Enhanced Service Worker for MeshNet PWA
const MESH_CACHE_NAME = 'mesh-network-v1';
const MESH_DATA_CACHE = 'mesh-data-v1';
const MESH_API_CACHE = 'mesh-api-v1';

// Files to cache immediately on install
const PRECACHE_FILES = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
];

// Install event - cache core files
self.addEventListener('install', (event) => {
  console.log('[MeshNet SW] Installing service worker');
  event.waitUntil(
    caches.open(MESH_CACHE_NAME).then((cache) => {
      console.log('[MeshNet SW] Precaching core files');
      return cache.addAll(PRECACHE_FILES);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[MeshNet SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== MESH_CACHE_NAME && 
              cacheName !== MESH_DATA_CACHE && 
              cacheName !== MESH_API_CACHE) {
            console.log('[MeshNet SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - handle different caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle mesh topology requests
  if (url.pathname === '/api/mesh/topology') {
    event.respondWith(handleTopologyRequest(request));
    return;
  }

  // Handle static assets
  if (request.destination === 'script' || 
      request.destination === 'style' ||
      request.destination === 'image') {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Default: network first with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// API request handler - NetworkFirst with cache fallback
async function handleApiRequest(request) {
  const cache = await caches.open(MESH_API_CACHE);
  
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const clonedResponse = response.clone();
      await cache.put(request, clonedResponse);
    }
    
    return response;
  } catch (error) {
    console.log('[MeshNet SW] Network failed, trying cache:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline fallback for API errors
    return new Response(JSON.stringify({
      error: 'offline',
      message: 'No network connection and no cached data available'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503
    });
  }
}

// Topology request handler - CacheFirst with network fallback
async function handleTopologyRequest(request) {
  const cache = await caches.open(MESH_DATA_CACHE);
  
  try {
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Return cached data immediately
      fetch(request).then((response) => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      }).catch(() => {});
      
      return cachedResponse;
    }
    
    // No cache, try network
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[MeshNet SW] Topology request failed:', error);
    return new Response(JSON.stringify({
      nodes: [],
      edges: [],
      updatedAt: new Date().toISOString(),
      cached: false
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }
}

// Static asset handler - CacheFirst
async function handleStaticAsset(request) {
  const cache = await caches.open(MESH_CACHE_NAME);
  
  try {
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[MeshNet SW] Static asset failed:', request.url);
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Navigation request handler - NetworkFirst with offline fallback
async function handleNavigationRequest(request) {
  const cache = await caches.open(MESH_CACHE_NAME);
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const clonedResponse = response.clone();
      await cache.put(request, clonedResponse);
    }
    
    return response;
  } catch (error) {
    console.log('[MeshNet SW] Navigation failed, trying cache');
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page
    const offlineResponse = await cache.match('/offline.html');
    if (offlineResponse) {
      return offlineResponse;
    }
    
    return new Response('Offline - No cached version available', { status: 503 });
  }
}

// Background sync for mesh messages
self.addEventListener('sync', (event) => {
  console.log('[MeshNet SW] Background sync:', event.tag);
  
  if (event.tag === 'mesh-sync') {
    event.waitUntil(syncMeshMessages());
  }
  
  if (event.tag === 'mesh-heartbeat') {
    event.waitUntil(sendHeartbeat());
  }
});

// Sync queued mesh messages
async function syncMeshMessages() {
  try {
    const cache = await caches.open(MESH_DATA_CACHE);
    const queuedMessages = await cache.match('/mesh-queued-messages');
    
    if (queuedMessages) {
      const messages = await queuedMessages.json();
      
      for (const message of messages) {
        try {
          const response = await fetch('/api/mesh/messages/relay', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Mesh-Secret': localStorage.getItem('mesh-secret') || ''
            },
            body: JSON.stringify(message)
          });
          
          if (response.ok) {
            // Remove from queue
            messages.splice(messages.indexOf(message), 1);
          }
        } catch (error) {
          console.log('[MeshNet SW] Failed to sync message:', error);
        }
      }
      
      // Update queue
      await cache.put('/mesh-queued-messages', new Response(JSON.stringify(messages)));
    }
  } catch (error) {
    console.log('[MeshNet SW] Sync failed:', error);
  }
}

// Send heartbeat to mesh server
async function sendHeartbeat() {
  try {
    const deviceId = localStorage.getItem('mesh-device-id');
    if (!deviceId) return;
    
    const response = await fetch(`/api/mesh/nodes/${deviceId}/heartbeat`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Mesh-Secret': localStorage.getItem('mesh-secret') || ''
      },
      body: JSON.stringify({
        signal: 80,
        batteryPercentage: getBatteryLevel(),
        bluetoothStatus: true,
        wifiStatus: true
      })
    });
    
    console.log('[MeshNet SW] Heartbeat sent:', response.ok);
  } catch (error) {
    console.log('[MeshNet SW] Heartbeat failed:', error);
  }
}

// Get battery level if available
function getBatteryLevel() {
  if ('getBattery' in navigator) {
    return (navigator as any).getBattery().then((battery: any) => {
      return Math.round(battery.level * 100);
    });
  }
  return 100;
}

// Push notifications for emergency alerts
self.addEventListener('push', (event) => {
  console.log('[MeshNet SW] Push notification received');
  
  let data = {
    title: 'MeshNet Alert',
    body: 'New emergency message',
    icon: '/icons/icon-192.svg',
    tag: 'mesh-emergency',
    requireInteraction: true,
    data: { url: '/emergency' }
  };
  
  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (error) {
      console.log('[MeshNet SW] Failed to parse push data:', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      tag: data.tag,
      requireInteraction: data.requireInteraction,
      data: data.data
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[MeshNet SW] Notification clicked');
  
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Message handling from clients
self.addEventListener('message', (event) => {
  console.log('[MeshNet SW] Message from client:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_TOPOLOGY') {
    event.waitUntil(cacheTopology());
  }
});

// Cache topology on demand
async function cacheTopology() {
  try {
    const cache = await caches.open(MESH_DATA_CACHE);
    const response = await fetch('/api/mesh/topology');
    
    if (response.ok) {
      await cache.put('/api/mesh/topology', response.clone());
      console.log('[MeshNet SW] Topology cached');
    }
  } catch (error) {
    console.log('[MeshNet SW] Failed to cache topology:', error);
  }
}

console.log('[MeshNet SW] Service worker loaded');
