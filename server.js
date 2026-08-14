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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let currentHardwareState = {
    relayStatus: "ON",
    powerDraw: "1.42"
};

function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        const defaultDB = {
            spaceId: "noemata-facility-alpha",
            originDatum: "doorframe_datum",
            anchors: {
                smart_climate_node: { x: "-0.85", y: "2.10", z: "-2.40" },
                perimeter_monitor: { x: "1.20", y: "2.40", z: "-3.10" },
                smart_power_relay: { x: "1.45", y: "1.20", z: "-1.80" }
            }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
        return defaultDB;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
        return { spaceId: "noemata-facility-alpha", anchors: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Spatial REST Endpoints
app.get('/api/spatial/map', (req, res) => {
    res.json(readDB());
});

app.post('/api/spatial/register', (req, res) => {
    const { deviceId, position } = req.body;
    const db = readDB();
    if (!db.anchors) db.anchors = {};

    db.anchors[deviceId] = {
        x: String(position.x),
        y: String(position.y),
        z: String(position.z),
        timestamp: Date.now()
    };

    writeDB(db);
    console.log(`[SAVED TO DB] ${deviceId} -> X:${position.x} Y:${position.y} Z:${position.z}`);
    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', deviceId, position });
});

// Telemetry & Hardware Control
app.post('/api/telemetry/climate', (req, res) => {
    const { temperature, humidity, status } = req.body;
    io.emit('climateStateUpdate', {
        temperature: temperature || "72.4",
        humidity: humidity || "45.0",
        status: status || "OPTIMAL"
    });
    res.json({ status: "success" });
});

app.post('/api/telemetry/safety', (req, res) => {
    const { distance, perimeter } = req.body;
    io.emit('twinStateUpdate', {
        perimeter_monitor: {
            perimeter: perimeter || "SECURE",
            distance: distance || 28,
            breachCount: perimeter === "BREACH_ALERT" ? 1 : 0
        }
    });
    res.json({ status: "success" });
});

app.post('/api/hardware/relay/toggle', (req, res) => {
    const newStatus = currentHardwareState.relayStatus === "ON" ? "OFF" : "ON";
    const newPower = newStatus === "ON" ? "1.42" : "0.00";
    currentHardwareState.relayStatus = newStatus;
    currentHardwareState.powerDraw = newPower;

    io.emit('relayHardwareCommand', { command: newStatus });
    io.emit('twinStateUpdate', {
        smart_power_relay: {
            status: newStatus,
            powerDraw: newPower
        }
    });
    res.json({ status: "success", state: currentHardwareState });
});

app.get('/api/hardware/relay/status', (req, res) => {
    res.json({ command: currentHardwareState.relayStatus });
});

// Sockets
io.on('connection', (socket) => {
    const db = readDB();
    socket.emit('spatialAnchorsUpdated', db.anchors || db);
    socket.emit('twinStateUpdate', {
        smart_power_relay: currentHardwareState
    });

    socket.on('toggleRelay', () => {
        const newStatus = currentHardwareState.relayStatus === "ON" ? "OFF" : "ON";
        currentHardwareState.relayStatus = newStatus;
        currentHardwareState.powerDraw = newStatus === "ON" ? "1.42" : "0.00";
        io.emit('twinStateUpdate', { smart_power_relay: currentHardwareState });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`NOEMATA INDUSTRIAL SERVER RUNNING ON PORT ${PORT}`);
});