/**
 * Online Complaint Management System - Public & Authenticated Complaint Tracker
 */

document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('trackForm');
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');

    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const codeInput = document.getElementById('search-complaint-code');
            const code = codeInput ? codeInput.value.trim() : '';
            if (code) {
                trackComplaint(code);
            }
        });
    }

    if (codeFromUrl) {
        const codeInput = document.getElementById('search-complaint-code');
        if (codeInput) codeInput.value = codeFromUrl;
        trackComplaint(codeFromUrl);
    }
});

async function trackComplaint(code) {
    const resultsContainer = document.getElementById('tracking-result');
    const notFoundContainer = document.getElementById('not-found-result');
    const searchBtn = document.getElementById('btn-track-submit');

    if (!code) return;

    if (resultsContainer) resultsContainer.classList.add('d-none');
    if (notFoundContainer) notFoundContainer.classList.add('d-none');

    try {
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Searching...';
        }

        const response = await apiRequest(`/complaints/track/${encodeURIComponent(code)}`);

        if (response.success && response.data) {
            renderComplaintDetails(response.data);
            if (resultsContainer) resultsContainer.classList.remove('d-none');
        } else {
            showNotFound(code);
        }
    } catch (error) {
        showNotFound(code);
    } finally {
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.innerHTML = '<i class="bi bi-search me-1"></i> Track';
        }
    }
}

function showNotFound(code) {
    const notFoundContainer = document.getElementById('not-found-result');
    const searchedCodeEl = document.getElementById('searched-code-placeholder');
    if (searchedCodeEl) searchedCodeEl.textContent = code;
    if (notFoundContainer) notFoundContainer.classList.remove('d-none');
}

function renderComplaintDetails(c) {
    // Header & Badges
    document.getElementById('display-complaint-code').textContent = c.complaintCode;
    document.getElementById('display-title').textContent = c.title;
    document.getElementById('display-category').innerHTML = getCategoryBadgeHtml(c.category);
    document.getElementById('display-status-badge').innerHTML = getStatusBadgeHtml(c.status);

    // Metadata
    document.getElementById('display-location').textContent = c.location;
    document.getElementById('display-created-at').textContent = formatDate(c.createdAt);
    document.getElementById('display-updated-at').textContent = formatDate(c.updatedAt);
    document.getElementById('display-department').textContent = c.assignedDepartment || 'Not yet assigned';
    document.getElementById('display-staff').textContent = c.assignedStaff || 'Pending assignment';
    document.getElementById('display-description').textContent = c.description;

    // Citizen Info (if available)
    const citizenInfoRow = document.getElementById('citizen-info-row');
    if (citizenInfoRow && c.userName) {
        document.getElementById('display-citizen-name').textContent = c.userName;
        document.getElementById('display-citizen-phone').textContent = c.userPhone || 'N/A';
        citizenInfoRow.classList.remove('d-none');
    }

    // Resolution Remarks
    const remarksContainer = document.getElementById('resolution-remarks-container');
    const remarksText = document.getElementById('display-resolution-remarks');
    if (remarksContainer && remarksText) {
        if (c.resolutionRemarks) {
            remarksText.textContent = c.resolutionRemarks;
            remarksContainer.classList.remove('d-none');
        } else {
            remarksContainer.classList.add('d-none');
        }
    }

    // Attachment
    const attachmentContainer = document.getElementById('attachment-container');
    const attachmentLink = document.getElementById('attachment-download-link');
    if (attachmentContainer && attachmentLink) {
        if (c.attachmentPath) {
            attachmentLink.href = `${API_CONFIG.BASE_URL}/complaints/files/${encodeURIComponent(c.attachmentPath)}`;
            attachmentLink.textContent = c.attachmentName || 'View Uploaded Attachment';
            attachmentContainer.classList.remove('d-none');
        } else {
            attachmentContainer.classList.add('d-none');
        }
    }

    // Stepper Progress
    renderStepper(c.status);

    // Audit History Timeline
    renderHistoryTimeline(c.history || []);
}

function renderStepper(status) {
    const node1 = document.getElementById('step-node-submitted');
    const node2 = document.getElementById('step-node-progress');
    const node3 = document.getElementById('step-node-final');
    const finalTitle = document.getElementById('step-title-final');
    const progressLine = document.getElementById('step-progress-line');

    // Reset classes
    [node1, node2, node3].forEach(n => {
        if (n) n.className = 'step-node';
    });

    if (status === 'SUBMITTED') {
        if (node1) node1.classList.add('active');
        if (progressLine) progressLine.style.width = '20%';
        if (finalTitle) finalTitle.textContent = 'Resolved';
    } else if (status === 'IN_PROGRESS') {
        if (node1) node1.classList.add('completed');
        if (node2) node2.classList.add('active');
        if (progressLine) progressLine.style.width = '60%';
        if (finalTitle) finalTitle.textContent = 'Resolved';
    } else if (status === 'RESOLVED') {
        if (node1) node1.classList.add('completed');
        if (node2) node2.classList.add('completed');
        if (node3) node3.classList.add('completed');
        if (progressLine) {
            progressLine.style.width = '100%';
            progressLine.style.backgroundColor = 'var(--success-color)';
        }
        if (finalTitle) finalTitle.textContent = 'Resolved';
    } else if (status === 'REJECTED') {
        if (node1) node1.classList.add('completed');
        if (node2) node2.classList.add('completed');
        if (node3) node3.classList.add('rejected');
        if (progressLine) {
            progressLine.style.width = '100%';
            progressLine.style.backgroundColor = 'var(--danger-color)';
        }
        if (finalTitle) finalTitle.textContent = 'Rejected';
    }
}

function renderHistoryTimeline(historyList) {
    const timelineContainer = document.getElementById('history-timeline');
    if (!timelineContainer) return;

    if (historyList.length === 0) {
        timelineContainer.innerHTML = '<div class="text-muted small">No status history available yet.</div>';
        return;
    }

    timelineContainer.innerHTML = historyList.map(item => {
        let markerClass = 'active';
        if (item.newStatus === 'RESOLVED') markerClass = 'completed';
        if (item.newStatus === 'REJECTED') markerClass = 'rejected';

        return `
            <div class="timeline-item">
                <div class="timeline-marker ${markerClass}"></div>
                <div class="timeline-content shadow-sm">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <div class="fw-bold">${getStatusBadgeHtml(item.newStatus)}</div>
                        <small class="text-muted">${formatDate(item.createdAt)}</small>
                    </div>
                    <p class="mb-1 text-dark small">${item.remarks || 'Status updated.'}</p>
                    <div class="text-muted" style="font-size:0.75rem;">
                        <i class="bi bi-person me-1"></i>Updated by: <span class="fw-medium">${item.updatedBy || 'System'}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
