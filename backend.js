const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = process.env.CMS_DATA_DIR || path.join(ROOT, '.data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const CATEGORIES = ['Electricity', 'Water', 'Roads', 'Sanitation', 'Education', 'Other'];
const STATUSES = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt']);
const MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain'
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function passwordRecord(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (typeof stored !== 'string' || !stored.includes(':')) return false;
    const [salt, expectedHex] = stored.split(':');
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createInitialStore() {
    const now = new Date().toISOString();
    return {
        nextUserId: 3,
        nextComplaintId: 1,
        nextNotificationId: 1,
        users: [
            {
                id: 1,
                name: 'Portal Administrator',
                email: 'admin@cms.com',
                phone: '9000000000',
                passwordHash: passwordRecord('admin123'),
                role: 'ROLE_ADMIN',
                createdAt: now
            },
            {
                id: 2,
                name: 'Demo Citizen',
                email: 'user@cms.com',
                phone: '9876543210',
                passwordHash: passwordRecord('user123'),
                role: 'ROLE_USER',
                createdAt: now
            }
        ],
        complaints: [],
        notifications: []
    };
}

function loadStore() {
    if (!fs.existsSync(STORE_FILE)) {
        const initial = createInitialStore();
        saveStore(initial);
        return initial;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        if (!Array.isArray(parsed.users) || !Array.isArray(parsed.complaints) ||
            !Array.isArray(parsed.notifications)) {
            throw new Error('Database file is missing required collections.');
        }
        return parsed;
    } catch (error) {
        throw new Error(`Unable to load complaint database at ${STORE_FILE}: ${error.message}`);
    }
}

function saveStore(store) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporaryFile = `${STORE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryFile, STORE_FILE);
}

const store = loadStore();
const sessions = new Map();

function publicUser(user) {
    const { passwordHash, ...result } = user;
    return result;
}

function responseData(response, status, data) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify({ success: status < 400, data }));
}

function responseError(response, status, message, validationErrors) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify({ success: false, message, ...(validationErrors ? { validationErrors } : {}) }));
}

function readRequest(request, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let length = 0;
        request.on('data', chunk => {
            length += chunk.length;
            if (length > limit) {
                reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks)));
        request.on('error', reject);
    });
}

async function readJson(request) {
    const body = await readRequest(request, 1024 * 1024);
    if (!body.length) return {};
    try {
        const value = JSON.parse(body.toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
        return value;
    } catch {
        throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
    }
}

function parseMultipart(buffer, boundary) {
    const delimiter = Buffer.from(`--${boundary}`);
    const fields = {};
    let file = null;
    let cursor = buffer.indexOf(delimiter);
    while (cursor !== -1) {
        cursor += delimiter.length;
        if (buffer.subarray(cursor, cursor + 2).toString() === '--') break;
        if (buffer.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), cursor);
        if (headerEnd === -1) break;
        const headers = buffer.subarray(cursor, headerEnd).toString('utf8');
        const next = buffer.indexOf(delimiter, headerEnd + 4);
        if (next === -1) break;
        let contentEnd = next;
        if (buffer.subarray(contentEnd - 2, contentEnd).toString() === '\r\n') contentEnd -= 2;
        const content = buffer.subarray(headerEnd + 4, contentEnd);
        const disposition = headers.match(/content-disposition:\s*form-data;([^ \r\n]*(?:\s+[^ \r\n]*)*)/i);
        const nameMatch = headers.match(/(?:^|;)\s*name="([^"]*)"/i);
        const filenameMatch = headers.match(/(?:^|;)\s*filename="([^"]*)"/i);
        const fieldName = nameMatch && nameMatch[1];
        if (fieldName && filenameMatch && filenameMatch[1]) {
            if (fieldName === 'file') {
                file = { originalName: path.basename(filenameMatch[1]), content: Buffer.from(content) };
            }
        } else if (fieldName) {
            fields[fieldName] = content.toString('utf8');
        }
        cursor = next;
        if (!disposition) break;
    }
    return { fields, file };
}

function currentUser(request) {
    const authorization = request.headers.authorization || '';
    const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/);
    if (!match) return null;
    const userId = sessions.get(match[1]);
    return store.users.find(user => user.id === userId) || null;
}

function requireUser(request, response) {
    const user = currentUser(request);
    if (!user) {
        responseError(response, 401, 'Authentication required. Please log in again.');
        return null;
    }
    return user;
}

function requireAdmin(request, response) {
    const user = requireUser(request, response);
    if (user && user.role !== 'ROLE_ADMIN') {
        responseError(response, 403, 'Administrator access is required.');
        return null;
    }
    return user;
}

function validateComplaintFields(body) {
    const errors = {};
    if (typeof body.title !== 'string' || body.title.trim().length < 5 || body.title.trim().length > 200) {
        errors.title = 'Title must be between 5 and 200 characters.';
    }
    if (!CATEGORIES.includes(body.category)) errors.category = 'Choose a valid complaint category.';
    if (typeof body.location !== 'string' || body.location.trim().length < 3 || body.location.trim().length > 255) {
        errors.location = 'Location must be between 3 and 255 characters.';
    }
    if (typeof body.description !== 'string' || body.description.trim().length < 10 || body.description.trim().length > 5000) {
        errors.description = 'Description must be between 10 and 5000 characters.';
    }
    return errors;
}

function complaintWithUser(complaint) {
    const user = store.users.find(item => item.id === complaint.userId);
    return {
        ...complaint,
        userName: user ? user.name : 'Citizen',
        userPhone: user ? user.phone : '',
        userEmail: user ? user.email : ''
    };
}

function addNotification(userId, message) {
    store.notifications.push({
        id: store.nextNotificationId++,
        userId,
        message,
        isRead: false,
        createdAt: new Date().toISOString()
    });
}

function createComplaint(userId, body, fileMetadata = {}) {
    const now = new Date().toISOString();
    const sequence = store.nextComplaintId++;
    const code = `CMP-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`;
    const complaint = {
        id: sequence,
        complaintCode: code,
        userId,
        title: body.title.trim(),
        category: body.category,
        location: body.location.trim(),
        description: body.description.trim(),
        status: 'SUBMITTED',
        assignedDepartment: '',
        assignedStaff: '',
        resolutionRemarks: '',
        attachmentPath: fileMetadata.path || '',
        attachmentName: fileMetadata.name || '',
        createdAt: now,
        updatedAt: now,
        history: [{ oldStatus: null, newStatus: 'SUBMITTED', remarks: 'Complaint submitted.', updatedBy: 'System', createdAt: now }]
    };
    store.complaints.push(complaint);
    addNotification(userId, `Your complaint ${code} has been submitted.`);
    return complaint;
}

function paginatedComplaints(complaints, query) {
    const page = Math.max(0, Number.parseInt(query.get('page') || '0', 10) || 0);
    const size = Math.min(1000, Math.max(1, Number.parseInt(query.get('size') || '10', 10) || 10));
    const sortBy = query.get('sortBy') === 'createdAt' ? 'createdAt' : 'createdAt';
    const direction = query.get('sortDir') === 'asc' ? 1 : -1;
    const filtered = complaints.filter(complaint => {
        if (query.get('status') && complaint.status !== query.get('status')) return false;
        if (query.get('category') && complaint.category !== query.get('category')) return false;
        const search = (query.get('search') || '').toLocaleLowerCase();
        if (!search) return true;
        const user = store.users.find(item => item.id === complaint.userId);
        return [complaint.complaintCode, complaint.title, complaint.category, complaint.location,
            complaint.description, user && user.name, user && user.email]
            .some(value => String(value || '').toLocaleLowerCase().includes(search));
    }).sort((a, b) => direction * (new Date(a[sortBy]) - new Date(b[sortBy])));
    const totalPages = Math.ceil(filtered.length / size);
    return {
        content: filtered.slice(page * size, (page + 1) * size).map(complaintWithUser),
        page,
        size,
        totalElements: filtered.length,
        totalPages,
        first: page === 0,
        last: page >= Math.max(0, totalPages - 1)
    };
}

function complaintStats(complaints, totalUsers) {
    return {
        totalComplaints: complaints.length,
        pendingComplaints: complaints.filter(item => item.status === 'SUBMITTED').length,
        inProgressComplaints: complaints.filter(item => item.status === 'IN_PROGRESS').length,
        resolvedComplaints: complaints.filter(item => item.status === 'RESOLVED').length,
        rejectedComplaints: complaints.filter(item => item.status === 'REJECTED').length,
        ...(totalUsers === undefined ? {} : { totalUsers })
    };
}

function saveOrRespond(response) {
    try {
        saveStore(store);
        return true;
    } catch (error) {
        console.error('Failed to persist complaint data:', error);
        responseError(response, 500, 'The change could not be saved. Check server storage permissions.');
        return false;
    }
}

async function handleApiRequest(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method || 'GET';
    if (method === 'OPTIONS') {
        response.writeHead(204, { Allow: 'GET, POST, PUT, PATCH, OPTIONS' });
        response.end();
        return;
    }

    try {
        let body;
        let user;
        let match;

        if (method === 'POST' && pathname === '/api/auth/register') {
            body = await readJson(request);
            const errors = {};
            if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 100) errors.name = 'Name must be between 2 and 100 characters.';
            if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) errors.email = 'Enter a valid email address.';
            if (typeof body.phone !== 'string' || body.phone.trim().length < 7 || body.phone.trim().length > 20) errors.phone = 'Enter a valid phone number.';
            if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) errors.password = 'Password must be between 6 and 128 characters.';
            if (store.users.some(item => item.email.toLowerCase() === String(body.email || '').trim().toLowerCase())) errors.email = 'An account with this email already exists.';
            if (Object.keys(errors).length) return responseError(response, 400, 'Please correct the registration details.', errors);
            const account = {
                id: store.nextUserId++,
                name: body.name.trim(),
                email: body.email.trim().toLowerCase(),
                phone: body.phone.trim(),
                passwordHash: passwordRecord(body.password),
                role: 'ROLE_USER',
                createdAt: new Date().toISOString()
            };
            store.users.push(account);
            const token = crypto.randomBytes(32).toString('base64url');
            sessions.set(token, account.id);
            if (!saveOrRespond(response)) return;
            return responseData(response, 201, { ...publicUser(account), token });
        }

        if (method === 'POST' && pathname === '/api/auth/login') {
            body = await readJson(request);
            const account = store.users.find(item => item.email.toLowerCase() === String(body.email || '').trim().toLowerCase());
            if (!account || typeof body.password !== 'string' || !verifyPassword(body.password, account.passwordHash)) {
                return responseError(response, 401, 'Invalid email or password.');
            }
            const token = crypto.randomBytes(32).toString('base64url');
            sessions.set(token, account.id);
            return responseData(response, 200, { ...publicUser(account), token });
        }

        if (method === 'POST' && pathname === '/api/auth/logout') {
            const authorization = (request.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]+)$/);
            if (authorization) sessions.delete(authorization[1]);
            return responseData(response, 200, { message: 'Logged out.' });
        }

        if (method === 'GET' && (match = pathname.match(/^\/api\/complaints\/track\/([^/]+)$/))) {
            const code = decodeURIComponent(match[1]).toUpperCase();
            const complaint = store.complaints.find(item => item.complaintCode.toUpperCase() === code);
            if (!complaint) return responseError(response, 404, 'Complaint not found.');
            return responseData(response, 200, complaintWithUser(complaint));
        }

        if (method === 'GET' && (match = pathname.match(/^\/api\/complaints\/files\/([A-Za-z0-9_-]+)$/))) {
            const fileId = match[1];
            const complaint = store.complaints.find(item => item.attachmentPath === fileId);
            if (!complaint) return responseError(response, 404, 'Attachment not found.');
            const extension = path.extname(complaint.attachmentName).toLowerCase();
            const filePath = path.join(UPLOAD_DIR, `${fileId}${extension}`);
            if (!fs.existsSync(filePath)) return responseError(response, 404, 'Attachment file is missing.');
            response.writeHead(200, {
                'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${path.basename(complaint.attachmentName).replace(/["\r\n]/g, '_')}"`,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-store'
            });
            return fs.createReadStream(filePath).pipe(response);
        }

        if (method === 'POST' && pathname === '/api/complaints') {
            user = requireUser(request, response);
            if (!user) return;
            const contentType = request.headers['content-type'] || '';
            const boundaryMatch = contentType.match(/multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
            if (!boundaryMatch) return responseError(response, 400, 'Complaint submission must use multipart form data.');
            const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();
            const rawBody = await readRequest(request, MAX_UPLOAD_SIZE + 256 * 1024);
            const multipart = parseMultipart(rawBody, boundary);
            body = multipart.fields;
            const errors = validateComplaintFields(body);
            if (multipart.file) {
                const extension = path.extname(multipart.file.originalName).toLowerCase();
                if (!ALLOWED_EXTENSIONS.has(extension)) errors.file = 'This attachment file type is not supported.';
                if (multipart.file.content.length > MAX_UPLOAD_SIZE) errors.file = 'Attachments must be 10 MB or smaller.';
            }
            if (Object.keys(errors).length) return responseError(response, 400, 'Please correct the complaint details.', errors);
            let fileMetadata = {};
            if (multipart.file) {
                const extension = path.extname(multipart.file.originalName).toLowerCase();
                const id = crypto.randomBytes(18).toString('hex');
                fs.writeFileSync(path.join(UPLOAD_DIR, `${id}${extension}`), multipart.file.content, { flag: 'wx', mode: 0o600 });
                fileMetadata = { path: id, name: multipart.file.originalName };
            }
            const complaint = createComplaint(user.id, body, fileMetadata);
            if (!saveOrRespond(response)) {
                if (fileMetadata.path) fs.rmSync(path.join(UPLOAD_DIR, `${fileMetadata.path}${path.extname(fileMetadata.name)}`), { force: true });
                return;
            }
            return responseData(response, 201, complaintWithUser(complaint));
        }

        if (method === 'GET' && pathname === '/api/complaints/dashboard/stats') {
            user = requireUser(request, response);
            if (!user) return;
            const complaints = store.complaints.filter(item => item.userId === user.id);
            return responseData(response, 200, complaintStats(complaints));
        }

        if (method === 'GET' && pathname === '/api/complaints/my') {
            user = requireUser(request, response);
            if (!user) return;
            const complaints = store.complaints.filter(item => item.userId === user.id);
            return responseData(response, 200, paginatedComplaints(complaints, url.searchParams));
        }

        if (method === 'GET' && pathname === '/api/notifications/unread-count') {
            user = requireUser(request, response);
            if (!user) return;
            const unreadCount = store.notifications.filter(item => item.userId === user.id && !item.isRead).length;
            return responseData(response, 200, { unreadCount });
        }

        if (method === 'GET' && pathname === '/api/notifications') {
            user = requireUser(request, response);
            if (!user) return;
            const notifications = store.notifications.filter(item => item.userId === user.id)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return responseData(response, 200, notifications);
        }

        if (method === 'PATCH' && pathname === '/api/notifications/read-all') {
            user = requireUser(request, response);
            if (!user) return;
            store.notifications.filter(item => item.userId === user.id).forEach(item => { item.isRead = true; });
            if (!saveOrRespond(response)) return;
            return responseData(response, 200, { message: 'Notifications marked as read.' });
        }

        if (method === 'PATCH' && (match = pathname.match(/^\/api\/notifications\/(\d+)\/read$/))) {
            user = requireUser(request, response);
            if (!user) return;
            const notification = store.notifications.find(item => item.id === Number(match[1]) && item.userId === user.id);
            if (!notification) return responseError(response, 404, 'Notification not found.');
            notification.isRead = true;
            if (!saveOrRespond(response)) return;
            return responseData(response, 200, notification);
        }

        if (method === 'GET' && pathname === '/api/admin/dashboard') {
            user = requireAdmin(request, response);
            if (!user) return;
            return responseData(response, 200, complaintStats(store.complaints, store.users.length));
        }

        if (method === 'GET' && pathname === '/api/admin/complaints') {
            user = requireAdmin(request, response);
            if (!user) return;
            return responseData(response, 200, paginatedComplaints(store.complaints, url.searchParams));
        }

        if (method === 'GET' && pathname === '/api/admin/users') {
            user = requireAdmin(request, response);
            if (!user) return;
            const users = store.users.map(account => ({
                ...publicUser(account),
                complaintCount: store.complaints.filter(item => item.userId === account.id).length
            }));
            return responseData(response, 200, users);
        }

        if (method === 'POST' && pathname === '/api/admin/complaints/randomize') {
            user = requireAdmin(request, response);
            if (!user) return;
            const count = Math.max(1, Math.min(20, Number.parseInt(url.searchParams.get('count') || '5', 10) || 5));
            const citizens = store.users.filter(account => account.role === 'ROLE_USER');
            const demoCitizen = citizens[0];
            const samples = [
                ['Electricity', 'Streetlights are not working', 'Streetlights have been out for several days and the road is difficult to use after dark.', 'Main Road, Ward 4'],
                ['Water', 'Low water pressure in the neighborhood', 'Water pressure has remained unusually low since yesterday morning across several homes.', 'Lake View Street, Ward 8'],
                ['Roads', 'Pothole needs repair', 'A large pothole is creating a hazard for pedestrians and vehicles, especially at night.', 'Market Road, Ward 2'],
                ['Sanitation', 'Garbage collection is overdue', 'Household waste has not been collected for multiple days and needs municipal attention.', 'Green Park, Ward 7'],
                ['Education', 'School facility requires maintenance', 'The public school facility needs inspection and repair to keep it safe for students.', 'Government School, Ward 3'],
                ['Other', 'Damaged public sign needs replacement', 'A damaged civic information sign is difficult to read and should be replaced.', 'Bus Stand Junction, Ward 5']
            ];
            const generated = [];
            for (let index = 0; index < count; index++) {
                const sample = samples[Math.floor(Math.random() * samples.length)];
                generated.push(createComplaint(demoCitizen.id, {
                    category: sample[0],
                    title: `${sample[1]} #${store.nextComplaintId}`,
                    description: sample[2],
                    location: sample[3]
                }));
            }
            if (!saveOrRespond(response)) return;
            return responseData(response, 201, generated.map(complaintWithUser));
        }

        if (method === 'GET' && (match = pathname.match(/^\/api\/admin\/complaints\/(\d+)$/))) {
            user = requireAdmin(request, response);
            if (!user) return;
            const complaint = store.complaints.find(item => item.id === Number(match[1]));
            if (!complaint) return responseError(response, 404, 'Complaint not found.');
            return responseData(response, 200, complaintWithUser(complaint));
        }

        if (method === 'PATCH' && (match = pathname.match(/^\/api\/admin\/complaints\/(\d+)\/status$/))) {
            user = requireAdmin(request, response);
            if (!user) return;
            body = await readJson(request);
            const complaint = store.complaints.find(item => item.id === Number(match[1]));
            if (!complaint) return responseError(response, 404, 'Complaint not found.');
            if (!STATUSES.includes(body.status)) return responseError(response, 400, 'Choose a valid complaint status.', { status: 'Invalid status.' });
            const now = new Date().toISOString();
            const oldStatus = complaint.status;
            complaint.status = body.status;
            complaint.assignedDepartment = typeof body.assignedDepartment === 'string' ? body.assignedDepartment.trim().slice(0, 120) : '';
            complaint.assignedStaff = typeof body.assignedStaff === 'string' ? body.assignedStaff.trim().slice(0, 120) : '';
            complaint.resolutionRemarks = typeof body.remarks === 'string' ? body.remarks.trim().slice(0, 2000) : '';
            complaint.updatedAt = now;
            complaint.history.push({
                oldStatus,
                newStatus: complaint.status,
                remarks: complaint.resolutionRemarks || `Status changed to ${complaint.status.replace('_', ' ')}.`,
                updatedBy: user.name,
                createdAt: now
            });
            addNotification(complaint.userId, `Complaint ${complaint.complaintCode} status changed to ${complaint.status.replace('_', ' ')}.`);
            if (!saveOrRespond(response)) return;
            return responseData(response, 200, complaintWithUser(complaint));
        }

        if (method === 'GET' && (match = pathname.match(/^\/api\/complaints\/(\d+)$/))) {
            user = requireUser(request, response);
            if (!user) return;
            const complaint = store.complaints.find(item => item.id === Number(match[1]) && item.userId === user.id);
            if (!complaint) return responseError(response, 404, 'Complaint not found.');
            return responseData(response, 200, complaintWithUser(complaint));
        }

        if (method === 'PUT' && (match = pathname.match(/^\/api\/complaints\/(\d+)$/))) {
            user = requireUser(request, response);
            if (!user) return;
            body = await readJson(request);
            const errors = validateComplaintFields(body);
            if (Object.keys(errors).length) return responseError(response, 400, 'Please correct the complaint details.', errors);
            const complaint = store.complaints.find(item => item.id === Number(match[1]) && item.userId === user.id);
            if (!complaint) return responseError(response, 404, 'Complaint not found.');
            if (complaint.status !== 'SUBMITTED') return responseError(response, 409, 'Only submitted complaints can be edited.');
            complaint.title = body.title.trim();
            complaint.category = body.category;
            complaint.location = body.location.trim();
            complaint.description = body.description.trim();
            complaint.updatedAt = new Date().toISOString();
            if (!saveOrRespond(response)) return;
            return responseData(response, 200, complaintWithUser(complaint));
        }

        return responseError(response, 404, 'API endpoint not found.');
    } catch (error) {
        if (response.headersSent || response.destroyed) return;
        if (error.status === 413) return responseError(response, 413, error.message);
        if (error instanceof SyntaxError) return responseError(response, 400, 'Request body must be valid JSON.');
        console.error(`API request failed for ${method} ${pathname}:`, error);
        return responseError(response, 500, 'An unexpected server error occurred.');
    }
}

module.exports = { handleApiRequest };
