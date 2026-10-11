const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'complaint-backend-test-'));
process.env.CMS_DATA_DIR = dataDirectory;
process.env.PORT = '0';

const server = require('../server');
let baseUrl;

before(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
});

async function request(endpoint, { method = 'GET', token, body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers
        },
        body
    });
    return { response, payload: await response.json() };
}

test('authenticates users and completes the citizen-to-admin complaint lifecycle', async () => {
    const homePage = await fetch(baseUrl.replace('/api', '/'));
    assert.equal(homePage.status, 200);
    assert.match(await homePage.text(), /Grievance/);
    const privateBackendSource = await fetch(baseUrl.replace('/api', '/backend.js'));
    assert.equal(privateBackendSource.status, 403);

    const anonymous = await request('/complaints/my');
    assert.equal(anonymous.response.status, 401);

    const citizenLogin = await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@cms.com', password: 'user123' })
    });
    assert.equal(citizenLogin.response.status, 200);
    const citizenToken = citizenLogin.payload.data.token;
    assert.equal(citizenLogin.payload.data.role, 'ROLE_USER');
    const invalidLogin = await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@cms.com', password: 'incorrect' })
    });
    assert.equal(invalidLogin.response.status, 401);
    assert.match(invalidLogin.payload.message, /Invalid email or password/);

    const forbiddenAdminData = await request('/admin/dashboard', { token: citizenToken });
    assert.equal(forbiddenAdminData.response.status, 403);

    const registration = await request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'New Citizen',
            email: 'new.citizen@example.com',
            phone: '9876543210',
            password: 'secure123'
        })
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.payload.data.role, 'ROLE_USER');
    assert.ok(registration.payload.data.token);
    const duplicateRegistration = await request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Duplicate Citizen',
            email: 'new.citizen@example.com',
            phone: '9876543210',
            password: 'secure123'
        })
    });
    assert.equal(duplicateRegistration.response.status, 400);

    const form = new FormData();
    form.set('title', 'Broken streetlight');
    form.set('category', 'Electricity');
    form.set('location', 'Ward 4 Main Road');
    form.set('description', 'Streetlight has been out for three nights.');
    form.set('file', new Blob(['test attachment'], { type: 'text/plain' }), 'evidence.txt');
    const submitted = await request('/complaints', {
        method: 'POST',
        token: citizenToken,
        body: form
    });
    assert.equal(submitted.response.status, 201);
    assert.equal(submitted.payload.data.status, 'SUBMITTED');
    assert.equal(submitted.payload.data.attachmentName, 'evidence.txt');
    const complaintId = submitted.payload.data.id;
    const complaintCode = submitted.payload.data.complaintCode;

    const ownList = await request('/complaints/my?page=0&size=10', { token: citizenToken });
    assert.equal(ownList.response.status, 200);
    assert.equal(ownList.payload.data.totalElements, 1);
    assert.equal(ownList.payload.data.content[0].id, complaintId);

    const stats = await request('/complaints/dashboard/stats', { token: citizenToken });
    assert.equal(stats.payload.data.totalComplaints, 1);
    assert.equal(stats.payload.data.pendingComplaints, 1);

    const adminLogin = await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@cms.com', password: 'admin123' })
    });
    const adminToken = adminLogin.payload.data.token;
    const statusUpdate = await request(`/admin/complaints/${complaintId}/status`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status: 'IN_PROGRESS',
            assignedDepartment: 'Electrical',
            assignedStaff: 'Field Team',
            remarks: 'Inspection scheduled.'
        })
    });
    assert.equal(statusUpdate.response.status, 200);
    assert.equal(statusUpdate.payload.data.history.length, 2);

    const publicTracking = await request(`/complaints/track/${encodeURIComponent(complaintCode)}`);
    assert.equal(publicTracking.response.status, 200);
    assert.equal(publicTracking.payload.data.status, 'IN_PROGRESS');
    assert.equal(publicTracking.payload.data.history[1].remarks, 'Inspection scheduled.');

    const attachment = await fetch(`${baseUrl}/complaints/files/${submitted.payload.data.attachmentPath}`);
    assert.equal(attachment.status, 200);
    assert.equal(await attachment.text(), 'test attachment');

    const notifications = await request('/notifications', { token: citizenToken });
    assert.equal(notifications.response.status, 200);
    assert.equal(notifications.payload.data.length, 2);

    const adminStats = await request('/admin/dashboard', { token: adminToken });
    assert.equal(adminStats.payload.data.totalComplaints, 1);
    assert.equal(adminStats.payload.data.totalUsers, 3);
});
