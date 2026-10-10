/**
 * Online Complaint Management System - Complaint Submission Handler
 */

let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireAuth()) return;

    const form = document.getElementById('complaintForm');
    if (form) {
        setupFileDropzone();
        setupGeolocationHelper();
        setupFormSubmission(form);
    }
});

// -------------------------------------------------------------------
// File Upload Dropzone & Validation
// -------------------------------------------------------------------
function setupFileDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('attachment');
    const previewContainer = document.getElementById('file-preview-container');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-primary', 'bg-light');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-primary', 'bg-light');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-primary', 'bg-light');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });
}

function handleFileSelection(file) {
    const previewContainer = document.getElementById('file-preview-container');
    const previewText = document.getElementById('file-preview-name');
    const previewSize = document.getElementById('file-preview-size');

    // Max 10MB check
    if (file.size > 10 * 1024 * 1024) {
        showToast('File size exceeds the 10MB limit. Please choose a smaller file.', 'warning');
        return;
    }

    selectedFile = file;
    if (previewText) previewText.textContent = file.name;
    if (previewSize) previewSize.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    if (previewContainer) previewContainer.classList.remove('d-none');
}

function removeSelectedFile() {
    selectedFile = null;
    const fileInput = document.getElementById('attachment');
    if (fileInput) fileInput.value = '';
    const previewContainer = document.getElementById('file-preview-container');
    if (previewContainer) previewContainer.classList.add('d-none');
}

// -------------------------------------------------------------------
// Geolocation Helper
// -------------------------------------------------------------------
function setupGeolocationHelper() {
    const geoBtn = document.getElementById('btn-get-location');
    const locationInput = document.getElementById('location');

    if (!geoBtn || !locationInput) return;

    geoBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast('Geolocation is not supported by your browser.', 'warning');
            return;
        }

        geoBtn.disabled = true;
        geoBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Locating...';

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                locationInput.value = `GPS: [${lat}, ${lng}] - Ward/Locality`;
                showToast('Coordinates retrieved! Please add street or landmark details.', 'info');
                geoBtn.disabled = false;
                geoBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Auto-Detect';
            },
            (err) => {
                showToast('Could not fetch location: ' + err.message, 'warning');
                geoBtn.disabled = false;
                geoBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Auto-Detect';
            }
        );
    });
}

// -------------------------------------------------------------------
// Form Submission
// -------------------------------------------------------------------
function setupFormSubmission(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        const title = document.getElementById('title').value.trim();
        const category = document.getElementById('category').value;
        const location = document.getElementById('location').value.trim();
        const description = document.getElementById('description').value.trim();

        if (!title || !category || !location || !description) {
            showToast('Please fill in all required fields.', 'warning');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Registering Complaint...';

            const formData = new FormData();
            formData.append('title', title);
            formData.append('category', category);
            formData.append('location', location);
            formData.append('description', description);

            if (selectedFile) {
                formData.append('file', selectedFile);
            }

            const response = await apiMultipartRequest('/complaints', formData);

            if (response.success && response.data) {
                const complaint = response.data;
                showSuccessModal(complaint);
                form.reset();
                removeSelectedFile();
            }
        } catch (error) {
            showToast(error.message || 'Failed to submit complaint. Please check your inputs.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-send-check me-2"></i>Submit Complaint';
        }
    });
}

function showSuccessModal(complaint) {
    const codeEl = document.getElementById('modal-complaint-code');
    const linkEl = document.getElementById('modal-track-link');

    if (codeEl) codeEl.textContent = complaint.complaintCode;
    if (linkEl) linkEl.href = `track.html?code=${encodeURIComponent(complaint.complaintCode)}`;

    const modal = new bootstrap.Modal(document.getElementById('complaintSuccessModal'));
    modal.show();
}

function copyComplaintCode() {
    const codeEl = document.getElementById('modal-complaint-code');
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.textContent);
    showToast('Complaint ID copied to clipboard!', 'success');
}

// -------------------------------------------------------------------
// Random Data Generator Helper (1-click form fill)
// -------------------------------------------------------------------
const RANDOM_COMPLAINTS_POOL = [
    {
        category: 'Electricity',
        title: 'Frequent high voltage fluctuations damaging household equipment',
        description: 'Severe voltage spikes occurring daily between 7 PM and 10 PM. Multiple households have reported inverter and refrigerator power surges. Urgent stabilizer or transformer check needed.',
        location: 'Block C, Sector 14, Near Community Park'
    },
    {
        category: 'Electricity',
        title: 'Non-functional streetlights causing total darkness on main bypass',
        description: 'Streetlights from pole #12 to #24 have been completely dark for over 4 nights. Major safety hazard for pedestrians and late-night commuters.',
        location: '5th Main Avenue, Outer Ring Road Junction'
    },
    {
        category: 'Water',
        title: 'Broken municipal pipeline flooding road with drinking water',
        description: 'Major underground drinking water supply pipe ruptured this morning. Clean potable water is gushing out and flooding the entire intersection. Water pressure in neighborhood has dropped to zero.',
        location: '7th Cross Road, Ward 15, Opposite City Hospital'
    },
    {
        category: 'Water',
        title: 'Muddy and foul-smelling tap water supplied for 3 days',
        description: 'Tap water received in domestic overhead tanks is brown and has a foul chemical smell. Over 60 families are unable to use it for cooking or drinking.',
        location: 'Green Valley Apartments, Block B, Sector 8'
    },
    {
        category: 'Roads',
        title: 'Dangerous deep potholes causing multiple two-wheeler skids',
        description: 'Large, sharp-edged potholes have developed following recent rains right near the bus stand. Two motorcyclists slipped yesterday. Urgent asphalt cold-patching required.',
        location: 'Central Bus Terminal Road, Metro Gate 2'
    },
    {
        category: 'Roads',
        title: 'Traffic signal failure creating chaotic vehicle gridlock',
        description: 'Automatic traffic signals are completely dead at this busy 4-way crossroad. Vehicles are stuck in gridlock during morning rush hour without traffic police present.',
        location: 'MG Road & Gandhi Chowk Four-Way Crossing'
    },
    {
        category: 'Sanitation',
        title: 'Overflowing public garbage dumpster uncollected for 6 days',
        description: 'Community garbage dumpster is overflowing onto the main street. Stray animals are scattering waste and foul odor is making it difficult for residents and school children.',
        location: 'Municipal Market Lane, Ward 9'
    },
    {
        category: 'Sanitation',
        title: 'Blocked stormwater sewer causing dirty wastewater backflow',
        description: 'Open roadside drainage channel is choked with plastic and silt, causing dirty sewage water to stagnate and overflow onto sidewalks.',
        location: 'Lake View Colony, 3rd Cross Street'
    },
    {
        category: 'Education',
        title: 'Damaged classroom ceiling and broken benches in municipal school',
        description: 'Portions of plaster from the ceiling have fallen down in Class 5. Benches are broken and several window panes are missing, exposing students to rain.',
        location: 'Government Primary School, Station Ward 3'
    },
    {
        category: 'Other',
        title: 'Illegal commercial tin shed encroaching pedestrian footpath',
        description: 'A shop owner has erected a large unauthorized tin extension completely covering the pedestrian walking path, forcing people to walk on the busy vehicular road.',
        location: 'Commercial Street, Shop #45 Frontage'
    }
];

function fillRandomComplaint() {
    const randomItem = RANDOM_COMPLAINTS_POOL[Math.floor(Math.random() * RANDOM_COMPLAINTS_POOL.length)];
    
    document.getElementById('category').value = randomItem.category;
    document.getElementById('title').value = randomItem.title;
    document.getElementById('description').value = randomItem.description;
    document.getElementById('location').value = randomItem.location;

    showToast(`Filled random complaint: [${randomItem.category}] ${randomItem.title.substring(0, 30)}...`, 'info');
}
