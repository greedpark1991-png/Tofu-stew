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
  const localItem = $('#localItem');
  const centerBanner = $('#centerBanner');
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const MAPS = {
    living: { name: '집안 거실', projection: 'flat', arena: { matX: 250, matY: 135, koX: 340, koY: 210 } },
    bathroom: { name: '화장실', projection: 'iso', arena: { matX: 315, matY: 180, koX: 430, koY: 275 } },
    walkway: { name: '아파트 산책로', projection: 'iso', arena: { matX: 365, matY: 160, koX: 485, koY: 250 } }
  };

  const C = {
    zzigae: {
      name: '찌개', kind: '말티푸', visualScale: 1.0,
      fur: '#9d6846', fur2: '#c78b61', light: '#e0b58d', dark: '#4a3026', outline: '#2a201d', collar: '#e3635f'
    },
    gamja: {
      name: '감자', kind: '2개월 토이푸들', visualScale: 0.92,
      fur: '#e9d3aa', fur2: '#f8ebcd', light: '#fff6dc', dark: '#80684a', outline: '#3d352d', collar: '#6aa3d7'
    },
    mandu: {
      name: '만두', kind: '푸들', visualScale: 1.0,
      fur: '#ececeb', fur2: '#ffffff', light: '#ffffff', dark: '#9aa0a7', outline: '#444a52', collar: '#77a9ce'
    },
    gucci: {
      name: '구찌', kind: '코숏', visualScale: 0.98,
      fur: '#f1efe6', fur2: '#d89254', light: '#fffdf5', dark: '#5b5048', outline: '#302b29', collar: '#d76d75', eye: '#9ac7db'
    }
  };

  const ATTACK_MS = { punch: 280, kick: 390, headbutt: 450, jumpkick: 450, hammer: 500 };
  const WORLD = { ...MAPS.living.arena };

  let selectedCharacter = 'zzigae';
  let myId = null;
  let currentRoom = null;
  let currentMapKey = 'living';
  let lobby = null;
  let snapshot = new Map();
  let currentItems = [];
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
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
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
    osc.type = type === 'ko' ? 'sawtooth' : type === 'item' ? 'triangle' : 'square';
    const start = type === 'ko' ? 150 : type === 'item' ? 390 : 110 + Math.random() * 55;
    const end = type === 'ko' ? 55 : type === 'item' ? 720 : 70;
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(end, now + (type === 'item' ? .12 : .08));
    gain.gain.setValueAtTime(type === 'ko' ? .09 : .055, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + (type === 'ko' ? .22 : type === 'item' ? .15 : .08));
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now); osc.stop(now + (type === 'ko' ? .23 : type === 'item' ? .16 : .09));
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


  function px(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function attackProgress(p, now) {
    if (!p.attack) return 0;
    const dur = ATTACK_MS[p.attack.type] || 350;
    return Math.max(0, Math.min(1, (now - p.attack.startedAt) / dur));
  }

  function animStep(time, speed = 120, frames = 4) {
    return Math.floor(time / speed) % frames;
  }

  function poseFor(state, progress, time) {
    const idleFrame = animStep(time, 150, 4);
    const walkFrame = animStep(time, 95, 4);
    const bob = [0, -1, 0, -1][idleFrame];
    const p = {
      bodyX: 0, bodyY: bob, headX: 0, headY: bob,
      frontArm: { x: 3, y: -11, w: 2, h: 4 },
      backArm: { x: -5, y: -11, w: 2, h: 4 },
      frontLeg: { x: 2, y: -5, w: 2, h: 5 },
      backLeg: { x: -3, y: -5, w: 2, h: 5 },
      bodyWobble: 0, crouch: 0, airborne: false, hammer: false, expression: 'normal'
    };

    if (state === 'walk') {
      const step = [-1, 0, 1, 0][walkFrame];
      p.bodyY = [-1, 0, -1, 0][walkFrame];
      p.headY = p.bodyY;
      p.frontArm.y += step > 0 ? 1 : 0;
      p.backArm.y += step < 0 ? 1 : 0;
      p.frontLeg.y += step < 0 ? 1 : 0;
      p.backLeg.y += step > 0 ? 1 : 0;
      p.frontArm.x += step;
      p.backArm.x -= step;
      p.frontLeg.x -= step;
      p.backLeg.x += step;
    } else if (state === 'jump') {
      p.airborne = true;
      p.bodyY = -4; p.headY = -5;
      p.frontArm = { x: 4, y: -13, w: 2, h: 3 };
      p.backArm = { x: -6, y: -13, w: 2, h: 3 };
      p.frontLeg = { x: 2, y: -7, w: 2, h: 3 };
      p.backLeg = { x: -3, y: -7, w: 2, h: 3 };
    } else if (state === 'punch') {
      if (progress < 0.25) {
        p.bodyX = -1; p.headX = -1;
        p.frontArm = { x: 2, y: -11, w: 2, h: 4 };
        p.backArm = { x: -5, y: -10, w: 2, h: 4 };
      } else if (progress < 0.55) {
        p.bodyX = 1; p.headX = 1;
        p.frontArm = { x: 5, y: -12, w: 4, h: 2 };
        p.backArm = { x: -5, y: -11, w: 2, h: 4 };
        p.frontLeg = { x: 3, y: -5, w: 2, h: 5 };
        p.backLeg = { x: -4, y: -5, w: 2, h: 5 };
        p.expression = 'strain';
      } else if (progress < 0.8) {
        p.bodyX = 2; p.headX = 1;
        p.frontArm = { x: 6, y: -12, w: 5, h: 2 };
        p.backArm = { x: -4, y: -11, w: 2, h: 4 };
        p.frontLeg = { x: 3, y: -5, w: 2, h: 5 };
        p.backLeg = { x: -4, y: -5, w: 2, h: 5 };
        p.expression = 'strain';
      } else {
        p.bodyX = 1;
        p.frontArm = { x: 4, y: -12, w: 3, h: 2 };
      }
    } else if (state === 'kick') {
      if (progress < 0.25) {
        p.bodyX = -1;
        p.frontLeg = { x: 3, y: -9, w: 2, h: 4 };
        p.backLeg = { x: -4, y: -5, w: 2, h: 5 };
        p.frontArm = { x: 3, y: -12, w: 2, h: 4 };
        p.backArm = { x: -5, y: -12, w: 2, h: 4 };
      } else if (progress < 0.62) {
        p.bodyX = -1; p.headX = -1;
        p.frontLeg = { x: 5, y: -9, w: 6, h: 2 };
        p.backLeg = { x: -4, y: -5, w: 2, h: 6 };
        p.frontArm = { x: 2, y: -13, w: 2, h: 4 };
        p.backArm = { x: -5, y: -13, w: 2, h: 4 };
        p.expression = 'strain';
      } else {
        p.bodyX = 0;
        p.frontLeg = { x: 4, y: -7, w: 4, h: 2 };
        p.backLeg = { x: -4, y: -5, w: 2, h: 5 };
      }
    } else if (state === 'headbutt') {
      if (progress < 0.33) {
        p.crouch = 1; p.bodyY = 1; p.headY = 1;
        p.frontArm = { x: 2, y: -9, w: 2, h: 3 };
        p.backArm = { x: -4, y: -9, w: 2, h: 3 };
      } else if (progress < 0.74) {
        p.bodyX = 3; p.headX = 5; p.headY = 0;
        p.frontArm = { x: 1, y: -8, w: 2, h: 3 };
        p.backArm = { x: -5, y: -8, w: 2, h: 3 };
        p.frontLeg = { x: 3, y: -5, w: 2, h: 5 };
        p.backLeg = { x: -4, y: -5, w: 2, h: 5 };
        p.expression = 'strain';
      } else {
        p.bodyX = 1; p.headX = 1;
      }
    } else if (state === 'jumpkick') {
      p.airborne = true;
      if (progress < 0.25) {
        p.bodyY = -3; p.headY = -4;
        p.frontArm = { x: 3, y: -13, w: 2, h: 3 };
        p.backArm = { x: -5, y: -13, w: 2, h: 3 };
        p.frontLeg = { x: 2, y: -8, w: 2, h: 3 };
        p.backLeg = { x: -3, y: -8, w: 2, h: 3 };
      } else if (progress < 0.72) {
        p.bodyX = 2; p.bodyY = -4; p.headY = -4;
        p.frontLeg = { x: 5, y: -9, w: 6, h: 2 };
        p.backLeg = { x: -5, y: -8, w: 2, h: 3 };
        p.frontArm = { x: 1, y: -13, w: 2, h: 3 };
        p.backArm = { x: -6, y: -13, w: 2, h: 3 };
        p.expression = 'strain';
      } else {
        p.bodyX = 1; p.bodyY = -2;
        p.frontLeg = { x: 4, y: -8, w: 4, h: 2 };
        p.backLeg = { x: -4, y: -7, w: 2, h: 3 };
      }
    } else if (state === 'hammer') {
      p.hammer = true;
      if (progress < 0.28) {
        p.frontArm = { x: 1, y: -15, w: 2, h: 5 };
        p.backArm = { x: -5, y: -13, w: 2, h: 4 };
      } else if (progress < 0.68) {
        p.bodyX = 2;
        p.frontArm = { x: 5, y: -10, w: 5, h: 2 };
        p.backArm = { x: -4, y: -12, w: 2, h: 4 };
        p.expression = 'strain';
      } else {
        p.frontArm = { x: 4, y: -11, w: 3, h: 2 };
      }
    } else if (state === 'hurt') {
      p.bodyX = -2; p.headX = -1;
      p.frontArm = { x: 4, y: -10, w: 2, h: 3 };
      p.backArm = { x: -6, y: -10, w: 2, h: 3 };
      p.frontLeg = { x: 3, y: -5, w: 2, h: 4 };
      p.backLeg = { x: -4, y: -5, w: 2, h: 4 };
      p.expression = 'hurt';
    }
    return p;
  }

  function drawHammer(g, x, y, s, progress) {
    const slam = progress > 0.28 ? Math.min(1, (progress - 0.28) / 0.36) : 0;
    const hx = x + 2 + slam * 4;
    const hy = y - 7 + slam * 4;
    px(g, hx, hy, 7 * s, 3 * s, '#2a2f37');
    px(g, hx + s, hy + s, 5 * s, 1 * s, '#8b929b');
    px(g, x, y - 1 * s, 2 * s, 8 * s, '#7c5334');
  }

  function drawSimpleAnimal(g, key, pose, s) {
    const ch = C[key];
    const bodyX = pose.bodyX;
    const bodyY = pose.bodyY + pose.crouch;
    const headX = pose.headX;
    const headY = pose.headY + pose.crouch;

    const r = (x, y, w, h, color) => px(g, x * s, y * s, w * s, h * s, color);
    const shadow = (x, y, w) => r(x, y, w, 1, 'rgba(25,22,19,.18)');
    const limb = (part, color) => r(part.x + bodyX, part.y + bodyY, part.w, part.h, color);

    shadow(-5, 1, 11);

    if (key === 'zzigae') r(-7 + bodyX, -9 + bodyY, 3, 2, ch.fur2);
    if (key === 'gamja') r(-6 + bodyX, -9 + bodyY, 2, 2, ch.fur2);
    if (key === 'mandu') { r(-7 + bodyX, -9 + bodyY, 2, 2, ch.fur2); r(-8 + bodyX, -10 + bodyY, 2, 2, ch.fur); }
    if (key === 'gucci') { r(-8 + bodyX, -11 + bodyY, 5, 1, ch.outline); r(-7 + bodyX, -10 + bodyY, 4, 1, ch.fur2); }

    limb(pose.backLeg, key === 'gucci' ? ch.fur : ch.fur);
    limb(pose.frontLeg, key === 'gucci' ? ch.fur2 || ch.fur : ch.fur2 || ch.fur);

    r(-5 + bodyX, -13 + bodyY, 10, 8, ch.outline);
    r(-4 + bodyX, -12 + bodyY, 8, 6, ch.fur);
    r(-2 + bodyX, -10 + bodyY, 4, 3, ch.light);
    if (key === 'gucci') {
      r(-4 + bodyX, -12 + bodyY, 4, 3, ch.fur2);
      r(2 + bodyX, -9 + bodyY, 2, 2, ch.fur2);
    }
    if (key === 'mandu') r(-5 + bodyX, -13 + bodyY, 2, 1, ch.fur2);
    r(-4 + bodyX, -14 + bodyY, 8, 1, ch.collar);

    limb(pose.backArm, ch.fur);
    limb(pose.frontArm, ch.fur2 || ch.fur);

    // head + ears
    if (key === 'zzigae') {
      r(-7 + headX, -22 + headY, 3, 6, ch.outline); r(4 + headX, -22 + headY, 3, 6, ch.outline);
      r(-6 + headX, -21 + headY, 2, 5, ch.fur); r(4 + headX, -21 + headY, 2, 5, ch.fur);
      r(-6 + headX, -20 + headY, 12, 8, ch.outline); r(-5 + headX, -19 + headY, 10, 7, ch.fur2);
      r(-2 + headX, -15 + headY, 4, 2, ch.light);
    } else if (key === 'gamja') {
      r(-6 + headX, -20 + headY, 2, 3, ch.fur); r(4 + headX, -20 + headY, 2, 3, ch.fur);
      r(-6 + headX, -20 + headY, 12, 7, ch.outline); r(-5 + headX, -19 + headY, 10, 6, ch.fur2);
      r(-2 + headX, -15 + headY, 4, 2, ch.light);
    } else if (key === 'mandu') {
      r(-7 + headX, -20 + headY, 3, 3, ch.fur); r(4 + headX, -20 + headY, 3, 3, ch.fur);
      r(-6 + headX, -20 + headY, 12, 7, ch.outline); r(-5 + headX, -19 + headY, 10, 6, ch.fur2);
      r(-2 + headX, -15 + headY, 4, 2, '#f3f2ef');
    } else {
      r(-5 + headX, -21 + headY, 3, 4, ch.outline); r(2 + headX, -21 + headY, 3, 4, ch.outline);
      r(-4 + headX, -20 + headY, 2, 3, ch.fur2); r(2 + headX, -20 + headY, 2, 3, ch.fur2);
      r(-6 + headX, -20 + headY, 12, 7, ch.outline); r(-5 + headX, -19 + headY, 10, 6, ch.fur);
      r(-5 + headX, -19 + headY, 4, 2, ch.fur2); r(2 + headX, -18 + headY, 3, 2, ch.fur2);
      r(-2 + headX, -15 + headY, 4, 2, ch.light);
    }

    // face
    if (pose.expression === 'hurt') {
      r(-3 + headX, -17 + headY, 2, 1, '#222'); r(1 + headX, -17 + headY, 2, 1, '#222');
      r(-1 + headX, -14 + headY, 2, 1, '#9d5a5a');
    } else {
      r(-3 + headX, -17 + headY, 1, 1, key === 'gucci' ? ch.eye : '#202020');
      r(2 + headX, -17 + headY, 1, 1, key === 'gucci' ? ch.eye : '#202020');
      r(-1 + headX, -15 + headY, 2, 1, '#2b2b2b');
      if (pose.expression === 'strain') r(-1 + headX, -14 + headY, 2, 1, '#6e3e38');
      else r(0 + headX, -14 + headY, 1, 1, key === 'gucci' ? '#d98382' : '#744d45');
    }

    if (pose.hammer) drawHammer(g, (pose.frontArm.x + pose.frontArm.w + bodyX) * s, (pose.frontArm.y + bodyY) * s, s, 0.45);
  }

  function drawSprite(g, charKey, x, y, opts = {}) {
    const ch = C[charKey] || C.zzigae;
    const s = Math.max(1, Math.round((opts.scale || 2) * 1.2));
    const facing = opts.facing || 1;
    const state = opts.state || 'idle';
    const t = opts.time || 0;
    const progress = opts.attackProgress || 0;
    const pose = poseFor(state, progress, t);

    g.save();
    g.translate(Math.round(x), Math.round(y));
    if (facing < 0) g.scale(-1, 1);
    drawSimpleAnimal(g, charKey, pose, s);
    g.restore();
  }

  function renderCharacterPreviews() {
    $$('.character-card').forEach(card => {
      const c = card.querySelector('canvas');
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, c.width, c.height);
      const grd = g.createLinearGradient(0,0,0,c.height);
      grd.addColorStop(0,'#1d2939'); grd.addColorStop(1,'#11161e');
      g.fillStyle = grd; g.fillRect(0,0,c.width,c.height);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(12,80,72,4);
      drawSprite(g, card.dataset.character, 48, 82, { scale: 1.55, facing: 1, state: 'idle', time: 0 });
    });
  }

  function renderMini(canvasEl, charKey) {
    const g = canvasEl.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0,0,canvasEl.width,canvasEl.height);
    g.fillStyle = '#101620'; g.fillRect(0,0,canvasEl.width,canvasEl.height);
    drawSprite(g, charKey, 26, 46, { scale: .84, facing: 1, state: 'idle', time: 0 });
  }

  function normalizedName() { return nickname.value.trim().slice(0,12) || '동물'; }
  function callbackPromise(event, payload) { return new Promise(resolve => socket.emit(event, payload, resolve)); }

  async function createRoom() {
    ensureAudio(); createRoomBtn.disabled = true; setMessage(homeMessage, '방 만드는 중...');
    const res = await callbackPromise('create_room', { name: normalizedName(), character: selectedCharacter });
    createRoomBtn.disabled = false;
    if (!res?.ok) return setMessage(homeMessage, res?.error || '방을 만들지 못했어요.', true);
    myId = res.playerId; currentRoom = res.code;
    history.replaceState(null,'',`${location.pathname}?room=${encodeURIComponent(currentRoom)}`);
    showOnly(lobbyPanel);
  }

  async function joinRoom() {
    ensureAudio();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) return setMessage(homeMessage,'4자리 방 코드를 입력해 주세요.',true);
    joinRoomBtn.disabled = true; setMessage(homeMessage,'입장 중...');
    const res = await callbackPromise('join_room', { code, name: normalizedName(), character: selectedCharacter });
    joinRoomBtn.disabled = false;
    if (!res?.ok) return setMessage(homeMessage,res?.error || '방에 들어가지 못했어요.',true);
    myId = res.playerId; currentRoom = res.code;
    history.replaceState(null,'',`${location.pathname}?room=${encodeURIComponent(currentRoom)}`);
    showOnly(lobbyPanel);
  }

  function renderLobby(state) {
    lobby = state; currentRoom = state.code; currentMapKey = state.mapKey || 'living';
    lobbyCode.textContent = state.code; isHost = state.hostId === myId; playerList.innerHTML = '';

    $$('.map-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.map === currentMapKey);
      card.disabled = !isHost;
    });

    state.players.forEach(p => {
      const row = document.createElement('div'); row.className = 'player-row';
      const mini = document.createElement('canvas'); mini.width = 52; mini.height = 52;
      const meta = document.createElement('div'); meta.className = 'player-meta';
      const strong = document.createElement('strong'); strong.textContent = p.name;
      const sub = document.createElement('span'); sub.textContent = `${C[p.character]?.name || p.character}${p.isBot ? ' · BOT' : ''}`;
      meta.append(strong,sub);
      const badge = document.createElement('span'); badge.className='host-badge'; badge.textContent = p.isHost ? '방장' : '';
      row.append(mini,meta,badge);
      if (isHost && p.isBot) {
        const remove = document.createElement('button'); remove.className='remove-bot'; remove.type='button'; remove.textContent='빼기';
        remove.addEventListener('click',()=>socket.emit('remove_bot',{id:p.id})); row.append(remove);
      } else row.append(document.createElement('span'));
      playerList.append(row); renderMini(mini,p.character);
    });

    addBotBtn.style.display = isHost ? '' : 'none';
    startGameBtn.style.display = isHost ? '' : 'none';
    rematchButton.style.display = isHost ? '' : 'none';
    setMessage(lobbyMessage, isHost ? `${MAPS[currentMapKey].name} 선택됨 · 친구를 기다리거나 봇을 넣고 바로 테스트할 수 있어요.` : `방장이 ${MAPS[currentMapKey].name} 맵을 선택했어요.`);
  }

  function mapProjection() { return MAPS[currentMapKey]?.projection || 'iso'; }
  function worldToScreen(x,y,z=0) {
    if (mapProjection() === 'flat') return { x: 384 + x, y: 245 + y - z*.72 };
    return { x: 384 + (x-y)*.62, y: 220 + (x+y)*.32 - z*.70 };
  }
  function matCorners(xr,yr){return [worldToScreen(-xr,-yr),worldToScreen(xr,-yr),worldToScreen(xr,yr),worldToScreen(-xr,yr)];}
  function poly(points,fill,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}


  function drawLivingRoom() {
    ctx.fillStyle = '#edd6ac'; ctx.fillRect(0, 0, 768, 176);
    for (let x = 0; x < 768; x += 52) {
      ctx.fillStyle = (x / 52) % 2 ? '#e6cd9f' : '#f0dcba';
      ctx.fillRect(x, 0, 52, 176);
    }
    ctx.fillStyle = '#8d5e3f'; ctx.fillRect(0, 166, 768, 10);
    ctx.fillStyle = '#d4a06f'; ctx.fillRect(0, 176, 768, 304);
    for (let y = 176; y < 480; y += 34) {
      ctx.fillStyle = '#c78f60'; ctx.fillRect(0, y, 768, 2);
    }
    for (let x = 0; x < 768; x += 60) {
      ctx.fillStyle = '#c38756'; ctx.fillRect(x, 176, 2, 304);
    }

    // central battle rug
    ctx.fillStyle = '#815239'; ctx.fillRect(174, 196, 420, 238);
    ctx.fillStyle = '#d39b68'; ctx.fillRect(184, 206, 400, 218);
    ctx.fillStyle = '#e4b47d'; ctx.fillRect(204, 224, 360, 182);
    for (let x = 210; x < 556; x += 54) {
      for (let y = 232; y < 394; y += 46) {
        ctx.fillStyle = (x + y) % 108 ? '#d2a06c' : '#c99361';
        ctx.fillRect(x, y, 14, 8);
      }
    }

    // furniture blocks kept simple and readable
    ctx.fillStyle = '#593528'; ctx.fillRect(22, 208, 146, 100);
    ctx.fillStyle = '#b55f49'; ctx.fillRect(30, 200, 130, 92);
    ctx.fillStyle = '#ce7d5e'; ctx.fillRect(42, 214, 104, 56);
    ctx.fillStyle = '#f0d7a4'; ctx.fillRect(50, 222, 30, 24); ctx.fillRect(108, 222, 28, 24);

    ctx.fillStyle = '#65412f'; ctx.fillRect(108, 270, 124, 26);
    ctx.fillStyle = '#a7774f'; ctx.fillRect(116, 282, 108, 48);
    ctx.fillStyle = '#e6c58a'; ctx.fillRect(164, 254, 16, 18);

    ctx.fillStyle = '#5a392b'; ctx.fillRect(84, 68, 144, 118);
    ctx.fillStyle = '#8f5d40'; ctx.fillRect(92, 76, 128, 102);
    for (let y = 94; y < 168; y += 24) { ctx.fillStyle = '#5a392b'; ctx.fillRect(98, y, 118, 4); }
    const books = ['#7a9d7b', '#b85f4a', '#e1b15c', '#6789b0', '#8d6a97'];
    for (let i = 0; i < 16; i++) { ctx.fillStyle = books[i % books.length]; ctx.fillRect(102 + (i % 8) * 14, 82 + Math.floor(i / 8) * 46, 8, 18 + (i % 2) * 4); }
    ctx.fillStyle = '#6e4d38'; ctx.fillRect(236, 118, 30, 30); ctx.fillStyle = '#5b985d'; ctx.fillRect(230, 90, 42, 28);

    ctx.fillStyle = '#6a4634'; ctx.fillRect(292, 96, 184, 20);
    ctx.fillStyle = '#5a392a'; ctx.fillRect(314, 116, 140, 66);
    ctx.fillStyle = '#b27a50'; ctx.fillRect(324, 128, 120, 52);
    ctx.fillStyle = '#40302a'; ctx.fillRect(350, 144, 68, 34);
    ctx.fillStyle = '#e49a47'; ctx.fillRect(372, 152, 24, 22); ctx.fillStyle = '#ffd772'; ctx.fillRect(380, 144, 8, 28);

    ctx.fillStyle = '#5a3d2f'; ctx.fillRect(538, 200, 176, 94);
    ctx.fillStyle = '#876149'; ctx.fillRect(548, 222, 156, 62);
    ctx.fillStyle = '#44485a'; ctx.fillRect(578, 142, 110, 78);
    ctx.fillStyle = '#7db3bd'; ctx.fillRect(588, 152, 90, 56);
    ctx.fillStyle = '#b7d78e'; ctx.fillRect(606, 180, 54, 18);

    ctx.fillStyle = '#724d3b'; ctx.fillRect(650, 304, 92, 120);
    ctx.fillStyle = '#bd7657'; ctx.fillRect(660, 294, 72, 112);
    ctx.fillStyle = '#d99769'; ctx.fillRect(668, 308, 56, 68);

    ctx.fillStyle = 'rgba(255,247,220,.14)'; ctx.fillRect(184, 206, 400, 218);
  }

  function drawBathroom() {
    ctx.fillStyle='#c9dada';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#9eb4b6';ctx.lineWidth=2;
    for(let x=0;x<canvas.width;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<canvas.height;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    const outer=matCorners(WORLD.matX+13,WORLD.matY+13);poly(outer,'#719aa0','#40676e',4);
    const mat=matCorners(WORLD.matX,WORLD.matY);poly(mat,'#9cc7c9','#5c8b8f',2);
    // bath tub and toilet silhouettes
    ctx.fillStyle='#eef5f5';ctx.strokeStyle='#7e9a9e';ctx.lineWidth=3;ctx.fillRect(36,50,190,62);ctx.strokeRect(36,50,190,62);ctx.fillStyle='#8cc6d1';ctx.fillRect(53,65,155,25);
    ctx.fillStyle='#edf2f2';ctx.fillRect(618,70,68,48);ctx.fillRect(630,112,45,34);ctx.strokeStyle='#869a9d';ctx.strokeRect(618,70,68,48);
    // puddles
    ctx.fillStyle='rgba(94,165,182,.35)';ctx.fillRect(90,345,80,14);ctx.fillRect(525,370,105,11);ctx.fillRect(550,360,55,9);
    ctx.fillStyle='#f2a5ae';ctx.fillRect(706,292,12,32);ctx.fillStyle='#7db2c7';ctx.fillRect(722,302,10,22);
  }

  function drawWalkway() {
    ctx.fillStyle='#486742';ctx.fillRect(0,0,canvas.width,canvas.height);
    const path=matCorners(WORLD.matX+40,WORLD.matY+32);poly(path,'#70757a','#4f5458',3);
    const arena=matCorners(WORLD.matX,WORLD.matY);poly(arena,'#7d8185','rgba(235,235,220,.72)',2);
    // center tactile blocks
    ctx.save();ctx.globalAlpha=.9;
    for(let x=-300;x<310;x+=34){const p=worldToScreen(x,0);ctx.fillStyle='#d3bb54';ctx.fillRect(Math.round(p.x-7),Math.round(p.y-3),14,6);}
    ctx.restore();
    // grass texture
    ctx.fillStyle='rgba(39,82,45,.55)';for(let i=0;i<70;i++){const x=(i*83)%canvas.width,y=(i*47)%canvas.height;if(x>140&&x<635&&y>90&&y<405)continue;ctx.fillRect(x,y,3,7);}
    // bench + lamp
    ctx.fillStyle='#634a35';ctx.fillRect(42,115,115,18);ctx.fillRect(55,133,9,28);ctx.fillRect(138,133,9,28);
    ctx.fillStyle='#32383e';ctx.fillRect(695,62,7,98);ctx.fillStyle='#f2d58c';ctx.fillRect(685,55,27,16);
    // little shrub planters
    ctx.fillStyle='#3e5038';ctx.fillRect(610,356,90,28);ctx.fillStyle='#567b48';ctx.fillRect(620,340,18,22);ctx.fillRect(646,335,22,27);ctx.fillRect(676,344,15,18);
  }

  function drawArena() {
    if(currentMapKey==='bathroom') drawBathroom();
    else if(currentMapKey==='walkway') drawWalkway();
    else drawLivingRoom();
  }

  function drawItem(item, now) {
    const ground=worldToScreen(item.x,item.y,0); const pos=worldToScreen(item.x,item.y,item.z||0);
    const air=Math.min(1,(item.z||0)/180);
    ctx.fillStyle=`rgba(15,14,13,${.26-air*.12})`;ctx.fillRect(Math.round(ground.x-11),Math.round(ground.y+5),22,5);
    const bob=item.z<=1?Math.sin(now*.006+item.x)*2:0;
    ctx.save();ctx.translate(Math.round(pos.x),Math.round(pos.y+bob));
    if(item.type==='hammer'){
      ctx.rotate(item.z>1?now*.004:0);
      px(ctx,-2,-16,4,26,'#7c5334');px(ctx,-13,-19,26,9,'#30343a');px(ctx,-10,-17,20,5,'#838a92');px(ctx,9,-16,6,4,'#c2c8ce');
    } else if(item.type==='heal'){
      px(ctx,-10,-9,15,14,'#c85b4d');px(ctx,-8,-7,12,10,'#e97a61');px(ctx,4,-4,12,5,'#efe3c8');px(ctx,12,-6,5,9,'#f8f0dc');px(ctx,8,-1,8,4,'#f8f0dc');
    } else {
      ctx.fillStyle='#f3cf53';
      const pts=[[0,-14],[4,-5],[14,-5],[7,2],[10,12],[0,7],[-10,12],[-7,2],[-14,-5],[-4,-5]];
      ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();
      ctx.fillStyle='#fff2a4';ctx.fillRect(-2,-9,4,9);
    }
    ctx.restore();
    if(item.z>40){ctx.save();ctx.globalAlpha=.35;ctx.strokeStyle='#fff';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(pos.x,pos.y+22);ctx.lineTo(ground.x,ground.y-2);ctx.stroke();ctx.restore();}
  }

  function getDisplayPlayer(id,target){let d=displayPlayers.get(id);if(!d){d={...target,x:target.x,y:target.y,z:target.z,lastX:target.x,lastY:target.y};displayPlayers.set(id,d);}return d;}
  function attackState(p){if(p.stunned)return'hurt';if(!p.attack){if((p.z||0)>8)return'jump';const moving=Math.hypot((p.x??0)-(p.lastX??p.x??0),(p.y??0)-(p.lastY??p.y??0))>.22;return moving?'walk':'idle';}return p.attack.type;}

  function drawPlayer(p,now){
    if(!p.alive)return;
    const pos=worldToScreen(p.x,p.y,p.z),ground=worldToScreen(p.x,p.y,0);
    const screenFacing=mapProjection()==='flat'?(p.facingX>=0?1:-1):((p.facingX-p.facingY)>=0?1:-1);
    const ch=C[p.character]||C.zzigae;
    const shadowW=26*ch.visualScale;
    ctx.fillStyle=`rgba(18,16,14,${.30-Math.min(p.z,130)/720})`;ctx.fillRect(Math.round(ground.x-shadowW/2),Math.round(ground.y+9),Math.round(shadowW),5);
    const state=attackState(p);const ap=attackProgress(p,now);
    drawSprite(ctx,p.character,pos.x,pos.y+4,{scale:2.12,facing:screenFacing,state,time:now,attackProgress:ap});

    if(p.starShield){
      const r=31*ch.visualScale;ctx.save();ctx.globalAlpha=.55+.2*Math.sin(now*.012);ctx.strokeStyle='#ffe46c';ctx.lineWidth=3;ctx.strokeRect(Math.round(pos.x-r),Math.round(pos.y-r-22),Math.round(r*2),Math.round(r*2));ctx.restore();
      ctx.fillStyle='#fff0a0';for(let i=0;i<4;i++){const a=now*.004+i*Math.PI/2;ctx.fillRect(Math.round(pos.x+Math.cos(a)*r)-2,Math.round(pos.y-14+Math.sin(a)*r)-2,4,4);}
    }
    if(p.hammerHits>0 && state!=='hammer'){
      ctx.fillStyle='#f8d77d';ctx.font='900 10px sans-serif';ctx.textAlign='center';ctx.fillText(`🔨×${p.hammerHits}`,Math.round(pos.x),Math.round(pos.y-62*ch.visualScale));
    }
    const labelY=pos.y-55*ch.visualScale;
    ctx.textAlign='center';ctx.font='bold 10px sans-serif';ctx.fillStyle=p.id===myId?'#ffe078':'#ffffff';ctx.fillText(p.name,Math.round(pos.x),Math.round(labelY));
    ctx.font='bold 9px sans-serif';ctx.fillStyle=p.damage<70?'#ecf3e9':p.damage<130?'#ffd36c':'#ff7777';ctx.fillText(`${Math.round(p.damage)}%`,Math.round(pos.x),Math.round(labelY+11));
  }

  function addImpactParticles(evt){
    const pos=worldToScreen(evt.x,evt.y,evt.z||0);
    const words=evt.type==='hammer'?['쾅!!!','망치맛!','뿌각!']:evt.type==='headbutt'?['뻐억!','꽝!','머리!']:evt.type==='jumpkick'?['쫘악!','날아가!','퍽!!']:evt.type==='kick'?['퍽!','찰싹!','킥!']:['퍽!','빡!','악!'];
    particles.push({kind:'text',x:pos.x,y:pos.y-28,vx:(Math.random()-.5)*12,vy:-26,life:.7,max:.7,text:words[Math.floor(Math.random()*words.length)]});
    for(let i=0;i<(evt.type==='hammer'?15:9);i++)particles.push({kind:'spark',x:pos.x,y:pos.y-12,vx:(Math.random()-.5)*100,vy:(Math.random()-.85)*85,life:.35+Math.random()*.28,max:.65});
  }
  function updateParticles(dt){particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=58*dt;return p.life>0;});}
  function drawParticles(){particles.forEach(p=>{const a=Math.max(0,p.life/p.max);ctx.globalAlpha=a;if(p.kind==='text'){ctx.font='900 16px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff3a7';ctx.strokeStyle='#3b1f17';ctx.lineWidth=3;ctx.strokeText(p.text,p.x,p.y);ctx.fillText(p.text,p.x,p.y);}else{ctx.fillStyle=Math.random()>.5?'#fff3a8':'#f3a35d';ctx.fillRect(Math.round(p.x),Math.round(p.y),3,3);}});ctx.globalAlpha=1;}

  function updateHud(players){
    scoreBar.innerHTML='';const sorted=[...players].sort((a,b)=>b.kos-a.kos||a.deaths-b.deaths);
    sorted.forEach(p=>{const pill=document.createElement('div');pill.className='score-pill';pill.textContent=`${C[p.character]?.name||p.name} ${p.kos}/${roomWinKos}`;if(p.id===myId)pill.style.borderColor='#f3cf6e';scoreBar.append(pill);});
    const me=players.find(p=>p.id===myId);if(me){localName.textContent=me.name;localDamage.textContent=`${Math.round(me.damage)}%`;localItem.textContent=me.hammerHits>0?`망치 ${me.hammerHits}번`:me.starShield?'무적!':'';}
  }

  function drawFrame(now){
    const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;updateParticles(dt);
    ctx.save();if(shakes>.2){ctx.translate((Math.random()-.5)*shakes,(Math.random()-.5)*shakes);shakes*=.84;}
    drawArena();
    const depthOf=v=>mapProjection()==='flat'?(v.y||0):((v.x||0)+(v.y||0)); currentItems.slice().sort((a,b)=>depthOf(a)-depthOf(b)).forEach(item=>drawItem(item,now));
    const targets=[...snapshot.values()],drawn=[];
    for(const t of targets){const d=getDisplayPlayer(t.id,t);d.lastX=d.x;d.lastY=d.y;d.x+=(t.x-d.x)*Math.min(1,dt*16);d.y+=(t.y-d.y)*Math.min(1,dt*16);d.z+=(t.z-d.z)*Math.min(1,dt*18);Object.assign(d,{name:t.name,character:t.character,damage:t.damage,kos:t.kos,deaths:t.deaths,alive:t.alive,stunned:t.stunned,attack:t.attack,facingX:t.facingX,facingY:t.facingY,respawnAt:t.respawnAt,hammerHits:t.hammerHits,starShield:t.starShield});drawn.push(d);}
    drawn.sort((a,b)=>depthOf(a)-depthOf(b));drawn.forEach(p=>drawPlayer(p,now));drawParticles();ctx.restore();
    if(gameRunning)requestAnimationFrame(drawFrame);
  }
  function startRendering(){if(gameRunning)return;gameRunning=true;lastFrame=performance.now();requestAnimationFrame(drawFrame);}
  function stopRendering(){gameRunning=false;}
  function sendInput(){socket.emit('input',input);}
  function doAction(type){ensureAudio();socket.emit('action',{type});}

  function handleKeyDown(e){
    if(gamePanel.classList.contains('hidden'))return;
    if(e.repeat&&!keyMap[e.code])return;
    if(keyMap[e.code]){input[keyMap[e.code]]=true;sendInput();e.preventDefault();return;}
    if(['Space','ShiftLeft','ShiftRight','KeyJ','KeyK','KeyL'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='Space')doAction('jump');else if(e.code==='ShiftLeft'||e.code==='ShiftRight')doAction('dash');else if(e.code==='KeyJ')doAction('punch');else if(e.code==='KeyK')doAction('kick');else if(e.code==='KeyL')doAction('headbutt');
  }
  function handleKeyUp(e){if(!keyMap[e.code])return;input[keyMap[e.code]]=false;sendInput();e.preventDefault();}

  $$('.character-card').forEach(card=>card.addEventListener('click',()=>{selectedCharacter=card.dataset.character;$$('.character-card').forEach(c=>c.classList.toggle('selected',c===card));if(currentRoom&&lobby?.status==='lobby')socket.emit('change_character',{character:selectedCharacter});}));
  $$('.map-card').forEach(card=>card.addEventListener('click',async()=>{if(!isHost)return;const res=await callbackPromise('change_map',{mapKey:card.dataset.map});if(!res?.ok)setMessage(lobbyMessage,res?.error||'맵을 바꾸지 못했어요.',true);}));

  createRoomBtn.addEventListener('click',createRoom);joinRoomBtn.addEventListener('click',joinRoom);
  roomCodeInput.addEventListener('input',()=>roomCodeInput.value=roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4));
  roomCodeInput.addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
  copyInviteBtn.addEventListener('click',async()=>{const url=`${location.origin}${location.pathname}?room=${encodeURIComponent(currentRoom||'')}`;try{await navigator.clipboard.writeText(url);setMessage(lobbyMessage,'초대 링크를 복사했어요. 친구에게 보내면 됩니다.');}catch{setMessage(lobbyMessage,`이 주소를 친구에게 보내세요: ${url}`);}});
  addBotBtn.addEventListener('click',async()=>{const res=await callbackPromise('add_bot',{});if(!res?.ok&&res?.error)setMessage(lobbyMessage,res.error,true);});
  startGameBtn.addEventListener('click',async()=>{startGameBtn.disabled=true;const res=await callbackPromise('start_game',{});startGameBtn.disabled=false;if(!res?.ok)setMessage(lobbyMessage,res?.error||'시작하지 못했어요.',true);});
  rematchButton.addEventListener('click',async()=>{const res=await callbackPromise('start_game',{});if(!res?.ok){const msg=resultPanel.querySelector('.message');if(msg)msg.textContent=res?.error||'다시 시작하지 못했어요.';}});

  window.addEventListener('keydown',handleKeyDown,{passive:false});window.addEventListener('keyup',handleKeyUp,{passive:false});window.addEventListener('blur',()=>{input.up=input.down=input.left=input.right=false;sendInput();});
  canvas.addEventListener('pointerdown',()=>{ensureAudio();canvas.focus();});
  $$('#touchControls [data-touch]').forEach(btn=>{const key=btn.dataset.touch;const set=value=>{input[key]=value;btn.classList.toggle('active',value);sendInput();};btn.addEventListener('pointerdown',e=>{e.preventDefault();set(true);});['pointerup','pointercancel','pointerleave'].forEach(type=>btn.addEventListener(type,e=>{e.preventDefault();set(false);}));});
  $$('#touchControls [data-action]').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault();doAction(btn.dataset.action);btn.classList.add('active');setTimeout(()=>btn.classList.remove('active'),100);}));

  socket.on('connect',()=>setMessage(homeMessage,'온라인 서버 연결됨 · v6 · 원래 캐릭터 + 자연스러운 격투 모션'));
  socket.on('disconnect',()=>setMessage(homeMessage,'서버 연결이 끊겼어요. 잠시 후 다시 연결합니다.',true));
  socket.on('lobby_state',state=>{renderLobby(state);if(state.status==='lobby'&&!gamePanel.classList.contains('hidden')&&!resultPanel.classList.contains('hidden')){stopRendering();showOnly(lobbyPanel);}});
  socket.on('match_started',data=>{roomWinKos=data?.winKos||5;currentMapKey=data?.mapKey||'living';if(data?.map?.arena)Object.assign(WORLD,data.map.arena);snapshot.clear();currentItems=[];displayPlayers.clear();particles=[];showOnly(gamePanel);showBanner(`${MAPS[currentMapKey]?.name||'장판'} · 싸워!!!`,1300);startRendering();canvas.focus();});
  socket.on('snapshot',data=>{const arr=data?.players||[];snapshot=new Map(arr.map(p=>[p.id,p]));currentItems=data?.items||[];if(data?.mapKey)currentMapKey=data.mapKey;updateHud(arr);});
  socket.on('hit_effect',evt=>{addImpactParticles(evt);beep('hit');if(evt.victimId===myId||evt.attackerId===myId)shakes=Math.max(shakes,evt.type==='hammer'?12:evt.type==='jumpkick'?9:evt.type==='headbutt'?7:4);});
  socket.on('item_drop',evt=>{const name=evt.type==='hammer'?'망치':evt.type==='heal'?'고기':'무적별';showBanner(`하늘에서 ${name} 떨어진다!`,850);});
  socket.on('item_pickup',evt=>{beep('item');const name=evt.type==='hammer'?'망치 획득! 3번 휘두르기':evt.type==='heal'?'고기 먹고 피해 회복!':'6초 무적!';showBanner(`${evt.playerName} · ${name}`,1000);});
  socket.on('ko',evt=>{beep('ko');showBanner(evt.scorerName?`${evt.scorerName} → ${evt.victimName} 장외!`:`${evt.victimName} 혼자 날아감!`,1300);shakes=12;});
  socket.on('match_over',data=>{stopRendering();winnerText.textContent=`${data.winnerName} 승리!`;resultScores.innerHTML='';[...(data.scores||[])].sort((a,b)=>b.kos-a.kos||a.deaths-b.deaths).forEach(s=>{const row=document.createElement('div');row.className='result-row';row.innerHTML='<strong></strong><span></span>';row.querySelector('strong').textContent=s.name;row.querySelector('span').textContent=`${s.kos} KO · ${s.deaths} 데스`;resultScores.append(row);});showOnly(resultPanel);});

  renderCharacterPreviews();
  const params=new URLSearchParams(location.search),presetRoom=params.get('room');if(presetRoom)roomCodeInput.value=presetRoom.toUpperCase().slice(0,4);
})();
