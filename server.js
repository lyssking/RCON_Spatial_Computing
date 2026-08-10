const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const DB_FILE = './spatial-db.json';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let spatialMap = {};
if (fs.existsSync(DB_FILE)) {
    try {
        spatialMap = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (err) {
        console.error('DB Error:', err);
    }
}

let systemState = {
    smart_climate_node: { temperature: 72.0, humidity: 45.0, status: "OPTIMAL" },
    perimeter_monitor: { perimeter: "SECURE", breachCount: 0 },
    smart_power_relay: { status: "OFF", powerDraw: 0.0 }
};

app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'public/setup.html')));
app.get('/operator', (req, res) => res.sendFile(path.join(__dirname, 'public/operator.html')));

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
    res.json({ status: 'OK' });
});

app.post('/api/telemetry/climate', (req, res) => {
    const { temperature, humidity } = req.body;
    const tempVal = parseFloat(temperature);
    const isOverheating = tempVal > 85.0;

    systemState.smart_climate_node = {
        temperature: tempVal,
        humidity: parseFloat(humidity),
        status: isOverheating ? "OVERHEATING_WARNING" : "OPTIMAL"
    };

    io.emit('climateStateUpdate', systemState.smart_climate_node);
    res.json({ status: 'ACCEPTED' });
});

io.on('connection', (socket) => {
    socket.emit('spatialAnchorsUpdated', spatialMap);
    socket.emit('twinStateUpdate', systemState);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NOEMATA Server Active on Port ${PORT}`));