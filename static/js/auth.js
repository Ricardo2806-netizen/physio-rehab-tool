// ============================================================
// auth.js - Minimal frontend authentication helpers
// ============================================================

import { CONFIG } from './config.js';

// DOM helpers
function $(sel) { return document.querySelector(sel); }

export async function getCurrentUser() {
    try {
        const res = await fetch('/api/me', { credentials: 'same-origin' });
        if (!res.ok) return null;
        if (res.status === 204) return null;
        const data = await res.json().catch(()=>null);
        if (!data || Object.keys(data).length === 0) return null;
        return data;
    } catch (e) {
        return null;
    }
}

export async function login(username, password) {
    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const j = await res.json().catch(()=>({message:'Login failed'}));
        throw new Error(j.message || 'Login failed');
    }
    return res.json();
}

export async function register(username, password) {
    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const j = await res.json().catch(()=>({message:'Register failed'}));
        throw new Error(j.message || 'Register failed');
    }
    return res.json();
}

export async function logout() {
    const res = await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Logout failed');
    return res.json();
}

// ------- UI wiring -------
export function initAuthUI() {
    const loginBtn = $('#login-btn');
    const authModal = $('#login-modal');
    const closeBtn = $('#close-login-modal');
    const authForm = $('#auth-form');
    const authTitle = $('#auth-title');
    const toggleRegister = $('#auth-toggle-register');
    const authError = $('#auth-error');

    let isRegister = false;

    function showModal() { authModal.style.display = 'flex'; authError.style.display='none'; }
    function hideModal() { authModal.style.display = 'none'; }

    if (loginBtn) loginBtn.addEventListener('click', async (ev) => {
        // If already logged in, open a small profile menu with Logout option
        if (loginBtn.dataset.logged === 'true') {
            ev.stopPropagation();
            let menu = document.getElementById('auth-menu');
            if (!menu) {
                menu = document.createElement('div');
                menu.id = 'auth-menu';
                menu.style.position = 'absolute';
                menu.style.background = 'white';
                menu.style.border = '1px solid #ddd';
                menu.style.padding = '8px';
                menu.style.borderRadius = '8px';
                menu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.1)';
                menu.style.zIndex = 1200;
                const profileBtn = document.createElement('button');
                profileBtn.textContent = 'Profile';
                profileBtn.className = 'btn-small';
                profileBtn.style.display = 'block';
                profileBtn.style.width = '100%';
                profileBtn.style.marginBottom = '6px';
                profileBtn.addEventListener('click', (e)=>{
                    e.stopPropagation();
                    alert(`Logged in as ${loginBtn.textContent}`);
                });

                const logoutBtn = document.createElement('button');
                logoutBtn.textContent = 'Logout';
                logoutBtn.className = 'btn-small';
                logoutBtn.style.display = 'block';
                logoutBtn.style.width = '100%';
                logoutBtn.addEventListener('click', async (e)=>{
                    e.stopPropagation();
                    try {
                        await logout();
                        loginBtn.textContent = 'Login';
                        loginBtn.dataset.logged = 'false';
                        loginBtn.classList.remove('btn-ghost');
                        hideMenu();
                        location.reload();
                    } catch (err) { alert('Logout failed'); }
                });

                menu.appendChild(profileBtn);
                menu.appendChild(logoutBtn);
                document.body.appendChild(menu);
            }

            // Position menu under the button
            const rect = loginBtn.getBoundingClientRect();
            menu.style.left = `${rect.right - 150}px`;
            menu.style.top = `${rect.bottom + 8 + window.scrollY}px`;
            menu.style.display = 'block';

            // Close menu when clicking elsewhere
            function onDocClick() { hideMenu(); document.removeEventListener('click', onDocClick); }
            document.addEventListener('click', onDocClick);

            function hideMenu() { const m = document.getElementById('auth-menu'); if (m) m.style.display = 'none'; }
            return;
        }
        showModal();
    });

    if (closeBtn) closeBtn.addEventListener('click', hideModal);

    if (toggleRegister) toggleRegister.addEventListener('click', () => {
        isRegister = !isRegister;
        authTitle.textContent = isRegister ? 'Register' : 'Login';
        document.getElementById('auth-submit').textContent = isRegister ? 'Register' : 'Login';
        toggleRegister.textContent = isRegister ? 'Switch to Login' : 'Register';
        authError.style.display = 'none';
    });

    if (authForm) authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        authError.style.display = 'none';
        try {
            if (isRegister) await register(username, password);
            else await login(username, password);
            hideModal();
            // reflect logged-in state
            loginBtn.textContent = username;
            loginBtn.dataset.logged = 'true';
            loginBtn.classList.add('btn-ghost');
            location.reload();
        } catch (err) {
            authError.textContent = err.message || 'Authentication failed';
            authError.style.display = 'block';
        }
    });

    // On load, check current user
    window.addEventListener('DOMContentLoaded', async () => {
        const me = await getCurrentUser();
        if (me && loginBtn) {
            loginBtn.textContent = me.username;
            loginBtn.dataset.logged = 'true';
            loginBtn.classList.add('btn-ghost');
        }
    });
}
