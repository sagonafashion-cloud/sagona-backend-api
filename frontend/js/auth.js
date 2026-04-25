import { request } from './api.js';
import { saveAuth } from './storage.js';

const showError = (form, message) => {
  let errorBox = form.querySelector('.error-message');
  if (!errorBox) {
    errorBox = document.createElement('p');
    errorBox.className = 'error-message';
    errorBox.style.color = '#af2e2e';
    form.appendChild(errorBox);
  }
  errorBox.textContent = message;
};

document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    saveAuth(data);
    location.href = 'shop.html';
  } catch (error) {
    showError(form, error.message);
  }
});

document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    saveAuth(data);
    location.href = data.user.role === 'admin' ? 'admin.html' : 'shop.html';
  } catch (error) {
    showError(form, error.message);
  }
});
