const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const { Server } = require('socket.io');

const app = express();
const DB_FILE = './spatial-db.json';

// Auto-generate SSL key & cert if missing
let keyPath = path.join(__dirname, 'key.pem');
let certPath = path.join(__dirname, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('[NOEMATA SSL] Generating local HTTPS certificates...');
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 365 });
    fs.writeFileSync(keyPath, pems.private || pems.key);
    fs.writeFileSync(certPath, pems.cert || pems.certificate);
}

const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const server = https.createServer(httpsOptions, app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// Load spatial database
let spatialMap = {};
if (fs.existsSync(DB_FILE)) {
    try {
        spatialMap = JSON.parse(fs.readFileSync(DB_FILE));
        console.log('[NOEMATA DB] Loaded spatial anchors from disk.');
    } catch (err) {
        console.error('[NOEMATA DB] Error reading spatial database file:', err);
    }
}

// System Telemetry State
let systemState = {
    smart_climate_node: { temperature: 72.0, humidity: 45.0, status: "OPTIMAL" },
    perimeter_monitor: { perimeter: "SECURE", breachCount: 0 },
    smart_power_relay: { status: "OFF", powerDraw: 0.0 }
};

// Route Aliases
app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'public/setup.html')));
app.get('/operator', (req, res) => res.sendFile(path.join(__dirname, 'public/operator.html')));
app.get('/slides', (req, res) => res.sendFile(path.join(__dirname, 'public/sales-slides.html')));

// Spatial Endpoints
app.get('/api/spatial/map', (req, res) => res.json(spatialMap));

app.post('/api/spatial/register', (req, res) => {
    const { deviceId, position, anchorUUID } = req.body;

    spatialMap[deviceId] = {
        x: position ? parseFloat(position.x) : 0,
        y: position ? parseFloat(position.y) : 0,
        z: position ? parseFloat(position.z) : 0,
        anchorUUID: anchorUUID || null,
        updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(spatialMap, null, 2));
    io.emit('spatialAnchorsUpdated', spatialMap);
    
    console.log(`[NOEMATA ANCHOR REGISTERED] ${deviceId}`);
    res.json({ status: 'OK', data: spatialMap[deviceId] });
});

// Arduino Telemetry Endpoint
app.post('/api/telemetry/climate', (req, res) => {
    const { deviceId, temperature, humidity } = req.body;

    const tempVal = parseFloat(temperature);
    const humVal = parseFloat(humidity);
    const isOverheating = tempVal > 85.0;

    systemState.smart_climate_node = {
        temperature: tempVal,
        humidity: humVal,
        status: isOverheating ? "OVERHEATING_WARNING" : "OPTIMAL",
        updatedAt: new Date().toISOString()
    };

    io.emit('climateStateUpdate', systemState.smart_climate_node);
    io.emit('twinStateUpdate', systemState);

    console.log(`[ARDUINO TELEMETRY] Temp: ${tempVal}°F | Hum: ${humVal}% | Status: ${systemState.smart_climate_node.status}`);
    res.json({ status: 'ACCEPTED' });
});

// Socket.io
io.on('connection', (socket) => {
    console.log('[WEBSOCKET CONNECTED]', socket.id);
    socket.emit('spatialAnchorsUpdated', spatialMap);
    socket.emit('twinStateUpdate', systemState);
    socket.emit('climateStateUpdate', systemState.smart_climate_node);
});

// Launch HTTPS Server
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(`NOEMATA SECURE HTTPS ACTIVE ON PORT ${PORT}`);
    console.log(`URL: https://<YOUR-LAPTOP-IP>:${PORT}/setup`);
    console.log(`==================================================`);
});