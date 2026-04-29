import { request } from './api.js';
import { saveAuth } from './storage.js';

const showError = (form, msg) => {
  let el = form.querySelector('.error-message');

  if (!el) {
    el = document.createElement('p');
    el.className = 'error-message';
    el.style.color = 'red';
    form.appendChild(el);
  }

  el.textContent = msg;
};

/* REGISTER */
document.querySelector('#register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    const res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    saveAuth(res);
    location.href = 'shop.html';

  } catch (err) {
    showError(form, err.message);
  }
});

/* LOGIN */
document.querySelector('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    saveAuth(res);

    location.href =
      res.user.role === 'admin'
        ? 'admin.html'
        : 'index.html';

  } catch (err) {
    showError(form, err.message);
  }
});