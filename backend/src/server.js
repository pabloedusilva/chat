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

    ws.on('message', (data) => {
        // broadcast to all connected clients
        wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) client.send(data.toString())
        })
    })

    console.log('client connected')
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
