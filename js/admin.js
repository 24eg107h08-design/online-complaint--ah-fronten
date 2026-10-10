/**
 * Online Complaint Management System - Administrator Dashboard Logic
 */

let adminCurrentPage = 0;
const adminPageSize = 10;
let adminFilter = {
    status: '',
    category: '',
    search: ''
};
let selectedComplaintId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Role check: must be admin
    if (!Auth.requireAuth('ROLE_ADMIN')) return;

    loadAdminStats();
    loadAdminComplaints();
    setupAdminFilterListeners();
});

// -------------------------------------------------------------------
// System Overview Metrics
// -------------------------------------------------------------------
async function loadAdminStats() {
    try {
        const response = await apiRequest('/admin/dashboard');
        if (response.success && response.data) {
            const s = response.data;
            document.getElementById('admin-stat-total').textContent = s.totalComplaints;
            document.getElementById('admin-stat-pending').textContent = s.pendingComplaints;
            document.getElementById('admin-stat-inprogress').textContent = s.inProgressComplaints;
            document.getElementById('admin-stat-resolved').textContent = s.resolvedComplaints;
            document.getElementById('admin-stat-rejected').textContent = s.rejectedComplaints;
            document.getElementById('admin-stat-users').textContent = s.totalUsers;
        }
    } catch (e) {
        console.error('Failed to load admin stats:', e);
    }
}

// -------------------------------------------------------------------
// Complaints Management Table
// -------------------------------------------------------------------
async function loadAdminComplaints(page = 0) {
    adminCurrentPage = page;
    const tableBody = document.getElementById('admin-complaints-table-body');
    const loadingRow = document.getElementById('admin-loading-row');
    const emptyRow = document.getElementById('admin-empty-row');

    if (loadingRow) loadingRow.classList.remove('d-none');
    if (emptyRow) emptyRow.classList.add('d-none');

    try {
        let query = `/admin/complaints?page=${page}&size=${adminPageSize}&sortBy=createdAt&sortDir=desc`;
        if (adminFilter.status) query += `&status=${encodeURIComponent(adminFilter.status)}`;
        if (adminFilter.category) query += `&category=${encodeURIComponent(adminFilter.category)}`;
        if (adminFilter.search) query += `&search=${encodeURIComponent(adminFilter.search)}`;

        const response = await apiRequest(query);

        if (response.success && response.data) {
            const pageData = response.data;
            const complaints = pageData.content || [];

            renderAdminComplaintsTable(complaints);
            renderAdminPagination(pageData);

            if (complaints.length === 0 && emptyRow) {
                emptyRow.classList.remove('d-none');
            }
        }
    } catch (error) {
        showToast('Error loading complaints: ' + error.message, 'error');
    } finally {
        if (loadingRow) loadingRow.classList.add('d-none');
    }
}

function renderAdminComplaintsTable(complaints) {
    const tableBody = document.getElementById('admin-complaints-table-body');
    if (!tableBody) return;

    const rows = tableBody.querySelectorAll('tr:not(#admin-loading-row):not(#admin-empty-row)');
    rows.forEach(r => r.remove());

    complaints.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="complaint-code-badge">${c.complaintCode}</span></td>
            <td>
                <div class="fw-semibold text-truncate" style="max-width: 220px;" title="${c.title}">${c.title}</div>
                <small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${c.location}</small>
            </td>
            <td>${getCategoryBadgeHtml(c.category)}</td>
            <td>
                <div class="fw-medium">${c.userName || 'Citizen'}</div>
                <small class="text-muted">${c.userPhone || c.userEmail || ''}</small>
            </td>
            <td>${getStatusBadgeHtml(c.status)}</td>
            <td>
                <div class="small fw-semibold">${c.assignedDepartment || '<span class="text-muted fst-italic">Unassigned</span>'}</div>
                ${c.assignedStaff ? `<small class="text-muted">${c.assignedStaff}</small>` : ''}
            </td>
            <td><small class="text-muted">${formatDate(c.createdAt)}</small></td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-primary" onclick="openStatusModal(${c.id})" title="Update Status & Department">
                        <i class="bi bi-gear-fill me-1"></i> Manage
                    </button>
                    <a href="track.html?code=${encodeURIComponent(c.complaintCode)}" target="_blank" class="btn btn-outline-secondary" title="View Full Timeline">
                        <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderAdminPagination(pageData) {
    const container = document.getElementById('admin-pagination-container');
    if (!container) return;

    const totalPages = pageData.totalPages || 1;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<ul class="pagination pagination-sm mb-0">';
    html += `
        <li class="page-item ${adminCurrentPage === 0 ? 'disabled' : ''}">
            <button class="page-link" onclick="loadAdminComplaints(${adminCurrentPage - 1})">&laquo; Prev</button>
        </li>
    `;

    for (let i = 0; i < totalPages; i++) {
        html += `
            <li class="page-item ${i === adminCurrentPage ? 'active' : ''}">
                <button class="page-link" onclick="loadAdminComplaints(${i})">${i + 1}</button>
            </li>
        `;
    }

    html += `
        <li class="page-item ${adminCurrentPage >= totalPages - 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="loadAdminComplaints(${adminCurrentPage + 1})">Next &raquo;</button>
        </li>
    `;
    html += '</ul>';

    container.innerHTML = html;
}

// -------------------------------------------------------------------
// Status & Assignment Modal
// -------------------------------------------------------------------
async function openStatusModal(id) {
    selectedComplaintId = id;
    try {
        const res = await apiRequest(`/admin/complaints/${id}`);
        if (res.success && res.data) {
            const c = res.data;
            document.getElementById('modal-status-code').textContent = c.complaintCode;
            document.getElementById('modal-status-title').textContent = c.title;
            document.getElementById('modal-status-citizen').textContent = `${c.userName || 'Citizen'} (${c.userPhone || c.userEmail || ''})`;
            document.getElementById('modal-status-description').textContent = c.description;

            document.getElementById('update-status-select').value = c.status;
            document.getElementById('update-department-input').value = c.assignedDepartment || '';
            document.getElementById('update-staff-input').value = c.assignedStaff || '';
            document.getElementById('update-remarks-input').value = c.resolutionRemarks || '';

            const attachmentBox = document.getElementById('modal-status-attachment');
            if (attachmentBox) {
                if (c.attachmentPath) {
                    attachmentBox.innerHTML = `
                        <a href="${API_CONFIG.BASE_URL}/complaints/files/${encodeURIComponent(c.attachmentPath)}" target="_blank" class="btn btn-outline-info btn-sm">
                            <i class="bi bi-paperclip me-1"></i>View Attachment: ${c.attachmentName || 'Document'}
                        </a>
                    `;
                    attachmentBox.classList.remove('d-none');
                } else {
                    attachmentBox.classList.add('d-none');
                }
            }

            const modal = new bootstrap.Modal(document.getElementById('updateStatusModal'));
            modal.show();
        }
    } catch (e) {
        showToast('Failed to load complaint: ' + e.message, 'error');
    }
}

async function submitStatusUpdate() {
    if (!selectedComplaintId) return;

    const status = document.getElementById('update-status-select').value;
    const assignedDepartment = document.getElementById('update-department-input').value.trim();
    const assignedStaff = document.getElementById('update-staff-input').value.trim();
    const remarks = document.getElementById('update-remarks-input').value.trim();

    const saveBtn = document.getElementById('btn-save-status');

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
        }

        const res = await apiRequest(`/admin/complaints/${selectedComplaintId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                status,
                assignedDepartment,
                assignedStaff,
                remarks
            })
        });

        if (res.success) {
            showToast('Complaint status & department updated successfully!', 'success');
            const modalEl = document.getElementById('updateStatusModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            loadAdminStats();
            loadAdminComplaints(adminCurrentPage);
        }
    } catch (error) {
        showToast(error.message || 'Failed to update status', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Save Changes';
        }
    }
}

// -------------------------------------------------------------------
// Filter Listeners
// -------------------------------------------------------------------
function setupAdminFilterListeners() {
    const statusSelect = document.getElementById('admin-filter-status');
    const categorySelect = document.getElementById('admin-filter-category');
    const searchInput = document.getElementById('admin-filter-search');
    const resetBtn = document.getElementById('admin-btn-reset-filters');

    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            adminFilter.status = e.target.value;
            loadAdminComplaints(0);
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            adminFilter.category = e.target.value;
            loadAdminComplaints(0);
        });
    }

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                adminFilter.search = e.target.value.trim();
                loadAdminComplaints(0);
            }, 350);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (statusSelect) statusSelect.value = '';
            if (categorySelect) categorySelect.value = '';
            if (searchInput) searchInput.value = '';
            adminFilter = { status: '', category: '', search: '' };
            loadAdminComplaints(0);
        });
    }
}

// -------------------------------------------------------------------
// User Management Tab
// -------------------------------------------------------------------
async function loadAdminUsers() {
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) return;

    try {
        const res = await apiRequest('/admin/users');
        if (res.success && res.data) {
            const users = res.data;
            tableBody.innerHTML = users.map(u => `
                <tr>
                    <td>#${u.id}</td>
                    <td class="fw-semibold">${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.phone}</td>
                    <td>
                        <span class="badge ${u.role === 'ROLE_ADMIN' ? 'bg-danger' : 'bg-primary'}">${u.role.replace('ROLE_', '')}</span>
                    </td>
                    <td>${formatDate(u.createdAt)}</td>
                    <td><span class="badge bg-secondary">${u.complaintCount} Complaints</span></td>
                </tr>
            `).join('');
        }
    } catch (e) {
        showToast('Failed to load user list: ' + e.message, 'error');
    }
}

// -------------------------------------------------------------------
// CSV Export Utility
// -------------------------------------------------------------------
async function exportComplaintsToCSV() {
    try {
        const response = await apiRequest('/admin/complaints?page=0&size=1000&sortBy=createdAt&sortDir=desc');
        if (!response.success || !response.data) return;

        const complaints = response.data.content || [];
        if (complaints.length === 0) {
            showToast('No complaints to export', 'warning');
            return;
        }

        const headers = ['Complaint ID', 'Title', 'Category', 'Citizen Name', 'Phone', 'Status', 'Department', 'Staff', 'Location', 'Date'];
        const csvRows = [headers.join(',')];

        complaints.forEach(c => {
            const row = [
                `"${c.complaintCode}"`,
                `"${(c.title || '').replace(/"/g, '""')}"`,
                `"${c.category}"`,
                `"${(c.userName || '').replace(/"/g, '""')}"`,
                `"${c.userPhone || ''}"`,
                `"${c.status}"`,
                `"${(c.assignedDepartment || '').replace(/"/g, '""')}"`,
                `"${(c.assignedStaff || '').replace(/"/g, '""')}"`,
                `"${(c.location || '').replace(/"/g, '""')}"`,
                `"${c.createdAt || ''}"`
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', `complaints_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();

        showToast('Complaints exported to CSV successfully!', 'success');
    } catch (e) {
        showToast('Export failed: ' + e.message, 'error');
    }
}

// -------------------------------------------------------------------
// Generate Randomized Complaints
// -------------------------------------------------------------------
async function generateRandomComplaintsAdmin(count = 5) {
    const btn = document.getElementById('btn-generate-random');
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
        }

        const res = await apiRequest(`/admin/complaints/randomize?count=${count}`, {
            method: 'POST'
        });

        if (res.success && res.data) {
            showToast(`Generated ${res.data.length} randomized complaints successfully!`, 'success');
            loadAdminStats();
            loadAdminComplaints(0);
        }
    } catch (error) {
        showToast(error.message || 'Failed to generate random complaints', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-dice-5-fill me-1"></i>Generate 5 Random Complaints';
        }
    }
}
