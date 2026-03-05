(() => {
  const API_ORIGIN = window.location.origin.includes('5500')
    ? 'http://localhost:3000'
    : window.location.origin;
  const api = (path) => `${API_ORIGIN}${path}`;

  const ordersEl = document.getElementById('orders-count');
  const revenueEl = document.getElementById('revenue');
  const menuEl = document.getElementById('menu-items');

  const fmtNum = (n) => Number(n || 0).toLocaleString('ru-RU');
  const fmtMoney = (n) => `${fmtNum(n)}₽`;

  const loadStats = async () => {
    if (!ordersEl && !revenueEl && !menuEl) return;
    try {
      const res = await fetch(api('/api/stats'));
      if (!res.ok) return;
      const data = await res.json();
      if (ordersEl) ordersEl.textContent = fmtNum(data.ordersCount);
      if (revenueEl) revenueEl.textContent = fmtMoney(data.revenueClosed);
      if (menuEl) menuEl.textContent = fmtNum(data.menuCount);
    } catch (err) {
      // silent fallback to static numbers
      console.warn('stats not loaded', err.message);
    }
  };

  document.addEventListener('DOMContentLoaded', loadStats);
})();
