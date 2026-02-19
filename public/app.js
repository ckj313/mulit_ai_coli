const roomListEl = document.getElementById('room-list');
const roomTitleEl = document.getElementById('room-title');
const statusTextEl = document.getElementById('status-text');
const messageListEl = document.getElementById('message-list');
const messageFormEl = document.getElementById('message-form');
const messageInputEl = document.getElementById('message-input');
const newRoomBtn = document.getElementById('new-room-btn');

let rooms = [];
let currentRoomId = null;
let ws = null;

function formatRole(message) {
  if (message.senderType === 'user') return '用户';
  if (message.senderType === 'system') return '系统';
  if (message.agentId === 'claude') return 'Claude 主架构师';
  if (message.agentId === 'codex') return 'Codex 审查官';
  if (message.agentId === 'gemini') return 'Gemini 设计师';
  return '未知';
}

function roleClass(message) {
  if (message.senderType === 'user') return 'user';
  if (message.senderType === 'system') return 'system';
  return message.agentId || 'system';
}

function renderRooms() {
  roomListEl.innerHTML = '';

  rooms.forEach((room) => {
    const li = document.createElement('li');
    li.className = `room-item${room.id === currentRoomId ? ' active' : ''}`;
    li.textContent = room.title;
    li.title = room.id;
    li.addEventListener('click', () => {
      if (room.id === currentRoomId) return;
      openRoom(room.id);
    });
    roomListEl.appendChild(li);
  });
}

function renderMessages(messages) {
  messageListEl.innerHTML = '';

  messages.forEach((message) => {
    appendMessage(message);
  });
}

function appendMessage(message) {
  const wrapper = document.createElement('article');
  wrapper.className = 'message';

  const head = document.createElement('div');
  head.className = 'message-head';

  const role = document.createElement('span');
  role.className = `message-role ${roleClass(message)}`;
  role.textContent = formatRole(message);

  const time = document.createElement('span');
  time.textContent = new Date(message.createdAt).toLocaleString();

  head.appendChild(role);
  head.appendChild(time);

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = message.content;

  wrapper.appendChild(head);
  wrapper.appendChild(content);

  messageListEl.appendChild(wrapper);
  messageListEl.scrollTop = messageListEl.scrollHeight;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

function attachSocket(roomId) {
  if (ws) {
    ws.close();
    ws = null;
  }

  ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws?roomId=${roomId}`);

  ws.addEventListener('message', (event) => {
    const packet = JSON.parse(event.data);
    if (packet.roomId !== currentRoomId) return;

    if (packet.type === 'message') {
      appendMessage(packet.payload);
    }

    if (packet.type === 'status') {
      const phase = packet.payload?.phase || 'unknown';
      statusTextEl.textContent = `状态：${phase}`;
    }

    if (packet.type === 'error') {
      statusTextEl.textContent = `状态：错误 - ${packet.payload?.message || ''}`;
    }
  });

  ws.addEventListener('close', () => {
    statusTextEl.textContent = '状态：连接已断开';
  });
}

async function openRoom(roomId) {
  currentRoomId = roomId;
  renderRooms();

  const room = rooms.find((entry) => entry.id === roomId);
  roomTitleEl.textContent = room?.title || roomId;

  const data = await request(`/api/rooms/${roomId}/messages`);
  renderMessages(data.messages);
  attachSocket(roomId);
}

async function loadRooms() {
  const data = await request('/api/rooms');
  rooms = data.rooms;
  if (rooms.length === 0) {
    const created = await request('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ title: '默认协作房间' }),
    });
    rooms = [created.room];
  }

  if (!currentRoomId) {
    currentRoomId = rooms[0].id;
  }

  renderRooms();
  await openRoom(currentRoomId);
}

messageFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const content = messageInputEl.value.trim();
  if (!content || !currentRoomId) {
    return;
  }

  messageInputEl.value = '';
  statusTextEl.textContent = '状态：任务已提交';

  try {
    await request(`/api/rooms/${currentRoomId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  } catch (error) {
    statusTextEl.textContent = `状态：提交失败 ${error instanceof Error ? error.message : String(error)}`;
  }
});

newRoomBtn.addEventListener('click', async () => {
  const name = prompt('输入房间标题');
  const payload = name && name.trim() ? { title: name.trim() } : {};

  const data = await request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  rooms = [data.room, ...rooms];
  await openRoom(data.room.id);
  renderRooms();
});

loadRooms().catch((error) => {
  statusTextEl.textContent = `状态：初始化失败 ${error instanceof Error ? error.message : String(error)}`;
});
