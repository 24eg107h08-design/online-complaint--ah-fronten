/**
 * Online Complaint Management System - Authentication Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavbarAuth();

    // Check if on Login Page
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        handleLoginPage(loginForm);
    }

    // Check if on Register Page
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        handleRegisterPage(registerForm);
    }
});

// Update navbar with user info or guest links
function initNavbarAuth() {
    const user = Auth.getUser();
    const navAuthContainer = document.getElementById('nav-auth-container');
    if (!navAuthContainer) return;

    if (Auth.isAuthenticated() && user) {
        const dashboardLink = user.role === 'ROLE_ADMIN' ? 'admin-dashboard.html' : 'dashboard.html';
        const roleLabel = user.role === 'ROLE_ADMIN' ? 'Administrator' : 'Citizen';

        navAuthContainer.innerHTML = `
            <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle text-white d-flex align-items-center gap-2" href="#" role="button" data-bs-toggle="dropdown">
                    <span class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style="width:32px; height:32px; font-weight:600;">
                        ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </span>
                    <span class="d-none d-md-inline">${user.name}</span>
                </a>
                <ul class="dropdown-menu dropdown-menu-end shadow">
                    <li><h6 class="dropdown-header">${roleLabel}</h6></li>
                    <li><a class="dropdown-item" href="${dashboardLink}"><i class="bi bi-speedometer2 me-2"></i>Dashboard</a></li>
                    ${user.role !== 'ROLE_ADMIN' ? '<li><a class="dropdown-item" href="submit-complaint.html"><i class="bi bi-plus-circle me-2"></i>Lodge Complaint</a></li>' : ''}
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="Auth.logout()"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
                </ul>
            </li>
        `;
    } else {
        navAuthContainer.innerHTML = `
            <li class="nav-item">
                <a class="nav-link text-white" href="login.html"><i class="bi bi-box-arrow-in-right me-1"></i>Login</a>
            </li>
            <li class="nav-item ms-lg-2">
                <a class="btn btn-outline-light btn-sm" href="register.html"><i class="bi bi-person-plus me-1"></i>Register</a>
            </li>
        `;
    }
}

// -------------------------------------------------------------------
// Login Handlers
// -------------------------------------------------------------------
function handleLoginPage(form) {
    // If already logged in, redirect
    if (Auth.isAuthenticated()) {
        redirectBasedOnRole(Auth.getUser());
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const alertEl = document.getElementById('login-alert');

        if (alertEl) alertEl.classList.add('d-none');

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showAlert(alertEl, 'Please provide both email and password.');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Authenticating...';

            const response = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (response.success && response.data) {
                Auth.setToken(response.data.token);
                Auth.setUser(response.data);
                showToast('Login successful! Redirecting...', 'success');
                setTimeout(() => redirectBasedOnRole(response.data), 800);
            } else {
                showAlert(alertEl, response.message || 'Invalid credentials.');
            }
        } catch (error) {
            showAlert(alertEl, error.message || 'Login failed. Please check your credentials.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Sign In';
        }
    });
}

function redirectBasedOnRole(user) {
    if (user && user.role === 'ROLE_ADMIN') {
        window.location.href = 'admin-dashboard.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

// Quick demo credential filler for demo/presentation
function fillDemoCredentials(role) {
    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('password');

    if (!emailInput || !passInput) return;

    if (role === 'admin') {
        emailInput.value = 'admin@cms.com';
        passInput.value = 'admin123';
        showToast('Filled Demo Administrator credentials', 'info');
    } else {
        emailInput.value = 'user@cms.com';
        passInput.value = 'user123';
        showToast('Filled Demo Citizen credentials', 'info');
    }
}

function fillRandomCitizenRegistration() {
    const firstNames = ['Vikram', 'Priya', 'Rahul', 'Sneha', 'Ananya', 'Rohan', 'Kavita', 'Arjun', 'Meera', 'Aditya'];
    const lastNames = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Singh', 'Deshmukh', 'Nair', 'Iyer', 'Chatterjee', 'Gupta'];
    
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const randNum = Math.floor(100 + Math.random() * 900);
    
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const passInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirmPassword');

    if (nameInput) nameInput.value = `${fn} ${ln}`;
    if (emailInput) emailInput.value = `${fn.toLowerCase()}.${ln.toLowerCase()}${randNum}@example.com`;
    if (phoneInput) phoneInput.value = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    if (passInput) passInput.value = 'citizen123';
    if (confirmInput) confirmInput.value = 'citizen123';

    showToast(`Filled random citizen: ${fn} ${ln}`, 'info');
}

// -------------------------------------------------------------------
// Register Handlers
// -------------------------------------------------------------------
function handleRegisterPage(form) {
    if (Auth.isAuthenticated()) {
        redirectBasedOnRole(Auth.getUser());
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const alertEl = document.getElementById('register-alert');

        if (alertEl) alertEl.classList.add('d-none');

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validations
        if (password.length < 6) {
            showAlert(alertEl, 'Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            showAlert(alertEl, 'Passwords do not match. Please verify.');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating Account...';

            const response = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    email,
                    phone,
                    password,
                    role: 'USER'
                })
            });

            if (response.success && response.data) {
                Auth.setToken(response.data.token);
                Auth.setUser(response.data);
                showToast('Registration successful! Welcome to the portal.', 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            }
        } catch (error) {
            showAlert(alertEl, error.message || 'Registration failed. Please check the details.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-person-check me-2"></i>Create Citizen Account';
        }
    });
}

function showAlert(el, msg) {
    if (el) {
        el.textContent = msg;
        el.classList.remove('d-none');
    } else {
        showToast(msg, 'error');
    }
}
