const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_PATH = path.join(__dirname, 'spatial-db.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ==============================================================
// DATABASE HELPERS (Safely creates spatial-db.json if missing)
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

// Fetch Spatial Map & Saved Anchors
app.get('/api/spatial/map', (req, res) => {
    const db = readDB();
    res.json(db);
});

// Register Hardware Anchor Position & Persistent UUID
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

    // Broadcast updated anchor positions to all connected WebAR clients
    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', deviceId, position, anchorUUID });
});

// ==============================================================
// HARDWARE TELEMETRY ROUTES (Receives HTTPS POSTs from Arduinos)
// ==============================================================

// 1. Climate Node Telemetry (DHT11 / DHT22)
app.post('/api/telemetry/climate', (req, res) => {
    const { deviceId, temperature, humidity, status } = req.body;

    console.log(`[CLIMATE UPDATE] Temp: ${temperature}°F | Humidity: ${humidity}% | Status: ${status || 'OPTIMAL'}`);

    // Broadcast live telemetry update to WebAR Quest HUD
    io.emit('climateStateUpdate', {
        deviceId: deviceId || 'smart_climate_node',
        temperature: temperature !== undefined ? temperature : "--",
        humidity: humidity !== undefined ? humidity : "--",
        status: status || (temperature > 85 ? "OVERHEATING_WARNING" : "OPTIMAL")
    });

    res.json({ status: "success", message: "Climate telemetry processed" });
});

// 2. Safety / Perimeter Monitor Telemetry (Ultrasonic Sensor)
app.post('/api/telemetry/safety', (req, res) => {
    const { deviceId, distance, perimeter } = req.body;

    console.log(`[PERIMETER UPDATE] Distance: ${distance} in | State: ${perimeter}`);

    // Broadcast live perimeter alert to WebAR Quest HUD
    io.emit('twinStateUpdate', {
        perimeter_monitor: {
            perimeter: perimeter || (distance > 0 && distance < 12 ? "BREACH_ALERT" : "SECURE"),
            distance: distance !== undefined ? distance : 0,
            breachCount: (distance > 0 && distance < 12) ? 1 : 0
        }
    });

    res.json({ status: "success", message: "Safety telemetry processed" });
});

// 3. Smart Power Relay Telemetry / Webhook
app.post('/api/telemetry/relay', (req, res) => {
    const { deviceId, state, powerDraw } = req.body;

    console.log(`[POWER RELAY UPDATE] State: ${state} | Load: ${powerDraw} kW`);

    io.emit('twinStateUpdate', {
        smart_power_relay: {
            status: state || "OFF",
            powerDraw: powerDraw !== undefined ? powerDraw : "0.0"
        }
    });

    res.json({ status: "success", message: "Power relay telemetry processed" });
});

// Manual Test Broadcast Route (Trigger from desktop browser or phone to verify WebAR HUDs)
app.get('/api/test-telemetry', (req, res) => {
    io.emit('climateStateUpdate', {
        temperature: "76.4",
        humidity: "42.0",
        status: "OPTIMAL"
    });

    io.emit('twinStateUpdate', {
        perimeter_monitor: { perimeter: "SECURE", distance: 24, breachCount: 0 },
        smart_power_relay: { status: "ON", powerDraw: "0.18" }
    });

    res.send("Test telemetry broadcast emitted successfully!");
});

// ==============================================================
// REAL-TIME WEBSOCKET MANAGEMENT
// ==============================================================
io.on('connection', (socket) => {
    console.log(`[WEBAR CLIENT CONNECTED] ID: ${socket.id}`);

    // Send latest DB state immediately upon client connection
    const db = readDB();
    socket.emit('spatialAnchorsUpdated', db.anchors || db);

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
    console.log(`  READY FOR HARDWARE HTTPS TELEMETRY & WEBAR AR`);
    console.log(`==================================================`);
});