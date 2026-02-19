const roomListEl = document.getElementById('room-list');
const roomTitleEl = document.getElementById('room-title');
const statusTextEl = document.getElementById('status-text');
const messageListEl = document.getElementById('message-list');
const messageFormEl = document.getElementById('message-form');
const messageInputEl = document.getElementById('message-input');
const mentionAutocompleteEl = document.getElementById('mention-autocomplete');
const newRoomBtn = document.getElementById('new-room-btn');

let rooms = [];
let currentRoomId = null;
let ws = null;

const AGENT_MENTIONS = [
  {
    token: 'claude',
    label: 'Claude 主架构师',
    note: '主架构与核心开发',
    keywords: ['claude', '布偶猫', 'architect'],
  },
  {
    token: 'codex',
    label: 'Codex 审查官',
    note: 'Code Review / 安全 / 测试',
    keywords: ['codex', '缅因猫', 'reviewer'],
  },
  {
    token: 'gemini',
    label: 'Gemini 设计师',
    note: '视觉设计与创意',
    keywords: ['gemini', '暹罗猫', 'designer'],
  },
];

const mentionState = {
  visible: false,
  start: -1,
  caret: -1,
  query: '',
  selectedIndex: 0,
  items: [],
};

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

function normalizeSearchText(value) {
  return value.trim().toLowerCase();
}

function detectMentionContext() {
  const caret = messageInputEl.selectionStart ?? messageInputEl.value.length;
  const before = messageInputEl.value.slice(0, caret);
  const match = before.match(/(?:^|[\s\n])@([\w\u4e00-\u9fa5-]*)$/u);
  if (!match) {
    return null;
  }

  const query = match[1] || '';
  return {
    query,
    start: caret - query.length - 1,
    caret,
  };
}

function findMentionCandidates(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return AGENT_MENTIONS.slice();
  }

  return AGENT_MENTIONS.filter((item) =>
    item.keywords.some((keyword) => normalizeSearchText(keyword).includes(normalizedQuery)),
  );
}

function hideMentionAutocomplete() {
  mentionState.visible = false;
  mentionState.items = [];
  mentionAutocompleteEl.innerHTML = '';
  mentionAutocompleteEl.classList.add('hidden');
}

function renderMentionAutocomplete() {
  if (!mentionState.visible || mentionState.items.length === 0) {
    hideMentionAutocomplete();
    return;
  }

  mentionAutocompleteEl.innerHTML = '';

  mentionState.items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mention-item${index === mentionState.selectedIndex ? ' active' : ''}`;
    button.dataset.index = String(index);
    button.innerHTML = `<span class="mention-main">@${item.token} · ${item.label}</span><span class="mention-sub">${item.note}</span>`;

    button.addEventListener('mouseenter', () => {
      mentionState.selectedIndex = index;
      renderMentionAutocomplete();
    });

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      insertSelectedMention(index);
    });

    mentionAutocompleteEl.appendChild(button);
  });

  mentionAutocompleteEl.classList.remove('hidden');
}

function updateMentionAutocomplete() {
  const context = detectMentionContext();
  if (!context) {
    hideMentionAutocomplete();
    return;
  }

  const candidates = findMentionCandidates(context.query);
  if (candidates.length === 0) {
    hideMentionAutocomplete();
    return;
  }

  const shouldResetSelection = mentionState.query !== context.query || !mentionState.visible;

  mentionState.visible = true;
  mentionState.start = context.start;
  mentionState.caret = context.caret;
  mentionState.query = context.query;
  mentionState.items = candidates;
  if (shouldResetSelection || mentionState.selectedIndex >= candidates.length) {
    mentionState.selectedIndex = 0;
  }

  renderMentionAutocomplete();
}

function insertSelectedMention(index = mentionState.selectedIndex) {
  const item = mentionState.items[index];
  if (!item || mentionState.start < 0 || mentionState.caret < 0) {
    hideMentionAutocomplete();
    return;
  }

  const originalText = messageInputEl.value;
  const before = originalText.slice(0, mentionState.start);
  const after = originalText.slice(mentionState.caret);
  const inserted = `@${item.token} `;
  const nextText = `${before}${inserted}${after}`;

  messageInputEl.value = nextText;
  const cursor = before.length + inserted.length;
  messageInputEl.focus();
  messageInputEl.setSelectionRange(cursor, cursor);
  hideMentionAutocomplete();
}

function moveMentionSelection(delta) {
  if (!mentionState.visible || mentionState.items.length === 0) {
    return;
  }

  const total = mentionState.items.length;
  mentionState.selectedIndex = (mentionState.selectedIndex + delta + total) % total;
  renderMentionAutocomplete();
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
  hideMentionAutocomplete();

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

messageInputEl.addEventListener('input', () => {
  updateMentionAutocomplete();
});

messageInputEl.addEventListener('click', () => {
  updateMentionAutocomplete();
});

messageInputEl.addEventListener('blur', () => {
  window.setTimeout(() => {
    hideMentionAutocomplete();
  }, 100);
});

messageInputEl.addEventListener('keydown', (event) => {
  if (!mentionState.visible) {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveMentionSelection(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveMentionSelection(-1);
    return;
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    insertSelectedMention();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    hideMentionAutocomplete();
  }
});

document.addEventListener('mousedown', (event) => {
  const target = event.target;
  if (target === messageInputEl) {
    return;
  }
  if (mentionAutocompleteEl.contains(target)) {
    return;
  }
  hideMentionAutocomplete();
});

loadRooms().catch((error) => {
  statusTextEl.textContent = `状态：初始化失败 ${error instanceof Error ? error.message : String(error)}`;
});
