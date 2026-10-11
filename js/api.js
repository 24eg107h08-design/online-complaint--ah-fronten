/**
 * Online Complaint Management System - API Client & Utility Module
 */

const API_CONFIG = {
    BASE_URL: `${window.location.origin}/api`,
    TOKEN_KEY: 'cms_jwt_token',
    USER_KEY: 'cms_user_data'
};

const Auth = {
    getToken() {
        return localStorage.getItem(API_CONFIG.TOKEN_KEY);
    },

    setToken(token) {
        localStorage.setItem(API_CONFIG.TOKEN_KEY, token);
    },

    getUser() {
        try {
            return JSON.parse(localStorage.getItem(API_CONFIG.USER_KEY) || 'null');
        } catch {
            return null;
        }
    },

    setUser(userData) {
        localStorage.setItem(API_CONFIG.USER_KEY, JSON.stringify(userData));
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    isAdmin() {
        const user = this.getUser();
        return !!user && user.role === 'ROLE_ADMIN';
    },

    logout() {
        const token = this.getToken();
        if (token) {
            fetch(`${API_CONFIG.BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            }).catch(error => console.error('Failed to end server session:', error));
        }
        localStorage.removeItem(API_CONFIG.TOKEN_KEY);
        localStorage.removeItem(API_CONFIG.USER_KEY);
        window.location.href = 'login.html';
    },

    requireAuth(allowedRole = null) {
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        if (allowedRole === 'ROLE_ADMIN' && !this.isAdmin()) {
            window.location.href = 'dashboard.html';
            return false;
        }
        return true;
    }
};

async function parseApiResponse(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && Auth.getToken()) {
        Auth.logout();
        throw new Error('Your session has expired. Please login again.');
    }
    if (!response.ok) {
        let errorMessage = data.message || `${fallbackMessage} (${response.status})`;
        if (data.validationErrors) {
            errorMessage += `: ${Object.values(data.validationErrors).join(', ')}`;
        }
        throw new Error(errorMessage);
    }
    return data;
}

async function apiRequest(endpoint, options = {}) {
    const headers = { ...options.headers };
    const token = Auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, { ...options, headers });
        return await parseApiResponse(response, 'Request failed');
    } catch (error) {
        console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, error);
        throw error;
    }
}

async function apiMultipartRequest(endpoint, formData) {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData
        });
        return await parseApiResponse(response, 'Upload failed');
    } catch (error) {
        console.error(`Multipart Upload Error on [${endpoint}]:`, error);
        throw error;
    }
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    const styles = {
        success: ['text-bg-success', 'bi-check-circle-fill'],
        error: ['text-bg-danger', 'bi-exclamation-octagon-fill'],
        warning: ['text-bg-warning', 'bi-exclamation-triangle-fill'],
        info: ['text-bg-primary', 'bi-info-circle-fill']
    };
    const [background, icon] = styles[type] || ['text-bg-secondary', 'bi-bell-fill'];
    const toast = document.createElement('div');
    toast.className = `toast align-items-center ${background} border-0 shadow`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    const row = document.createElement('div');
    row.className = 'd-flex';
    const body = document.createElement('div');
    body.className = 'toast-body d-flex align-items-center gap-2';
    const iconElement = document.createElement('i');
    iconElement.className = `bi ${icon} fs-5`;
    const text = document.createElement('span');
    text.textContent = message;
    body.append(iconElement, text);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close btn-close-white me-2 m-auto';
    close.dataset.bsDismiss = 'toast';
    close.setAttribute('aria-label', 'Close');
    row.append(body, close);
    toast.appendChild(row);
    container.appendChild(toast);

    if (window.bootstrap && window.bootstrap.Toast) {
        const instance = new bootstrap.Toast(toast, { delay: 4500 });
        toast.addEventListener('hidden.bs.toast', () => toast.remove());
        instance.show();
    } else {
        setTimeout(() => toast.remove(), 4500);
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusBadgeHtml(status) {
    const icons = {
        SUBMITTED: 'bi-clock-history',
        IN_PROGRESS: 'bi-arrow-repeat',
        RESOLVED: 'bi-check-circle',
        REJECTED: 'bi-x-circle'
    };
    const cleanStatus = status ? String(status).replaceAll('_', ' ') : 'UNKNOWN';
    const safeStatus = /^[A-Z_]+$/.test(status || '') ? status : 'UNKNOWN';
    return `<span class="badge-status badge-${safeStatus}"><i class="bi ${icons[safeStatus] || 'bi-circle'}"></i> ${escapeHtml(cleanStatus)}</span>`;
}

function getCategoryBadgeHtml(category) {
    const icons = {
        Electricity: 'bi-lightning-charge-fill text-warning',
        Water: 'bi-droplet-fill text-primary',
        Roads: 'bi-cone-striped text-danger',
        Sanitation: 'bi-trash-fill text-success',
        Education: 'bi-book-fill text-info',
        Other: 'bi-tag-fill text-secondary'
    };
    return `<span class="badge badge-category"><i class="bi ${icons[category] || 'bi-tag-fill text-secondary'} me-1"></i>${escapeHtml(category || 'Other')}</span>`;
}
