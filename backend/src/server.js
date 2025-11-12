const express = require('express')
const http = require('http')
const { WebSocketServer } = require('ws')
const dotenv = require('dotenv')

dotenv.config()

const app = express()

// Serve frontend static files so visiting the backend host serves the SPA.
const path = require('path')
const frontendPath = path.join(__dirname, '..', '..', 'frontend')

app.use(express.static(frontendPath))

// fallback for index.html (single page app)
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')))

const server = http.createServer(app)

// Attach WebSocket server to the existing HTTP server so upgrades are handled
const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
    ws.on('error', console.error)

    // When a client sends a message, relay it to all clients unchanged.
    ws.on('message', (data) => {
        wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) client.send(data.toString())
        })
    })

    // Broadcast current connected count to all clients
    const broadcastCount = () => {
        const payload = JSON.stringify({ type: 'meta', connected: wss.clients.size })
        wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) client.send(payload)
        })
    }

    console.log('client connected')
    broadcastCount()

    ws.on('close', () => {
        broadcastCount()
    })
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
