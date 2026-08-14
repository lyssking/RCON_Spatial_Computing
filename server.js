const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS enabled for WebAR clients & Arduinos
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

// ==============================================================
// IN-MEMORY HARDWARE STATE TRACKER
// ==============================================================
let currentHardwareState = {
    relayStatus: "OFF",
    powerDraw: "0.0"
};

// ==============================================================
// DATABASE HELPERS
// ==============================================================
function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        const defaultDB = {
            spaceId: "noemata-main",
            anchors: {
                smart_climate_node: { x: "0.000", y: "1.400", z: "-1.200" },
                perimeter_monitor: { x: "-0.600", y: "1.400", z: "-1.500" },
                smart_power_relay: { x: "0.600", y: "1.400", z: "-1.500" }
            }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
        return defaultDB;
    }
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { spaceId: "noemata-main", anchors: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ==============================================================
// SPATIAL MAP ROUTES
// ==============================================================
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
    console.log(`[ANCHOR REGISTERED] Device: ${deviceId} | Position:`, position);

    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', deviceId, position, anchorUUID });
});

// ==============================================================
// HARDWARE TELEMETRY & TWO-WAY CONTROL ROUTES
// ==============================================================

// 1. Climate Node Telemetry
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

// 2. Safety / Perimeter Monitor Telemetry
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

// 3. Smart Power Relay Status Endpoint (Receives Telemetry)
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

// 4. TWO-WAY CONTROL: WebAR Client Command to Toggle Physical Relay
app.post('/api/hardware/relay/toggle', (req, res) => {
    // Toggle state in memory
    const newStatus = currentHardwareState.relayStatus === "ON" ? "OFF" : "ON";
    const newPower = newStatus === "ON" ? "0.42" : "0.0";

    currentHardwareState.relayStatus = newStatus;
    currentHardwareState.powerDraw = newPower;

    console.log(`[BI-DIRECTIONAL CONTROL] Operator toggled relay to: ${newStatus}`);

    // Broadcast to physical Arduino & WebAR clients simultaneously
    io.emit('relayHardwareCommand', { command: newStatus });
    io.emit('twinStateUpdate', {
        smart_power_relay: {
            status: newStatus,
            powerDraw: newPower
        }
    });

    res.json({ status: "success", newState: newStatus, powerDraw: newPower });
});

// Endpoint for non-WebSocket Arduinos to poll command state
app.get('/api/hardware/relay/status', (req, res) => {
    res.json({ command: currentHardwareState.relayStatus });
});

// Diagnostic Test Route
app.get('/api/test-telemetry', (req, res) => {
    io.emit('climateStateUpdate', {
        temperature: "76.4",
        humidity: "42.0",
        status: "OPTIMAL"
    });

    io.emit('twinStateUpdate', {
        perimeter_monitor: { perimeter: "SECURE", distance: 24, breachCount: 0 },
        smart_power_relay: { status: currentHardwareState.relayStatus, powerDraw: currentHardwareState.powerDraw }
    });

    res.send("Test telemetry broadcast emitted!");
});

// ==============================================================
// REAL-TIME WEBSOCKET MANAGEMENT
// ==============================================================
io.on('connection', (socket) => {
    console.log(`[WEBAR CLIENT CONNECTED] ID: ${socket.id}`);

    const db = readDB();
    socket.emit('spatialAnchorsUpdated', db.anchors || db);

    // Allow WebAR client to directly trigger relay toggle via WebSocket
    socket.on('toggleRelay', () => {
        const newStatus = currentHardwareState.relayStatus === "ON" ? "OFF" : "ON";
        const newPower = newStatus === "ON" ? "0.42" : "0.0";

        currentHardwareState.relayStatus = newStatus;
        currentHardwareState.powerDraw = newPower;

        io.emit('relayHardwareCommand', { command: newStatus });
        io.emit('twinStateUpdate', {
            smart_power_relay: {
                status: newStatus,
                powerDraw: newPower
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`[WEBAR CLIENT DISCONNECTED] ID: ${socket.id}`);
    });
});

// ==============================================================
// SERVER STARTUP
// ==============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  NOEMATA SPATIAL SERVER ACTIVE ON PORT ${PORT}`);
    console.log(`  READY FOR HARDWARE TELEMETRY & TWO-WAY AR CONTROL`);
    console.log(`==================================================`);
});