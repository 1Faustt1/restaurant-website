(() => {
  const SESSION_KEY = 'shaurmechka_session';

  const allowedPages = ['index.html', '', 'login.html', 'booking.html', 'order.html', 'booking', 'order'];

  const getPageName = () => {
    const last = window.location.pathname.split('/').pop() || '';
    return last.toLowerCase();
  };

  const safeParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  };

  const getSession = () => safeParse(localStorage.getItem(SESSION_KEY));

  const setSession = (user) => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ login: user.login, role: user.role || 'Сотрудник' })
    );
  };

  const clearSession = () => localStorage.removeItem(SESSION_KEY);

  const API_ORIGIN = window.location.origin.includes('5500')
    ? 'http://localhost:3000'
    : window.location.origin;
  const api = (path) => `${API_ORIGIN}${path}`;

  const authenticate = async (login, password) => {
    const res = await fetch(api('/api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Неверный логин или пароль');
    }

    const data = await res.json();
    setSession({ login: data.login, role: data.role });
    return data;
  };

  const guard = () => {
    const page = getPageName();
    const isPublic = allowedPages.includes(page);

    if (!isPublic && !getSession()) {
      const target = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `login.html?from=${target}`;
    }
  };

  const renderHeader = () => {
    const link = document.querySelector('.header__container-right-link');
    if (!link) return;

    const session = getSession();
    const page = getPageName();

    link.onclick = null;

    if (session) {
      if (page === 'staff-menu.html') {
        link.textContent = session.role || 'Профиль';
        link.href = '#';
        link.onclick = (event) => {
          event.preventDefault();
          clearSession();
          window.location.href = 'index.html';
        };
      } else {
        link.textContent = 'Меню сотрудника';
        link.href = 'staff-menu.html';
      }
    } else {
      link.textContent = 'Логин';
      link.href = 'login.html';
    }
  };

  const wireLoginForm = () => {
    const form = document.querySelector('.main__form');
    if (!form) return;

    const loginInput = document.querySelector('#login');
    const passwordInput = document.querySelector('#password');
    const errorEl = document.querySelector('[data-login-error]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (errorEl) errorEl.textContent = '';

      const login = (loginInput?.value || '').trim();
      const password = passwordInput?.value || '';

      if (!login || !password) {
        if (errorEl) errorEl.textContent = 'Введите логин и пароль';
        return;
      }

      try {
        await authenticate(login, password);
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('from') || 'staff-menu.html';
        window.location.href = redirect;
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message || 'Ошибка авторизации';
      }
    });

    const session = getSession();
    if (session) {
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('from') || 'staff-menu.html';
      window.location.replace(redirect);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    guard();
    renderHeader();
    wireLoginForm();
  });
})();
