const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_PATH = path.join(__dirname, 'spatial-db.json');

app.use(express.json());
app.use(express.static('public'));

// Helper to read database
function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        return { anchors: {}, matrix: null };
    }
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { anchors: {}, matrix: null };
    }
}

// Helper to write database
function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Register Hardware Anchor Position
app.post('/api/spatial/register', (req, res) => {
    const { deviceId, position, anchorUUID } = req.body;
    const db = readDB();
    if (!db.anchors) db.anchors = {};

    db.anchors[deviceId] = { ...position, anchorUUID, timestamp: Date.now() };
    writeDB(db);

    io.emit('spatialAnchorsUpdated', db.anchors);
    res.json({ status: 'success', deviceId, position });
});

// Save Spatial Alignment Matrix (Run ONCE during setup)
app.post('/api/spatial/register-matrix', (req, res) => {
    const { position, quaternion } = req.body;
    const db = readDB();

    db.matrix = { position, quaternion, timestamp: Date.now() };
    writeDB(db);

    io.emit('spatialMatrixUpdated', db.matrix);
    res.json({ status: 'success', matrix: db.matrix });
});

// Fetch Spatial Map & Saved Matrix
app.get('/api/spatial/map', (req, res) => {
    const db = readDB();
    res.json(db);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[NOEMATA SERVER RUNNING] Port ${PORT}`);
});