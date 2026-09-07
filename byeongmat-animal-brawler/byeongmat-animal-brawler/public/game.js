(() => {
  const socket = io();

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];

  const homePanel = $('#homePanel');
  const lobbyPanel = $('#lobbyPanel');
  const gamePanel = $('#gamePanel');
  const resultPanel = $('#resultPanel');
  const nickname = $('#nickname');
  const roomCodeInput = $('#roomCode');
  const createRoomBtn = $('#createRoom');
  const joinRoomBtn = $('#joinRoom');
  const homeMessage = $('#homeMessage');
  const lobbyCode = $('#lobbyCode');
  const playerList = $('#playerList');
  const copyInviteBtn = $('#copyInvite');
  const addBotBtn = $('#addBot');
  const startGameBtn = $('#startGame');
  const lobbyMessage = $('#lobbyMessage');
  const winnerText = $('#winnerText');
  const resultScores = $('#resultScores');
  const rematchButton = $('#rematchButton');
  const scoreBar = $('#scoreBar');
  const localName = $('#localName');
  const localDamage = $('#localDamage');
  const centerBanner = $('#centerBanner');
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');

  const WORLD = { matX: 340, matY: 200, koX: 455, koY: 300 };
  const C = {
    zzigae: { name: '찌개', kind: '말티푸', fur: '#9b623a', fur2: '#c48755', dark: '#50311f', accent: '#f0c7a6' },
    gamja: { name: '감자', kind: '토이푸들', fur: '#e9d3a4', fur2: '#f5e7c5', dark: '#8c7450', accent: '#fff0d0' },
    mandu: { name: '만두', kind: '푸들', fur: '#f2f1ec', fur2: '#ffffff', dark: '#9aa0a7', accent: '#d6d9df' },
    jongeun: { name: '종은이', kind: '고양이', fur: '#f3f2e9', fur2: '#d78a4b', dark: '#5a5149', accent: '#9bc6dc' }
  };

  let selectedCharacter = 'zzigae';
  let myId = null;
  let currentRoom = null;
  let lobby = null;
  let snapshot = new Map();
  let displayPlayers = new Map();
  let particles = [];
  let shakes = 0;
  let bannerTimer = null;
  let gameRunning = false;
  let lastFrame = performance.now();
  let audioCtx = null;
  let isHost = false;
  let roomWinKos = 5;

  const input = { up: false, down: false, left: false, right: false };
  const keyMap = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right'
  };

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  function beep(type = 'hit') {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type === 'ko' ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(type === 'ko' ? 150 : 115 + Math.random() * 55, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'ko' ? 55 : 70, now + 0.08);
    gain.gain.setValueAtTime(type === 'ko' ? 0.09 : 0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (type === 'ko' ? 0.22 : 0.08));
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + (type === 'ko' ? 0.23 : 0.09));
  }

  function showOnly(panel) {
    [homePanel, lobbyPanel, gamePanel, resultPanel].forEach(p => p.classList.add('hidden'));
    panel.classList.remove('hidden');
  }

  function setMessage(el, text, bad = false) {
    el.textContent = text || '';
    el.style.color = bad ? '#ff9a9a' : '';
  }

  function showBanner(text, ms = 900) {
    centerBanner.textContent = text;
    centerBanner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => centerBanner.classList.add('hidden'), ms);
  }

  function drawPixelRect(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function drawSprite(g, charKey, x, y, opts = {}) {
    const ch = C[charKey] || C.zzigae;
    const scale = opts.scale || 2;
    const facing = opts.facing || 1;
    const state = opts.state || 'idle';
    const bob = state === 'walk' ? Math.sin((opts.time || 0) * 0.018) * 1.3 : 0;
    const jump = opts.jump || 0;
    const ox = Math.round(x);
    const oy = Math.round(y - bob - jump);

    g.save();
    g.translate(ox, oy);
    g.scale(facing * scale, scale);
    g.translate(facing < 0 ? -24 : 0, 0);

    if (charKey === 'jongeun') {
      // tail
      drawPixelRect(g, 18, 10, 5, 3, ch.fur2);
      drawPixelRect(g, 21, 7, 3, 5, ch.fur2);
      drawPixelRect(g, 20, 4, 3, 4, ch.fur2);
      // body
      drawPixelRect(g, 6, 10, 13, 10, ch.fur);
      drawPixelRect(g, 4, 8, 9, 10, ch.fur);
      // head + ears
      drawPixelRect(g, 3, 3, 12, 10, ch.fur);
      drawPixelRect(g, 3, 1, 4, 4, ch.fur2);
      drawPixelRect(g, 11, 1, 4, 4, ch.fur2);
      drawPixelRect(g, 10, 4, 5, 4, ch.fur2);
      // face
      drawPixelRect(g, 5, 6, 2, 2, ch.accent);
      drawPixelRect(g, 11, 6, 2, 2, ch.accent);
      drawPixelRect(g, 8, 8, 2, 2, '#d68077');
      drawPixelRect(g, 8, 10, 1, 1, ch.dark);
      // legs
      drawPixelRect(g, 6, 18, 4, 4, ch.fur);
      drawPixelRect(g, 14, 18, 4, 4, ch.fur);
    } else {
      // tail
      drawPixelRect(g, 18, 9, 4, 4, ch.fur2);
      drawPixelRect(g, 20, 7, 3, 3, ch.fur2);
      // body
      drawPixelRect(g, 5, 10, 14, 10, ch.fur);
      drawPixelRect(g, 7, 8, 11, 12, ch.fur2);
      // head fluffy silhouette
      drawPixelRect(g, 3, 3, 14, 10, ch.fur);
      drawPixelRect(g, 1, 5, 4, 6, ch.fur);
      drawPixelRect(g, 15, 5, 4, 6, ch.fur);
      drawPixelRect(g, 5, 1, 10, 4, ch.fur2);
      // muzzle
      drawPixelRect(g, 7, 8, 7, 4, ch.accent);
      drawPixelRect(g, 9, 8, 2, 2, '#252525');
      drawPixelRect(g, 6, 6, 2, 2, '#1c1c1c');
      drawPixelRect(g, 13, 6, 2, 2, '#1c1c1c');
      // legs
      drawPixelRect(g, 6, 18, 4, 4, ch.fur);
      drawPixelRect(g, 14, 18, 4, 4, ch.fur);
    }

    // attack poses: deliberately exaggerated and silly
    if (state === 'punch') {
      drawPixelRect(g, 18, 10, 7, 4, ch.fur2);
      drawPixelRect(g, 24, 9, 3, 6, ch.fur);
    } else if (state === 'kick' || state === 'jumpkick') {
      drawPixelRect(g, 17, 17, 9, 4, ch.fur2);
      drawPixelRect(g, 24, 16, 4, 5, ch.fur);
    } else if (state === 'headbutt') {
      drawPixelRect(g, 16, 5, 5, 8, ch.fur);
    } else if (state === 'hurt') {
      drawPixelRect(g, 1, 8, 4, 3, '#f3a0a0');
    }

    g.restore();
  }

  function renderCharacterPreviews() {
    $$('.character-card').forEach(card => {
      const c = card.querySelector('canvas');
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = '#0f141d';
      g.fillRect(0, 0, c.width, c.height);
      drawSprite(g, card.dataset.character, 9, 11, { scale: 2.2, facing: 1, state: 'idle' });
    });
  }

  function renderMini(canvasEl, charKey) {
    const g = canvasEl.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvasEl.width, canvasEl.height);
    g.fillStyle = '#0d121a';
    g.fillRect(0, 0, canvasEl.width, canvasEl.height);
    drawSprite(g, charKey, 3, 5, { scale: 1.9, facing: 1 });
  }

  function normalizedName() {
    return nickname.value.trim().slice(0, 12) || '동물';
  }

  function callbackPromise(event, payload) {
    return new Promise(resolve => socket.emit(event, payload, resolve));
  }

  async function createRoom() {
    ensureAudio();
    createRoomBtn.disabled = true;
    setMessage(homeMessage, '방 만드는 중...');
    const res = await callbackPromise('create_room', { name: normalizedName(), character: selectedCharacter });
    createRoomBtn.disabled = false;
    if (!res?.ok) return setMessage(homeMessage, res?.error || '방을 만들지 못했어요.', true);
    myId = res.playerId;
    currentRoom = res.code;
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(currentRoom)}`);
    showOnly(lobbyPanel);
  }

  async function joinRoom() {
    ensureAudio();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) return setMessage(homeMessage, '4자리 방 코드를 입력해 주세요.', true);
    joinRoomBtn.disabled = true;
    setMessage(homeMessage, '입장 중...');
    const res = await callbackPromise('join_room', { code, name: normalizedName(), character: selectedCharacter });
    joinRoomBtn.disabled = false;
    if (!res?.ok) return setMessage(homeMessage, res?.error || '방에 들어가지 못했어요.', true);
    myId = res.playerId;
    currentRoom = res.code;
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(currentRoom)}`);
    showOnly(lobbyPanel);
  }

  function renderLobby(state) {
    lobby = state;
    currentRoom = state.code;
    lobbyCode.textContent = state.code;
    isHost = state.hostId === myId;
    playerList.innerHTML = '';

    state.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      const mini = document.createElement('canvas');
      mini.width = 48; mini.height = 48;
      const meta = document.createElement('div');
      meta.className = 'player-meta';
      const strong = document.createElement('strong');
      strong.textContent = p.name;
      const sub = document.createElement('span');
      sub.textContent = `${C[p.character]?.name || p.character}${p.isBot ? ' · BOT' : ''}`;
      meta.append(strong, sub);
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = p.isHost ? '방장' : '';
      row.append(mini, meta, badge);
      if (isHost && p.isBot) {
        const remove = document.createElement('button');
        remove.className = 'remove-bot';
        remove.type = 'button';
        remove.textContent = '빼기';
        remove.addEventListener('click', () => socket.emit('remove_bot', { id: p.id }));
        row.append(remove);
      } else {
        row.append(document.createElement('span'));
      }
      playerList.append(row);
      renderMini(mini, p.character);
    });

    addBotBtn.style.display = isHost ? '' : 'none';
    startGameBtn.style.display = isHost ? '' : 'none';
    rematchButton.style.display = isHost ? '' : 'none';
    setMessage(lobbyMessage, isHost ? '친구를 기다리거나 봇을 넣고 바로 테스트할 수 있어요.' : '방장이 게임을 시작할 때까지 기다려 주세요.');
  }

  function worldToScreen(x, y, z = 0) {
    return {
      x: 320 + (x - y) * 0.55,
      y: 185 + (x + y) * 0.28 - z * 0.65
    };
  }

  function matCorners(xr, yr) {
    return [
      worldToScreen(-xr, -yr),
      worldToScreen(xr, -yr),
      worldToScreen(xr, yr),
      worldToScreen(-xr, yr)
    ];
  }

  function poly(points, fill, stroke, width = 1) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function drawArena() {
    ctx.fillStyle = '#8f684b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // floorboards
    ctx.strokeStyle = 'rgba(55,34,22,.22)';
    ctx.lineWidth = 1;
    for (let y = 14; y < canvas.height; y += 18) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y + 16); ctx.stroke();
    }
    for (let x = -100; x < canvas.width + 100; x += 74) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 80, canvas.height); ctx.stroke();
    }

    const outer = matCorners(WORLD.matX + 14, WORLD.matY + 14);
    poly(outer, '#695a43', '#3a3025', 3);
    const mat = matCorners(WORLD.matX, WORLD.matY);
    poly(mat, '#6d8b6a', '#364937', 2);

    // woven stripes
    ctx.save();
    ctx.globalAlpha = .17;
    for (let x = -300; x <= 300; x += 42) {
      const a = worldToScreen(x, -WORLD.matY);
      const b = worldToScreen(x, WORLD.matY);
      ctx.strokeStyle = x % 84 === 0 ? '#d9d5a8' : '#293b2d';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let y = -160; y <= 160; y += 40) {
      const a = worldToScreen(-WORLD.matX, y);
      const b = worldToScreen(WORLD.matX, y);
      ctx.strokeStyle = '#d9d5a8';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();

    // goofy household clutter near the arena edges
    const bowl = worldToScreen(-385, 210);
    ctx.fillStyle = '#d9d9df'; ctx.fillRect(Math.round(bowl.x - 13), Math.round(bowl.y - 4), 26, 8);
    ctx.fillStyle = '#626978'; ctx.fillRect(Math.round(bowl.x - 10), Math.round(bowl.y - 6), 20, 4);
    const toy = worldToScreen(390, -205);
    ctx.fillStyle = '#e9b24f'; ctx.fillRect(Math.round(toy.x - 9), Math.round(toy.y - 4), 18, 8);
    ctx.fillStyle = '#c7862f'; ctx.fillRect(Math.round(toy.x - 3), Math.round(toy.y - 7), 6, 14);
  }

  function getDisplayPlayer(id, target) {
    let d = displayPlayers.get(id);
    if (!d) {
      d = { ...target, x: target.x, y: target.y, z: target.z, lastX: target.x, lastY: target.y };
      displayPlayers.set(id, d);
    }
    return d;
  }

  function attackState(p, now) {
    if (p.stunned) return 'hurt';
    if (!p.attack) {
      const moving = Math.hypot((p.x ?? 0) - (p.lastX ?? p.x ?? 0), (p.y ?? 0) - (p.lastY ?? p.y ?? 0)) > 0.25;
      return moving ? 'walk' : 'idle';
    }
    return p.attack.type;
  }

  function drawPlayer(p, now) {
    if (!p.alive) return;
    const pos = worldToScreen(p.x, p.y, p.z);
    const ground = worldToScreen(p.x, p.y, 0);
    const screenFacing = (p.facingX - p.facingY) >= 0 ? 1 : -1;

    // shadow
    ctx.fillStyle = `rgba(18,16,14,${0.28 - Math.min(p.z, 130) / 700})`;
    ctx.fillRect(Math.round(ground.x - 13), Math.round(ground.y + 9), 26, 5);

    const state = attackState(p, now);
    drawSprite(ctx, p.character, pos.x - 24, pos.y - 42, {
      scale: 2,
      facing: screenFacing,
      state,
      time: now,
      jump: 0
    });

    // name / damage
    const labelY = pos.y - 49;
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = p.id === myId ? '#ffe078' : '#ffffff';
    ctx.fillText(p.name, Math.round(pos.x), Math.round(labelY));
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = p.damage < 70 ? '#e8f0e6' : p.damage < 130 ? '#ffd36c' : '#ff7777';
    ctx.fillText(`${Math.round(p.damage)}%`, Math.round(pos.x), Math.round(labelY + 10));

    // invincibility sparkle after respawn
    if (p.respawnAt === 0 && p.damage === 0 && Math.floor(now / 120) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(Math.round(pos.x - 15), Math.round(pos.y - 35), 3, 3);
      ctx.fillRect(Math.round(pos.x + 14), Math.round(pos.y - 22), 2, 2);
    }
  }

  function addImpactParticles(evt) {
    const pos = worldToScreen(evt.x, evt.y, evt.z || 0);
    const words = evt.type === 'headbutt' ? ['뻐억!', '꽝!', '머리!'] : evt.type === 'jumpkick' ? ['쫘악!', '날아가!', '퍽!!'] : evt.type === 'kick' ? ['퍽!', '찰싹!', '킥!'] : ['퍽!', '빡!', '악!'];
    particles.push({ kind: 'text', x: pos.x, y: pos.y - 25, vx: (Math.random() - .5) * 12, vy: -24, life: 0.65, max: .65, text: words[Math.floor(Math.random() * words.length)] });
    for (let i = 0; i < 8; i++) {
      particles.push({ kind: 'spark', x: pos.x, y: pos.y - 12, vx: (Math.random() - .5) * 80, vy: (Math.random() - .8) * 70, life: .35 + Math.random() * .25, max: .6 });
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 55 * dt;
      return p.life > 0;
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.kind === 'text') {
        ctx.font = '900 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff2ad';
        ctx.strokeStyle = '#3a1e16';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = Math.random() > .5 ? '#fff3a8' : '#f4b56c';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
      }
    });
    ctx.globalAlpha = 1;
  }

  function updateHud(players) {
    scoreBar.innerHTML = '';
    const sorted = [...players].sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
    sorted.forEach(p => {
      const pill = document.createElement('div');
      pill.className = 'score-pill';
      pill.textContent = `${C[p.character]?.name || p.name} ${p.kos}/${roomWinKos}`;
      if (p.id === myId) pill.style.borderColor = '#f3cf6e';
      scoreBar.append(pill);
    });
    const me = players.find(p => p.id === myId);
    if (me) {
      localName.textContent = me.name;
      localDamage.textContent = `${Math.round(me.damage)}%`;
    }
  }

  function drawFrame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    updateParticles(dt);

    ctx.save();
    if (shakes > 0.2) {
      ctx.translate((Math.random() - .5) * shakes, (Math.random() - .5) * shakes);
      shakes *= 0.84;
    }
    drawArena();

    const targets = [...snapshot.values()];
    const drawn = [];
    for (const t of targets) {
      const d = getDisplayPlayer(t.id, t);
      d.lastX = d.x; d.lastY = d.y;
      d.x += (t.x - d.x) * Math.min(1, dt * 15);
      d.y += (t.y - d.y) * Math.min(1, dt * 15);
      d.z += (t.z - d.z) * Math.min(1, dt * 18);
      Object.assign(d, { name: t.name, character: t.character, damage: t.damage, kos: t.kos, deaths: t.deaths, alive: t.alive, stunned: t.stunned, attack: t.attack, facingX: t.facingX, facingY: t.facingY, respawnAt: t.respawnAt });
      drawn.push(d);
    }
    drawn.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    drawn.forEach(p => drawPlayer(p, now));
    drawParticles();
    ctx.restore();

    if (gameRunning) requestAnimationFrame(drawFrame);
  }

  function startRendering() {
    if (gameRunning) return;
    gameRunning = true;
    lastFrame = performance.now();
    requestAnimationFrame(drawFrame);
  }

  function stopRendering() {
    gameRunning = false;
  }

  function sendInput() {
    socket.emit('input', input);
  }

  function doAction(type) {
    ensureAudio();
    socket.emit('action', { type });
  }

  function handleKeyDown(e) {
    if (gamePanel.classList.contains('hidden')) return;
    if (e.repeat && !keyMap[e.code]) return;
    if (keyMap[e.code]) {
      input[keyMap[e.code]] = true;
      sendInput();
      e.preventDefault();
      return;
    }
    if (['Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK', 'KeyL'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Space') doAction('jump');
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') doAction('dash');
    else if (e.code === 'KeyJ') doAction('punch');
    else if (e.code === 'KeyK') doAction('kick');
    else if (e.code === 'KeyL') doAction('headbutt');
  }

  function handleKeyUp(e) {
    if (!keyMap[e.code]) return;
    input[keyMap[e.code]] = false;
    sendInput();
    e.preventDefault();
  }

  $$('.character-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedCharacter = card.dataset.character;
      $$('.character-card').forEach(c => c.classList.toggle('selected', c === card));
      if (currentRoom && lobby?.status === 'lobby') socket.emit('change_character', { character: selectedCharacter });
    });
  });

  createRoomBtn.addEventListener('click', createRoom);
  joinRoomBtn.addEventListener('click', joinRoom);
  roomCodeInput.addEventListener('input', () => roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
  roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

  copyInviteBtn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(currentRoom || '')}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(lobbyMessage, '초대 링크를 복사했어요. 친구에게 보내면 됩니다.');
    } catch {
      setMessage(lobbyMessage, `이 주소를 친구에게 보내세요: ${url}`);
    }
  });

  addBotBtn.addEventListener('click', async () => {
    const res = await callbackPromise('add_bot', {});
    if (!res?.ok && res?.error) setMessage(lobbyMessage, res.error, true);
  });

  startGameBtn.addEventListener('click', async () => {
    startGameBtn.disabled = true;
    const res = await callbackPromise('start_game', {});
    startGameBtn.disabled = false;
    if (!res?.ok) setMessage(lobbyMessage, res?.error || '시작하지 못했어요.', true);
  });

  rematchButton.addEventListener('click', async () => {
    const res = await callbackPromise('start_game', {});
    if (!res?.ok) {
      const msg = resultPanel.querySelector('.message');
      if (msg) msg.textContent = res?.error || '다시 시작하지 못했어요.';
    }
  });

  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp, { passive: false });
  window.addEventListener('blur', () => {
    input.up = input.down = input.left = input.right = false;
    sendInput();
  });
  canvas.addEventListener('pointerdown', () => { ensureAudio(); canvas.focus(); });

  $$('#touchControls [data-touch]').forEach(btn => {
    const key = btn.dataset.touch;
    const set = value => {
      input[key] = value;
      btn.classList.toggle('active', value);
      sendInput();
    };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); set(true); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => btn.addEventListener(type, e => { e.preventDefault(); set(false); }));
  });

  $$('#touchControls [data-action]').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      doAction(btn.dataset.action);
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 100);
    });
  });

  socket.on('connect', () => {
    setMessage(homeMessage, '온라인 서버 연결됨');
  });

  socket.on('disconnect', () => {
    setMessage(homeMessage, '서버 연결이 끊겼어요. 잠시 후 다시 연결합니다.', true);
  });

  socket.on('lobby_state', state => {
    renderLobby(state);
    if (state.status === 'lobby' && !gamePanel.classList.contains('hidden') && !resultPanel.classList.contains('hidden')) {
      stopRendering();
      showOnly(lobbyPanel);
    }
  });

  socket.on('match_started', data => {
    roomWinKos = data?.winKos || 5;
    if (data?.arena) Object.assign(WORLD, data.arena);
    snapshot.clear();
    displayPlayers.clear();
    particles = [];
    showOnly(gamePanel);
    showBanner('싸워!!!', 1100);
    startRendering();
    canvas.focus();
  });

  socket.on('snapshot', data => {
    const arr = data?.players || [];
    snapshot = new Map(arr.map(p => [p.id, p]));
    updateHud(arr);
  });

  socket.on('hit_effect', evt => {
    addImpactParticles(evt);
    beep('hit');
    if (evt.victimId === myId || evt.attackerId === myId) shakes = Math.max(shakes, evt.type === 'jumpkick' ? 9 : evt.type === 'headbutt' ? 7 : 4);
  });

  socket.on('ko', evt => {
    beep('ko');
    const text = evt.scorerName ? `${evt.scorerName} → ${evt.victimName} 장외!` : `${evt.victimName} 혼자 날아감!`;
    showBanner(text, 1300);
    shakes = 12;
  });

  socket.on('match_over', data => {
    stopRendering();
    winnerText.textContent = `${data.winnerName} 승리!`;
    resultScores.innerHTML = '';
    const scores = [...(data.scores || [])].sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
    scores.forEach(s => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `<strong></strong><span></span>`;
      row.querySelector('strong').textContent = s.name;
      row.querySelector('span').textContent = `${s.kos} KO · ${s.deaths} 데스`;
      resultScores.append(row);
    });
    showOnly(resultPanel);
  });

  renderCharacterPreviews();

  const params = new URLSearchParams(location.search);
  const presetRoom = params.get('room');
  if (presetRoom) roomCodeInput.value = presetRoom.toUpperCase().slice(0, 4);
})();
