const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const DB_PATH = path.join(__dirname, 'spatial-db.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Hardware State Tracker
let currentHardwareState = {
    relayStatus: "OFF",
    powerDraw: "0.0"
};

// Database Helpers
function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        const defaultDB = {
            spaceId: "noemata-main",
            originDatum: "doorframe_main",
            anchors: {
                smart_climate_node: { x: "-0.868", y: "0.000", z: "-0.301" },
                perimeter_monitor: { x: "1.051", y: "0.000", z: "-1.409" },
                smart_power_relay: { x: "1.716", y: "0.000", z: "-0.481" }
            }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
        return defaultDB;
    }
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { spaceId: "noemata-main", originDatum: "doorframe_main", anchors: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Routes
app.get('/api/spatial/map', (req, res) => {
    res.json(readDB());
});

app.post('/api/spatial/register', (req, res) => {
    const { deviceId, position, anchorUUID } = req.body;
    const db = readDB();

    if (!db.anchors) db.anchors = {};

    db.anchors[deviceId] = {
        ...position,
        anchorUUID: anchorUUID || null,
        timestamp: Date.now()
    };

    writeDB(db);
    console.log(`[ANCHOR REGISTERED] Device: ${deviceId} | Relative Position:`, position);

    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', deviceId, position, anchorUUID });
});

// Telemetry Endpoints
app.post('/api/telemetry/climate', (req, res) => {
    const { deviceId, temperature, humidity, status } = req.body;
    const tempVal = temperature !== undefined ? temperature : "--";
    const humVal = humidity !== undefined ? humidity : "--";
    const statusVal = status || (parseFloat(tempVal) > 85 ? "OVERHEATING_WARNING" : "OPTIMAL");

    io.emit('climateStateUpdate', {
        deviceId: deviceId || 'smart_climate_node',
        temperature: tempVal,
        humidity: humVal,
        status: statusVal
    });
    res.json({ status: "success", message: "Climate telemetry processed" });
});

app.post('/api/telemetry/safety', (req, res) => {
    const { deviceId, distance, perimeter } = req.body;
    const distVal = distance !== undefined ? distance : 0;
    const stateVal = perimeter || (distVal > 0 && distVal < 12 ? "BREACH_ALERT" : "SECURE");

    io.emit('twinStateUpdate', {
        perimeter_monitor: {
            perimeter: stateVal,
            distance: distVal,
            breachCount: stateVal === "BREACH_ALERT" ? 1 : 0
        }
    });
    res.json({ status: "success", message: "Safety telemetry processed" });
});

app.post('/api/telemetry/relay', (req, res) => {
    const { state, powerDraw } = req.body;
    if (state !== undefined) currentHardwareState.relayStatus = state;
    if (powerDraw !== undefined) currentHardwareState.powerDraw = powerDraw;

    io.emit('twinStateUpdate', {
        smart_power_relay: {
            status: currentHardwareState.relayStatus,
            powerDraw: currentHardwareState.powerDraw
        }
    });
    res.json({ status: "success", currentHardwareState });
});

// Bi-directional hardware toggle
app.post('/api/hardware/relay/toggle', (req, res) => {
    const newStatus = currentHardwareState.relayStatus === "ON" ? "OFF" : "ON";
    const newPower = newStatus === "ON" ? "0.42" : "0.0";

    currentHardwareState.relayStatus = newStatus;
    currentHardwareState.powerDraw = newPower;

    console.log(`[HARDWARE TOGGLE] Relay set to: ${newStatus}`);

    io.emit('relayHardwareCommand', { command: newStatus });
    io.emit('twinStateUpdate', {
        smart_power_relay: {
            status: newStatus,
            powerDraw: newPower
        }
    });

    res.json({ status: "success", newState: newStatus, powerDraw: newPower });
});

app.get('/api/hardware/relay/status', (req, res) => {
    res.json({ command: currentHardwareState.relayStatus });
});

// Real-time Sockets
io.on('connection', (socket) => {
    console.log(`[CLIENT CONNECTED] ID: ${socket.id}`);
    const db = readDB();
    socket.emit('spatialAnchorsUpdated', db.anchors || db);

    socket.on('disconnect', () => {
        console.log(`[CLIENT DISCONNECTED] ID: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  NOEMATA SERVER ACTIVE ON PORT ${PORT}`);
    console.log(`==================================================`);
});