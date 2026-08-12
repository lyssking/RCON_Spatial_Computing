const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_PATH = path.join(__dirname, 'spatial-db.json');

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Safely read or initialize spatial DB
function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        const defaultDB = {
            spaceId: "noemata-main",
            map: {
                source: "Scaniverse LAS",
                origin: { x: 564326.727, y: 4828189.443, z: 821.041 }
            },
            anchors: {
                smart_climate_node: { x: 1.2, y: 1.4, z: 2.1 },
                perimeter_monitor: { x: 3.5, y: 1.2, z: 5.8 },
                smart_power_relay: { x: 8.1, y: 1.5, z: 4.2 }
            }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
        return defaultDB;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
        return { spaceId: "noemata-main", anchors: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Map Data Endpoints
app.get('/api/spatial/map', (req, res) => {
    res.json(readDB());
});

app.post('/api/spatial/register-map', (req, res) => {
    const { map, anchors } = req.body;
    const db = readDB();
    if (map) db.map = map;
    if (anchors) db.anchors = anchors;
    writeDB(db);

    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', spaceId: db.spaceId, anchors: db.anchors });
});

app.post('/api/spatial/register', (req, res) => {
    const { deviceId, position } = req.body;
    const db = readDB();
    if (!db.anchors) db.anchors = {};

    db.anchors[deviceId] = { ...position, timestamp: Date.now() };
    writeDB(db);

    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', deviceId, position });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[NOEMATA SPATIAL SERVER RUNNING] Port ${PORT}`);
});