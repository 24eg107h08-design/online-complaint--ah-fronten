/**
 * Online Complaint Management System - API Client & Utility Module
 * Handles centralized network requests, JWT token management, and UI notifications.
 */

const API_CONFIG = {
    BASE_URL: 'http://localhost:8080/api',
    TOKEN_KEY: 'cms_jwt_token',
    USER_KEY: 'cms_user_data'
};

// -------------------------------------------------------------------
// Authentication & Storage Helpers
// -------------------------------------------------------------------
const Auth = {
    getToken() {
        return localStorage.getItem(API_CONFIG.TOKEN_KEY);
    },

    setToken(token) {
        localStorage.setItem(API_CONFIG.TOKEN_KEY, token);
    },

    getUser() {
        const userJson = localStorage.getItem(API_CONFIG.USER_KEY);
        try {
            return userJson ? JSON.parse(userJson) : null;
        } catch (e) {
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
        return user && user.role === 'ROLE_ADMIN';
    },

    logout() {
        localStorage.removeItem(API_CONFIG.TOKEN_KEY);
        localStorage.removeItem(API_CONFIG.USER_KEY);
        window.location.href = 'login.html';
    },

    requireAuth(allowedRole = null) {
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        if (allowedRole && allowedRole === 'ROLE_ADMIN' && !this.isAdmin()) {
            window.location.href = 'dashboard.html';
            return false;
        }
        return true;
    }
};

// -------------------------------------------------------------------
// Centralized Network Request Wrapper
// -------------------------------------------------------------------
async function apiRequest(endpoint, options = {}) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    const headers = options.headers || {};

    const token = Auth.getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(url, config);

        // Handle session expiration
        if (response.status === 401) {
            Auth.logout();
            throw new Error('Your session has expired. Please login again.');
        }

        const data = await response.json();

        if (!response.ok) {
            // Validation errors map or general message
            let errorMessage = data.message || `Request failed with status ${response.status}`;
            if (data.validationErrors) {
                const details = Object.values(data.validationErrors).join(', ');
                errorMessage = `${errorMessage}: ${details}`;
            }
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, error);
        throw error;
    }
}

// -------------------------------------------------------------------
// Multipart Form Upload Request
// -------------------------------------------------------------------
async function apiMultipartRequest(endpoint, formData) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    const headers = {};

    const token = Auth.getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    // Note: Do NOT set Content-Type header so browser sets multipart boundary automatically

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData
        });

        if (response.status === 401) {
            Auth.logout();
            throw new Error('Your session has expired. Please login again.');
        }

        const data = await response.json();

        if (!response.ok) {
            let errorMessage = data.message || `Upload failed with status ${response.status}`;
            if (data.validationErrors) {
                const details = Object.values(data.validationErrors).join(', ');
                errorMessage = `${errorMessage}: ${details}`;
            }
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        console.error(`Multipart Upload Error on [${endpoint}]:`, error);
        throw error;
    }
}

// -------------------------------------------------------------------
// Toast Alert Notification System
// -------------------------------------------------------------------
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    const toastId = 'toast-' + Date.now();
    const bgClass = {
        success: 'text-bg-success',
        error: 'text-bg-danger',
        warning: 'text-bg-warning',
        info: 'text-bg-primary'
    }[type] || 'text-bg-secondary';

    const iconClass = {
        success: 'bi-check-circle-fill',
        error: 'bi-exclamation-octagon-fill',
        warning: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill'
    }[type] || 'bi-bell-fill';

    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body d-flex align-items-center gap-2">
                    <i class="bi ${iconClass} fs-5"></i>
                    <span>${message}</span>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    if (window.bootstrap && window.bootstrap.Toast) {
        const bsToast = new bootstrap.Toast(toastEl, { delay: 4500 });
        bsToast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    } else {
        setTimeout(() => toastEl.remove(), 4500);
    }
}

// -------------------------------------------------------------------
// Formatting & Badge Helpers
// -------------------------------------------------------------------
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

function getStatusBadgeHtml(status) {
    const icons = {
        SUBMITTED: 'bi-clock-history',
        IN_PROGRESS: 'bi-arrow-repeat',
        RESOLVED: 'bi-check-circle',
        REJECTED: 'bi-x-circle'
    };
    const icon = icons[status] || 'bi-circle';
    const cleanStatus = status ? status.replace('_', ' ') : 'UNKNOWN';
    return `<span class="badge-status badge-${status}"><i class="bi ${icon}"></i> ${cleanStatus}</span>`;
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
    const icon = icons[category] || 'bi-tag-fill text-secondary';
    return `<span class="badge badge-category"><i class="bi ${icon} me-1"></i>${category}</span>`;
}
