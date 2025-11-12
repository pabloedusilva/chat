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
replyPreview.innerHTML = `<div class="reply-author"></div><div class="reply-text"></div>`
chatForm.insertBefore(replyPreview, chatForm.firstChild)

const setReplyPreview = (reply) => {
    replyState = reply
    if (!reply) {
        replyPreview.style.display = 'none'
        return
    }
    replyPreview.querySelector('.reply-author').textContent = reply.sender
    replyPreview.querySelector('.reply-text').textContent = reply.text
    replyPreview.style.display = 'flex'
}

// allow cancelling reply by clicking preview
replyPreview.addEventListener('click', () => setReplyPreview(null))

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

const createMessageSelfElement = (content, reply) => {
        const div = document.createElement('div')

        div.classList.add('message--self')
        if (reply) div.classList.add('message--reply')

        if (reply) {
            const q = document.createElement('div')
            q.className = 'message--quoted'
            q.innerHTML = `<span class="message--sender">${escapeHtml(reply.sender)}</span><div class="quoted-text">${escapeHtml(reply.text)}</div>`
            div.appendChild(q)
        }

        const body = document.createElement('div')
        body.className = 'message--body'
        body.innerHTML = escapeHtml(content)
        div.appendChild(body)

        makeMessageDraggable(div)

        return div
}

const createMessageOtherElement = (content, sender, senderColor, reply) => {
        const div = document.createElement('div')
        div.classList.add('message--other')
        if (reply) div.classList.add('message--reply')

        if (reply) {
            const q = document.createElement('div')
            q.className = 'message--quoted'
            q.innerHTML = `<span class="message--sender">${escapeHtml(reply.sender)}</span><div class="quoted-text">${escapeHtml(reply.text)}</div>`
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
        const { userId, userName, userColor, content, replyTo } = JSON.parse(data)

        const reply = replyTo ? {
            id: replyTo.id,
            sender: replyTo.sender,
            text: replyTo.text
        } : null

        const message = userId == user.id
            ? createMessageSelfElement(content, reply)
            : createMessageOtherElement(content, userName, userColor, reply)

        chatMessages.appendChild(message)

        scrollScreen()
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
