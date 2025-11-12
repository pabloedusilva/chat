// login elements
const login = document.querySelector(".login")
const loginForm = login.querySelector(".login__form")
const loginInput = login.querySelector(".login__input")

// chat elements
const chat = document.querySelector('.chat')
const chatForm = chat.querySelector('.chat__form')
const chatInput = chat.querySelector('.chat__input')
const chatMessages = chat.querySelector('.chat__messages')

// reply preview container (inserted above input)
let replyState = null // { id, sender, text }
const replyPreview = document.createElement('div')
replyPreview.className = 'reply-preview'
replyPreview.style.display = 'none'
replyPreview.innerHTML = `<div class="reply-author"></div><div class="reply-text"></div><button class="reply-close" title="Cancelar resposta">×</button>`
chatForm.insertBefore(replyPreview, chatForm.firstChild)
// ensure absolute preview positions relative to the form
chatForm.style.position = chatForm.style.position || 'relative'

let highlightedNode = null
const setReplyPreview = (reply) => {
    // remove existing highlight
    if (highlightedNode) highlightedNode.classList.remove('replying')

    replyState = reply
    if (!reply) {
        replyPreview.style.display = 'none'
        highlightedNode = null
        return
    }

    // highlight original message node if supplied
    if (reply.node && reply.node.classList) {
        reply.node.classList.add('replying')
        highlightedNode = reply.node
    }

    const replier = (user.name && reply.node && reply.node.classList.contains('message--self')) ? 'Você' : (user.name || 'Você')
    const repliedTo = reply.sender
    replyPreview.querySelector('.reply-author').textContent = `${replier} respondendo a ${repliedTo}`
    replyPreview.querySelector('.reply-text').textContent = reply.text
    replyPreview.style.display = 'flex'
}

// allow cancelling reply by clicking preview
// close button inside preview cancels reply without closing the entire preview area via other clicks
replyPreview.querySelector('.reply-close').addEventListener('click', (e) => { e.stopPropagation(); setReplyPreview(null) })

const colors = [
    "cadetblue",
    "darkgoldenrod",
    "cornflowerblue",
    "darkkhaki",
    "hotpink",
    "gold"
]

const user = { id: "", name: "", color: "" }

let websocket
const CONNECTED_COUNT_ID = 'connected-count'
const STORAGE_KEY = 'chat_messages_v1'
const MAX_STORED = 200

const createMessageSelfElement = (content, reply) => {
        const div = document.createElement('div')

        div.classList.add('message--self')
        if (reply) div.classList.add('message--reply')

        if (reply) {
            const q = document.createElement('div')
            q.className = 'message--quoted'
            const replierLabel = 'Você'
            q.innerHTML = `<div class="reply-meta">${escapeHtml(replierLabel)} → ${escapeHtml(reply.sender)}</div><div class="quoted-text">${escapeHtml(reply.text)}</div>`
            div.appendChild(q)
        }

        const body = document.createElement('div')
        body.className = 'message--body'
        body.innerHTML = escapeHtml(content)
        div.appendChild(body)

        makeMessageDraggable(div)
        addReplyButton(div)

        return div
}

const createMessageOtherElement = (content, sender, senderColor, reply) => {
        const div = document.createElement('div')
        div.classList.add('message--other')
        if (reply) div.classList.add('message--reply')

        if (reply) {
            const q = document.createElement('div')
            q.className = 'message--quoted'
            const replierLabel = escapeHtml(sender)
            q.innerHTML = `<div class="reply-meta">${replierLabel} → ${escapeHtml(reply.sender)}</div><div class="quoted-text">${escapeHtml(reply.text)}</div>`
            div.appendChild(q)
        }

        const span = document.createElement('span')
        span.classList.add('message--sender')
        span.style.color = senderColor
        span.innerHTML = sender
        div.appendChild(span)

        const body = document.createElement('div')
        body.className = 'message--body'
        body.innerHTML = escapeHtml(content)
        div.appendChild(body)

        makeMessageDraggable(div)
        addReplyButton(div)

        return div
}

// small helper to avoid XSS when injecting text
function escapeHtml(str) {
    if (!str) return ''
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

const getRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * colors.length)
    return colors[randomIndex]
}

const scrollScreen = () => {
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth"
    })
}

const processMessage = ({ data }) => {
        const parsed = JSON.parse(data)

        // handle meta messages like connected count
        if (parsed.type === 'meta' && typeof parsed.connected !== 'undefined') {
            const el = document.getElementById(CONNECTED_COUNT_ID)
            if (el) el.textContent = `${parsed.connected} online`
            return
        }

        const { userId, userName, userColor, content, replyTo } = parsed
        const reply = replyTo ? { id: replyTo.id, sender: replyTo.sender, text: replyTo.text } : null

        const messageEl = userId == user.id
            ? createMessageSelfElement(content, reply)
            : createMessageOtherElement(content, userName, userColor, reply)

        chatMessages.appendChild(messageEl)
        scrollScreen()

        // persist message locally
        saveMessageLocally({ userId, userName, userColor, content, replyTo, ts: Date.now(), localId: Date.now().toString() })
}

const handleLogin = (event) => {
    event.preventDefault()

    user.id = crypto.randomUUID()
    user.name = loginInput.value
    user.color = getRandomColor()

    login.style.display = "none"
    chat.style.display = "flex"

    // Choose the right websocket protocol and host for local vs deployed environments
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const host = location.hostname
    const port = location.port ? `:${location.port}` : ''
    websocket = new WebSocket(`${protocol}://${host}${port}`)
    websocket.onmessage = processMessage
}

function loadStoredMessages() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
        const arr = JSON.parse(raw)
        arr.forEach((m) => {
            const reply = m.replyTo ? { id: m.replyTo.id, sender: m.replyTo.sender, text: m.replyTo.text } : null
            const el = m.userId == user.id
                ? createMessageSelfElement(m.content, reply)
                : createMessageOtherElement(m.content, m.userName, m.userColor, reply)
            chatMessages.appendChild(el)
        })
        scrollScreen()
    } catch (err) {
        console.error('Failed to parse stored messages', err)
    }
}

function saveMessageLocally(msg) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const arr = raw ? JSON.parse(raw) : []
        arr.push(msg)
        // keep cap
        if (arr.length > MAX_STORED) arr.splice(0, arr.length - MAX_STORED)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch (err) {
        console.error('Failed to save message locally', err)
    }
}

const sendMessage = (event) => {
    event.preventDefault()

    const message = {
        userId: user.id,
        userName: user.name,
        userColor: user.color,
        content: chatInput.value,
        replyTo: replyState ? { id: replyState.id, sender: replyState.sender, text: replyState.text } : null
    }

    websocket.send(JSON.stringify(message))

    chatInput.value = ''
    setReplyPreview(null)
}

loginForm.addEventListener('submit', handleLogin)
chatForm.addEventListener('submit', sendMessage)

// ---------------------- drag to reply implementation ----------------------
function makeMessageDraggable(el) {
    el.classList.add('draggable')

    let startX = 0
    let currentX = 0
    let dragging = false

    const onStart = (clientX) => {
        startX = clientX
        dragging = true
        el.classList.add('dragging')
    }

    const onMove = (clientX) => {
        if (!dragging) return
        currentX = clientX - startX
        // only allow horizontal right drag
        if (currentX > 0) {
            el.style.transform = `translateX(${Math.min(currentX, 120)}px)`
        }
    }

    const onEnd = () => {
        if (!dragging) return
        dragging = false
        el.classList.remove('dragging')
        const triggered = currentX > 60 // threshold to accept as reply gesture
        el.style.transform = ''
        if (triggered) {
            // find message body and sender
            const senderEl = el.querySelector('.message--sender')
            const bodyEl = el.querySelector('.message--body')
            const sender = senderEl ? senderEl.textContent : (user.name || 'Você')
            const text = bodyEl ? bodyEl.textContent : el.textContent
            // set preview
            setReplyPreview({ id: Date.now().toString(), sender, text })
            // small visual feedback
            el.classList.add('dragged-right')
            setTimeout(() => el.classList.remove('dragged-right'), 250)
        }
        startX = 0
        currentX = 0
    }

    // mouse events
    el.addEventListener('mousedown', (e) => onStart(e.clientX))
    window.addEventListener('mousemove', (e) => onMove(e.clientX))
    window.addEventListener('mouseup', onEnd)

    // touch events
    el.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX))
    window.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length) onMove(e.touches[0].clientX)
    }, { passive: true })
    window.addEventListener('touchend', onEnd)
}

// add reply button for desktop users (down-arrow). This complements drag-to-reply for mobile.
function addReplyButton(el) {
    const btn = document.createElement('button')
    btn.className = 'reply-btn'
    btn.title = 'Responder'
    // nicer reply-arrow SVG (left-curving reply arrow) which looks better on desktop
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const senderEl = el.querySelector('.message--sender')
        const bodyEl = el.querySelector('.message--body')
        const sender = senderEl ? senderEl.textContent : (user.name || 'Você')
        const text = bodyEl ? bodyEl.textContent : el.textContent
        setReplyPreview({ id: Date.now().toString(), sender, text, node: el })
        // focus the input so user can type reply immediately
        chatInput.focus()
    })
    el.appendChild(btn)
}
