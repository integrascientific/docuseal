self.addEventListener('install', () => {
  console.log('Integra Sign app installed')
})

self.addEventListener('activate', () => {
  console.log('Integra Sign app activated')
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
