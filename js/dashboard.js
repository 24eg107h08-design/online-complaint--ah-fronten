/**
 * Online Complaint Management System - Citizen User Dashboard Logic
 */

let currentPage = 0;
const pageSize = 8;
let currentFilter = {
    status: '',
    category: '',
    search: ''
};

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireAuth()) return;

    const user = Auth.getUser();
    if (user && user.role === 'ROLE_ADMIN') {
        window.location.href = 'admin-dashboard.html';
        return;
    }

    const userNameEl = document.getElementById('user-display-name');
    if (userNameEl && user) {
        userNameEl.textContent = user.name;
    }

    loadDashboardStats();
    loadUserComplaints();
    loadNotifications();

    setupFilterListeners();
});

// -------------------------------------------------------------------
// Load Dashboard Metrics Cards
// -------------------------------------------------------------------
async function loadDashboardStats() {
    try {
        const response = await apiRequest('/complaints/dashboard/stats');
        if (response.success && response.data) {
            const s = response.data;
            document.getElementById('stat-total').textContent = s.totalComplaints;
            document.getElementById('stat-pending').textContent = s.pendingComplaints;
            document.getElementById('stat-inprogress').textContent = s.inProgressComplaints;
            document.getElementById('stat-resolved').textContent = s.resolvedComplaints;
        }
    } catch (error) {
        console.error('Failed to load user stats:', error);
    }
}

// -------------------------------------------------------------------
// Load Complaints Table with Pagination & Filters
// -------------------------------------------------------------------
async function loadUserComplaints(page = 0) {
    currentPage = page;
    const tableBody = document.getElementById('complaints-table-body');
    const loadingRow = document.getElementById('loading-row');
    const emptyRow = document.getElementById('empty-row');

    if (loadingRow) loadingRow.classList.remove('d-none');
    if (emptyRow) emptyRow.classList.add('d-none');

    try {
        let query = `/complaints/my?page=${page}&size=${pageSize}&sortBy=createdAt&sortDir=desc`;
        if (currentFilter.status) query += `&status=${encodeURIComponent(currentFilter.status)}`;
        if (currentFilter.category) query += `&category=${encodeURIComponent(currentFilter.category)}`;
        if (currentFilter.search) query += `&search=${encodeURIComponent(currentFilter.search)}`;

        const response = await apiRequest(query);

        if (response.success && response.data) {
            const pageData = response.data;
            const complaints = pageData.content || [];

            renderComplaintsTable(complaints);
            renderPagination(pageData);

            if (complaints.length === 0) {
                if (emptyRow) emptyRow.classList.remove('d-none');
            }
        }
    } catch (error) {
        showToast('Error loading complaints: ' + error.message, 'error');
    } finally {
        if (loadingRow) loadingRow.classList.add('d-none');
    }
}

function renderComplaintsTable(complaints) {
    const tableBody = document.getElementById('complaints-table-body');
    if (!tableBody) return;

    // Clear existing dynamic rows
    const rows = tableBody.querySelectorAll('tr:not(#loading-row):not(#empty-row)');
    rows.forEach(r => r.remove());

    complaints.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <span class="complaint-code-badge">${c.complaintCode}</span>
            </td>
            <td>
                <div class="fw-semibold text-truncate" style="max-width: 240px;" title="${c.title}">${c.title}</div>
                <small class="text-muted text-truncate d-block" style="max-width: 240px;"><i class="bi bi-geo-alt me-1"></i>${c.location}</small>
            </td>
            <td>${getCategoryBadgeHtml(c.category)}</td>
            <td>${getStatusBadgeHtml(c.status)}</td>
            <td>
                <span class="small text-muted">${formatDate(c.createdAt)}</span>
            </td>
            <td>
                <span class="small fw-medium">${c.assignedDepartment || '<span class="text-muted fst-italic">Pending</span>'}</span>
            </td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <a href="track.html?code=${encodeURIComponent(c.complaintCode)}" class="btn btn-outline-primary" title="Track Timeline">
                        <i class="bi bi-eye"></i> Track
                    </a>
                    ${c.status === 'SUBMITTED' ? `
                    <button class="btn btn-outline-secondary" onclick="openEditModal(${c.id})" title="Edit Details">
                        <i class="bi bi-pencil"></i>
                    </button>` : ''}
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderPagination(pageData) {
    const paginationContainer = document.getElementById('pagination-container');
    if (!paginationContainer) return;

    const totalPages = pageData.totalPages || 1;
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let html = '<ul class="pagination pagination-sm mb-0">';
    html += `
        <li class="page-item ${currentPage === 0 ? 'disabled' : ''}">
            <button class="page-link" onclick="loadUserComplaints(${currentPage - 1})">&laquo; Prev</button>
        </li>
    `;

    for (let i = 0; i < totalPages; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <button class="page-link" onclick="loadUserComplaints(${i})">${i + 1}</button>
            </li>
        `;
    }

    html += `
        <li class="page-item ${currentPage >= totalPages - 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="loadUserComplaints(${currentPage + 1})">Next &raquo;</button>
        </li>
    `;
    html += '</ul>';

    paginationContainer.innerHTML = html;
}

// -------------------------------------------------------------------
// Search & Filter Listeners
// -------------------------------------------------------------------
function setupFilterListeners() {
    const statusSelect = document.getElementById('filter-status');
    const categorySelect = document.getElementById('filter-category');
    const searchInput = document.getElementById('filter-search');
    const resetBtn = document.getElementById('btn-reset-filters');

    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            currentFilter.status = e.target.value;
            loadUserComplaints(0);
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            currentFilter.category = e.target.value;
            loadUserComplaints(0);
        });
    }

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentFilter.search = e.target.value.trim();
                loadUserComplaints(0);
            }, 350);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (statusSelect) statusSelect.value = '';
            if (categorySelect) categorySelect.value = '';
            if (searchInput) searchInput.value = '';
            currentFilter = { status: '', category: '', search: '' };
            loadUserComplaints(0);
        });
    }
}

// -------------------------------------------------------------------
// Notifications
// -------------------------------------------------------------------
async function loadNotifications() {
    try {
        const countRes = await apiRequest('/notifications/unread-count');
        const badge = document.getElementById('notification-badge');
        if (badge && countRes.success && countRes.data) {
            const count = countRes.data.unreadCount || 0;
            badge.textContent = count;
            badge.classList.toggle('d-none', count === 0);
        }

        const notifRes = await apiRequest('/notifications');
        const listContainer = document.getElementById('notifications-list');
        if (listContainer && notifRes.success && notifRes.data) {
            const notifs = notifRes.data;
            if (notifs.length === 0) {
                listContainer.innerHTML = '<div class="p-3 text-center text-muted small">No notifications yet</div>';
                return;
            }

            listContainer.innerHTML = notifs.slice(0, 10).map(n => `
                <div class="notification-item ${!n.isRead ? 'unread' : ''}" onclick="markNotificationRead(${n.id})">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="small fw-semibold ${!n.isRead ? 'text-primary' : 'text-secondary'}">
                            <i class="bi bi-bell me-1"></i>Status Alert
                        </span>
                        <small class="text-muted" style="font-size:0.75rem;">${formatDate(n.createdAt)}</small>
                    </div>
                    <p class="mb-0 text-dark small">${n.message}</p>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Failed to load notifications:', e);
    }
}

async function markNotificationRead(id) {
    try {
        await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
        loadNotifications();
    } catch (e) {
        console.error(e);
    }
}

async function markAllNotificationsRead() {
    try {
        await apiRequest('/notifications/read-all', { method: 'PATCH' });
        showToast('All notifications marked as read', 'success');
        loadNotifications();
    } catch (e) {
        showToast('Failed to mark notifications read', 'error');
    }
}

// -------------------------------------------------------------------
// Edit Modal (Allowed only when status is SUBMITTED)
// -------------------------------------------------------------------
let editingComplaintId = null;

async function openEditModal(id) {
    editingComplaintId = id;
    try {
        const res = await apiRequest(`/complaints/${id}`);
        if (res.success && res.data) {
            const c = res.data;
            document.getElementById('edit-title').value = c.title;
            document.getElementById('edit-category').value = c.category;
            document.getElementById('edit-location').value = c.location;
            document.getElementById('edit-description').value = c.description;

            const modal = new bootstrap.Modal(document.getElementById('editComplaintModal'));
            modal.show();
        }
    } catch (e) {
        showToast('Failed to load complaint for editing: ' + e.message, 'error');
    }
}

async function submitEditComplaint() {
    if (!editingComplaintId) return;

    const title = document.getElementById('edit-title').value.trim();
    const category = document.getElementById('edit-category').value;
    const location = document.getElementById('edit-location').value.trim();
    const description = document.getElementById('edit-description').value.trim();

    if (!title || !category || !location || !description) {
        showToast('Please fill in all required fields.', 'warning');
        return;
    }

    try {
        const res = await apiRequest(`/complaints/${editingComplaintId}`, {
            method: 'PUT',
            body: JSON.stringify({ title, category, location, description })
        });

        if (res.success) {
            showToast('Complaint updated successfully!', 'success');
            const modalEl = document.getElementById('editComplaintModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadUserComplaints(currentPage);
        }
    } catch (e) {
        showToast('Failed to update complaint: ' + e.message, 'error');
    }
}
