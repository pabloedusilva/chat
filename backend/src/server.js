const express = require('express')
const http = require('http')
const { WebSocketServer } = require('ws')
const dotenv = require('dotenv')

dotenv.config()

const app = express()

// Basic HTTP routes so a plain browser GET doesn't get a 426 response.
app.get('/', (req, res) => res.send('WebSocket server running'))
app.get('/favicon.ico', (req, res) => res.status(204).end())

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
