/* Google Analytics 4, loaded once the page has finished loading and the browser is idle, so it never
   competes with the first paint or the 3D scene. The measurement ID comes from the build
   (<meta name="ga-measurement-id">); with no ID nothing is loaded and nothing is sent.
   Events carry no personal data: only a fixed label such as the enquiry path. */
const id = document.querySelector('meta[name="ga-measurement-id"]')?.content?.trim();
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

export function track(name, params = {}) {
  if (id) gtag('event', name, params);
}

function load() {
  gtag('js', new Date());
  gtag('config', id);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

if (id && /^G-[A-Z0-9]+$/.test(id)) {
  const later = () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 4000 }) : setTimeout(load, 2000));
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

// any WhatsApp link (wa.me, api.whatsapp.com, whatsapp:) counts as a click
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element && e.target.closest('a[href]');
  if (a && /^(https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/|whatsapp:)/i.test(a.getAttribute('href'))) track('whatsapp_click');
}, true);
