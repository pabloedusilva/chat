// login elements
const login = document.querySelector(".login")
const loginForm = login.querySelector(".login__form")
const loginInput = login.querySelector(".login__input")

// chat elements
const chat = document.querySelector('.chat')
const chatForm = chat.querySelector('.chat__form')
const chatInput = chat.querySelector('.chat__input')
const chatMessages = chat.querySelector('.chat__messages')
const chatHeader = chat.querySelector('.chat__header')

// reply preview container (inserted above input)
let replyState = null // { id, sender, text }
const replyPreview = document.createElement('div')
replyPreview.className = 'reply-preview'
replyPreview.style.display = 'none'
// start empty; we'll populate DOM inside setReplyPreview so we can include a colored bar
replyPreview.innerHTML = ''
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
        replyPreview.innerHTML = ''
        return
    }

    // highlight original message node if supplied
    if (reply.node && reply.node.classList) {
        reply.node.classList.add('replying')
        highlightedNode = reply.node
    }

    // build preview with colored bar, meta and close button (delegated listener handles close)
    const barColor = reply.senderColor || reply.color || (reply.node && reply.node.dataset && reply.node.dataset.userColor) || '#90a4ae'

    replyPreview.innerHTML = ''
    replyPreview.style.display = 'flex'

    const container = document.createElement('div')
    container.style.display = 'flex'
    container.style.alignItems = 'center'
    container.style.gap = '12px'
    container.style.width = '100%'

    const bar = document.createElement('div')
    bar.className = 'preview-bar'
    bar.style.background = barColor

    const meta = document.createElement('div')
    meta.style.flex = '1'

    const replier = (user.name && reply.node && reply.node.classList && reply.node.classList.contains('message--self')) ? 'Você' : (user.name || 'Você')
    const repliedTo = reply.sender

    const who = document.createElement('div')
    who.className = 'reply-author'
    who.textContent = `${replier} respondendo a ${repliedTo}`

    const text = document.createElement('div')
    text.className = 'reply-text'
    text.textContent = reply.text

    const close = document.createElement('button')
    close.className = 'reply-close'
    close.title = 'Cancelar resposta'
    close.type = 'button'
    close.innerHTML = '×'

    meta.appendChild(who)
    meta.appendChild(text)

    container.appendChild(bar)
    container.appendChild(meta)
    container.appendChild(close)

    replyPreview.appendChild(container)
}

// delegated listener: allow cancelling reply by clicking any close button inside preview
replyPreview.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('reply-close')) {
        e.stopPropagation()
        setReplyPreview(null)
    }
})

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
// track localIds to avoid duplicate echo when server broadcasts back the same message
const displayedLocalIds = new Set()

const createMessageSelfElement = (content, reply) => {
        const div = document.createElement('div')
        div.classList.add('message--self')
        // mark dataset so reply button can pick up color/name
        div.dataset.userId = user.id || ''
        div.dataset.userName = user.name || ''
        div.dataset.userColor = user.color || ''
        if (reply) div.classList.add('message--reply')
        if (reply) {
            const q = document.createElement('div')
            q.className = 'message--quoted'
            // left color bar using reply.senderColor when available
            const barColor = reply.senderColor || reply.color || '#7aa7ff'
            q.innerHTML = `<div class="quoted-bar" style="background:${escapeHtml(barColor)}"></div><div class="quoted-body"><div class="reply-meta">${escapeHtml('Você')} → ${escapeHtml(reply.sender)}</div><div class="quoted-text">${escapeHtml(reply.text)}</div></div>`
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
        // set dataset for other user info
        div.dataset.userName = sender || ''
        div.dataset.userColor = senderColor || ''
        if (reply) div.classList.add('message--reply')
        if (reply) {
            const q = document.createElement('div')
            q.className = 'message--quoted'
            // left color bar uses the replied person's color when provided
            const barColor = reply.senderColor || reply.color || senderColor || '#7aa7ff'
            q.innerHTML = `<div class="quoted-bar" style="background:${escapeHtml(barColor)}"></div><div class="quoted-body"><div class="reply-meta">${escapeHtml(sender)} → ${escapeHtml(reply.sender)}</div><div class="quoted-text">${escapeHtml(reply.text)}</div></div>`
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

// scroll the chat messages container to the bottom
const scrollChatToBottom = () => {
    try {
        chatMessages.scrollTop = chatMessages.scrollHeight
    } catch (e) {
        // fallback to window if something goes wrong
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }
}

// ensure the messages container has the right height so overflow-y works
function updateChatLayout() {
    try {
        const headerH = chatHeader ? chatHeader.offsetHeight : 0
        const formH = chatForm ? chatForm.offsetHeight : 0
        const available = window.innerHeight - headerH - formH
        if (available > 100) {
            chatMessages.style.height = available + 'px'
            chatMessages.style.overflowY = 'auto'
        }
    } catch (e) {
        // ignore
    }
}

// debounce helper
function debounce(fn, wait = 120) {
    let t = null
    return (...args) => {
        clearTimeout(t)
        t = setTimeout(() => fn(...args), wait)
    }
}

window.addEventListener('resize', debounce(updateChatLayout, 80))

const processMessage = ({ data }) => {
        const parsed = JSON.parse(data)

        // handle meta messages like connected count
        if (parsed.type === 'meta' && typeof parsed.connected !== 'undefined') {
            const el = document.getElementById(CONNECTED_COUNT_ID)
            if (el) {
                const n = Number(parsed.connected) || 0
                el.textContent = n === 1 ? '1 pessoa online' : `${n} pessoas online`
            }
            return
        }

        // render a chat message in a single place so reply rendering is consistent
        renderMessage(parsed)
}

// central place to render a message object coming from server
function renderMessage(parsed) {
    const { userId, userName, userColor, content, replyTo } = parsed
    // avoid rendering duplicates when we already showed a local echo
    if (parsed.localId && displayedLocalIds.has(parsed.localId)) {
        // already displayed locally; remove from set to allow future messages
        displayedLocalIds.delete(parsed.localId)
        return
    }
    const reply = replyTo ? { id: replyTo.id, sender: replyTo.sender, text: replyTo.text, senderColor: replyTo.senderColor || replyTo.color || null } : null

    const messageEl = userId == user.id
        ? createMessageSelfElement(content, reply)
        : createMessageOtherElement(content, userName, userColor, reply)

    chatMessages.appendChild(messageEl)
    // after appending a message, ensure layout is correct and scroll the messages container to the bottom
    updateChatLayout()
    scrollChatToBottom()
}

const handleLogin = (event) => {
    event.preventDefault()

    user.id = crypto.randomUUID()
    user.name = loginInput.value
    user.color = getRandomColor()

    login.style.display = "none"
    chat.style.display = "flex"

    // layout depends on header/form sizes — set heights so messages can scroll
    updateChatLayout()

    // Choose the right websocket protocol and host for local vs deployed environments
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const host = location.hostname
    const port = location.port ? `:${location.port}` : ''
    websocket = new WebSocket(`${protocol}://${host}${port}`)
    websocket.onmessage = processMessage
}

// localStorage persistence removed — chat is real-time only and not saved across reloads

const sendMessage = (event) => {
    event.preventDefault()

    const localId = Date.now().toString()
    const message = {
        userId: user.id,
        userName: user.name,
        userColor: user.color,
        content: chatInput.value,
        replyTo: replyState ? { id: replyState.id, sender: replyState.sender, text: replyState.text, senderColor: replyState.color || null } : null,
        localId
    }

    // immediate local render so user sees the reply bubble instantly
    displayedLocalIds.add(localId)
    renderMessage(message)

    // send to server (server will broadcast back but we'll ignore duplicate via localId)
    websocket.send(JSON.stringify(message))

    chatInput.value = ''
    setReplyPreview(null)
}

loginForm.addEventListener('submit', handleLogin)
chatForm.addEventListener('submit', sendMessage)

// ---------------------- drag to reply implementation ----------------------
function makeMessageDraggable(el) {
    // disable drag-to-reply on larger screens (desktop) — only use button there
    if (window.matchMedia && window.matchMedia('(min-width: 768px)').matches) return
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
                setReplyPreview({ id: Date.now().toString(), sender, text, node: el, color: el.dataset.userColor || '' })
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
    btn.type = 'button'
    btn.title = 'Responder'
    // nicer reply-arrow SVG (left-curving reply arrow) which looks better on desktop
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const senderEl = el.querySelector('.message--sender')
        const bodyEl = el.querySelector('.message--body')
        const sender = senderEl ? senderEl.textContent : (user.name || 'Você')
        const text = bodyEl ? bodyEl.textContent : el.textContent
        // grab color from dataset if available
        const color = el.dataset.userColor || (senderEl ? senderEl.style.color : '')
        setReplyPreview({ id: Date.now().toString(), sender, text, node: el, color })
        // scroll the original message into view so user clearly sees what they're replying to
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (e) { /* ignore */ }
        // focus the input so user can type reply immediately
        chatInput.focus()
    })
    el.appendChild(btn)
}
