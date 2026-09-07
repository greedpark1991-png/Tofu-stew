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
    living: { name: '집안 거실', projection: 'flat', arena: { matX: 330, matY: 185, koX: 470, koY: 310 } },
    bathroom: { name: '화장실', projection: 'iso', arena: { matX: 315, matY: 180, koX: 430, koY: 275 } },
    walkway: { name: '아파트 산책로', projection: 'iso', arena: { matX: 365, matY: 160, koX: 485, koY: 250 } }
  };

  const C = {
    zzigae: {
      name: '찌개', kind: '말티푸', visualScale: 1.04,
      fur: '#9d6846', fur2: '#c78b61', light: '#e0b58d', dark: '#4a3026', outline: '#2a201d', collar: '#e3635f'
    },
    gamja: {
      name: '감자', kind: '2개월 토이푸들', visualScale: 0.72,
      fur: '#e9d3aa', fur2: '#f8ebcd', light: '#fff6dc', dark: '#80684a', outline: '#3d352d', collar: '#6aa3d7'
    },
    mandu: {
      name: '만두', kind: '푸들', visualScale: 1.02,
      fur: '#ececeb', fur2: '#ffffff', light: '#ffffff', dark: '#9aa0a7', outline: '#444a52', collar: '#77a9ce'
    },
    gucci: {
      name: '구찌', kind: '코숏', visualScale: 0.96,
      fur: '#f1efe6', fur2: '#d89254', light: '#fffdf5', dark: '#5b5048', outline: '#302b29', collar: '#d76d75', eye: '#9ac7db'
    }
  };

  const ATTACK_MS = { punch: 260, kick: 370, headbutt: 440, jumpkick: 440, hammer: 500 };
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

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  const ZZIGAE_SPRITES = {
    front_idle: [loadImage('/assets/zzigae/front_idle_01.png')],
    side_idle: [loadImage('/assets/zzigae/side_idle_01.png')],
    idle: [1,2,3,4].map(i => loadImage(`/assets/zzigae/idle_${String(i).padStart(2,'0')}.png`)),
    walk: [1,2,3,4].map(i => loadImage(`/assets/zzigae/walk_${String(i).padStart(2,'0')}.png`)),
    punch: [1,2,3,4].map(i => loadImage(`/assets/zzigae/punch_${String(i).padStart(2,'0')}.png`)),
    kick: [1,2,3,4].map(i => loadImage(`/assets/zzigae/kick_${String(i).padStart(2,'0')}.png`)),
    jump: [1,2,3].map(i => loadImage(`/assets/zzigae/jump_${String(i).padStart(2,'0')}.png`)),
    hurt: [1,2,3].map(i => loadImage(`/assets/zzigae/hurt_${String(i).padStart(2,'0')}.png`)),
    down_getup: [1,2,3,4].map(i => loadImage(`/assets/zzigae/down_getup_${String(i).padStart(2,'0')}.png`))
  };
  const LIVING_BG = loadImage('/assets/living_room_bg.jpg');

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

  function cluster(g, x, y, color, variant = 0) {
    px(g, x + 1, y, 4, 2, color);
    px(g, x, y + 1, 6, 3, color);
    px(g, x + (variant % 2), y + 3, 5, 2, color);
  }

  function attackProgress(p, now) {
    if (!p.attack) return 0;
    const dur = ATTACK_MS[p.attack.type] || 350;
    return Math.max(0, Math.min(1, (now - p.attack.startedAt) / dur));
  }

  function pulse(t, a, b) {
    if (t <= a) return t / Math.max(.001, a);
    if (t >= b) return Math.max(0, (1 - t) / Math.max(.001, 1 - b));
    return 1;
  }

  function poseFor(state, progress, walkPhase) {
    const p = {
      bodyX: 0, bodyY: 0, headX: 0, headY: 0,
      armFrontX: 8, armFrontY: -19, armFrontW: 5, armFrontH: 10,
      armBackX: -12, armBackY: -18, armBackW: 5, armBackH: 9,
      legFrontX: 7, legFrontY: -8, legFrontW: 6, legFrontH: 10,
      legBackX: -9, legBackY: -8, legBackW: 6, legBackH: 10,
      hammer: false, crouch: 0
    };

    if (state === 'walk') {
      const s = Math.sin(walkPhase);
      p.bodyY = Math.abs(s) * -1;
      p.armFrontX += s * 2; p.armBackX -= s * 2;
      p.legFrontX -= s * 3; p.legBackX += s * 3;
      p.headY = -Math.abs(s) * .6;
    } else if (state === 'punch') {
      const hit = pulse(progress, .22, .58);
      p.bodyX = hit * 2; p.headX = hit * 1.5;
      p.armFrontX = 8 + hit * 14; p.armFrontY = -20 + hit * 1;
      p.armFrontW = 6 + hit * 8; p.armFrontH = 6;
      p.legBackX -= hit * 2;
    } else if (state === 'kick') {
      const hit = pulse(progress, .3, .66);
      p.bodyX = -hit * 2; p.headX = -hit * 1.3;
      p.armFrontX = 5; p.armBackX = -11;
      p.legFrontX = 7 + hit * 15; p.legFrontY = -8 - hit * 8;
      p.legFrontW = 7 + hit * 10; p.legFrontH = 6;
      p.legBackX -= hit * 2;
    } else if (state === 'headbutt') {
      const hit = pulse(progress, .28, .7);
      p.bodyX = hit * 8; p.headX = hit * 12; p.headY = hit * 2;
      p.armFrontX = 4; p.armFrontY = -17; p.armFrontH = 7;
      p.armBackX = -9; p.armBackY = -16; p.armBackH = 7;
      p.crouch = hit * 2;
    } else if (state === 'jumpkick') {
      const hit = pulse(progress, .18, .72);
      p.bodyX = hit * 3; p.bodyY = -hit * 3; p.headX = -hit;
      p.legFrontX = 8 + hit * 17; p.legFrontY = -10 - hit * 8;
      p.legFrontW = 8 + hit * 10; p.legFrontH = 6;
      p.legBackX = -7; p.legBackY = -11 - hit * 4; p.legBackH = 7;
      p.armFrontX = 5; p.armFrontY = -23; p.armBackX = -11; p.armBackY = -21;
    } else if (state === 'hammer') {
      const raise = Math.min(1, progress / .28);
      const swing = progress < .28 ? 0 : Math.min(1, (progress - .28) / .28);
      p.hammer = true;
      p.bodyX = swing * 2;
      p.armFrontX = 4 + swing * 12;
      p.armFrontY = -25 + raise * -7 + swing * 14;
      p.armFrontW = 6 + swing * 5; p.armFrontH = 7;
      p.headX = swing * 1.5;
    } else if (state === 'hurt') {
      p.bodyX = -3; p.headX = -4; p.headY = -1;
      p.armFrontX = 4; p.armBackX = -13; p.legFrontX = 5; p.legBackX = -11;
    }
    return p;
  }

  function drawDog(g, key, pose, opts) {
    const ch = C[key];
    const fluffy = key !== 'gamja';
    const p = pose;
    const by = p.bodyY + p.crouch;

    // rear tail first
    if (key === 'mandu') {
      cluster(g, -17 + p.bodyX, -19 + by, ch.fur2, 1);
      cluster(g, -20 + p.bodyX, -22 + by, ch.fur, 0);
    } else if (key === 'zzigae') {
      px(g, -20 + p.bodyX, -22 + by, 7, 5, ch.fur2);
      px(g, -22 + p.bodyX, -25 + by, 5, 5, ch.fur);
    } else {
      px(g, -16 + p.bodyX, -20 + by, 5, 4, ch.fur2);
    }

    // legs are drawn as actual pose limbs, not idle limbs plus extras
    px(g, p.legBackX + p.bodyX, p.legBackY + by, p.legBackW, p.legBackH, ch.outline);
    px(g, p.legBackX + 1 + p.bodyX, p.legBackY + 1 + by, Math.max(3, p.legBackW - 2), Math.max(5, p.legBackH - 2), ch.fur);
    px(g, p.legFrontX + p.bodyX, p.legFrontY + by, p.legFrontW, p.legFrontH, ch.outline);
    px(g, p.legFrontX + 1 + p.bodyX, p.legFrontY + 1 + by, Math.max(3, p.legFrontW - 2), Math.max(4, p.legFrontH - 2), ch.fur2);

    // torso outline and fur
    px(g, -12 + p.bodyX, -27 + by, 25, 21, ch.outline);
    px(g, -10 + p.bodyX, -28 + by, 21, 20, ch.fur);
    px(g, -7 + p.bodyX, -26 + by, 17, 18, ch.fur2);
    if (fluffy) {
      cluster(g, -11 + p.bodyX, -29 + by, ch.fur, 0);
      cluster(g, 5 + p.bodyX, -29 + by, ch.fur, 1);
      cluster(g, -5 + p.bodyX, -30 + by, ch.fur2, 1);
    }

    // arms
    px(g, p.armBackX + p.bodyX, p.armBackY + by, p.armBackW, p.armBackH, ch.outline);
    px(g, p.armBackX + 1 + p.bodyX, p.armBackY + 1 + by, Math.max(3,p.armBackW-2), Math.max(4,p.armBackH-2), ch.fur);
    px(g, p.armFrontX + p.bodyX, p.armFrontY + by, p.armFrontW, p.armFrontH, ch.outline);
    px(g, p.armFrontX + 1 + p.bodyX, p.armFrontY + 1 + by, Math.max(3,p.armFrontW-2), Math.max(4,p.armFrontH-2), ch.fur2);

    // head
    const hx = p.headX, hy = p.headY + p.crouch;
    if (key === 'zzigae') {
      // Maltipoo: longer droopy ears + shaggy crown
      px(g, -18 + hx, -43 + hy, 10, 18, ch.outline);
      px(g, -17 + hx, -42 + hy, 8, 16, ch.fur);
      px(g, 8 + hx, -43 + hy, 10, 18, ch.outline);
      px(g, 9 + hx, -42 + hy, 8, 16, ch.fur);
      px(g, -13 + hx, -45 + hy, 27, 19, ch.outline);
      px(g, -11 + hx, -44 + hy, 23, 17, ch.fur2);
      cluster(g, -10 + hx, -47 + hy, ch.fur, 0);
      cluster(g, -1 + hx, -48 + hy, ch.fur2, 1);
      cluster(g, 6 + hx, -46 + hy, ch.fur, 1);
      px(g, -6 + hx, -34 + hy, 13, 8, ch.light);
    } else if (key === 'gamja') {
      // 2-month puppy: huge round head, tiny ears and muzzle
      px(g, -14 + hx, -43 + hy, 29, 19, ch.outline);
      px(g, -12 + hx, -44 + hy, 25, 18, ch.fur2);
      cluster(g, -10 + hx, -46 + hy, ch.light, 0);
      cluster(g, 3 + hx, -45 + hy, ch.fur, 1);
      px(g, -16 + hx, -39 + hy, 6, 11, ch.fur);
      px(g, 11 + hx, -39 + hy, 6, 11, ch.fur);
      px(g, -5 + hx, -33 + hy, 11, 7, ch.light);
    } else {
      // white poodle: round pom ears and crown
      cluster(g, -18 + hx, -42 + hy, ch.fur, 0);
      cluster(g, 12 + hx, -42 + hy, ch.fur, 1);
      px(g, -13 + hx, -44 + hy, 27, 19, ch.outline);
      px(g, -11 + hx, -43 + hy, 23, 17, ch.fur2);
      cluster(g, -9 + hx, -47 + hy, ch.light, 0);
      cluster(g, 0 + hx, -48 + hy, ch.fur, 1);
      cluster(g, 7 + hx, -46 + hy, ch.light, 0);
      px(g, -5 + hx, -33 + hy, 11, 7, '#f3f2ef');
    }

    // face
    px(g, -6 + hx, -38 + hy, 3, 3, '#151515');
    px(g, 5 + hx, -38 + hy, 3, 3, '#151515');
    px(g, 0 + hx, -33 + hy, 3, 3, '#222');
    px(g, 1 + hx, -30 + hy, 2, 2, '#744d45');
    // collar
    px(g, -8 + p.bodyX, -29 + by, 17, 3, ch.collar);

    if (pose.hammer) drawHammer(g, p.armFrontX + p.bodyX + p.armFrontW - 1, p.armFrontY + by - 1, opts.attackProgress);
  }

  function drawGucci(g, pose, opts) {
    const ch = C.gucci;
    const p = pose;
    const by = p.bodyY + p.crouch;
    // expressive long tail
    px(g, -21 + p.bodyX, -24 + by, 8, 4, ch.outline);
    px(g, -23 + p.bodyX, -28 + by, 5, 6, ch.outline);
    px(g, -20 + p.bodyX, -23 + by, 7, 2, ch.fur2);
    px(g, -22 + p.bodyX, -27 + by, 3, 5, ch.fur2);

    // legs
    px(g, p.legBackX + p.bodyX, p.legBackY + by, p.legBackW, p.legBackH, ch.outline);
    px(g, p.legBackX + 1 + p.bodyX, p.legBackY + 1 + by, Math.max(3,p.legBackW-2), Math.max(4,p.legBackH-2), ch.fur);
    px(g, p.legFrontX + p.bodyX, p.legFrontY + by, p.legFrontW, p.legFrontH, ch.outline);
    px(g, p.legFrontX + 1 + p.bodyX, p.legFrontY + 1 + by, Math.max(3,p.legFrontW-2), Math.max(4,p.legFrontH-2), ch.fur);

    // slender torso with orange back patch
    px(g, -11 + p.bodyX, -28 + by, 23, 22, ch.outline);
    px(g, -9 + p.bodyX, -27 + by, 19, 19, ch.fur);
    px(g, -8 + p.bodyX, -27 + by, 10, 7, ch.fur2);
    px(g, 4 + p.bodyX, -18 + by, 6, 7, ch.fur2);

    // arms
    px(g, p.armBackX + p.bodyX, p.armBackY + by, p.armBackW, p.armBackH, ch.outline);
    px(g, p.armBackX + 1 + p.bodyX, p.armBackY + 1 + by, Math.max(3,p.armBackW-2), Math.max(4,p.armBackH-2), ch.fur);
    px(g, p.armFrontX + p.bodyX, p.armFrontY + by, p.armFrontW, p.armFrontH, ch.outline);
    px(g, p.armFrontX + 1 + p.bodyX, p.armFrontY + 1 + by, Math.max(3,p.armFrontW-2), Math.max(4,p.armFrontH-2), ch.fur);

    const hx = p.headX, hy = p.headY + p.crouch;
    // pointy ears, orange crown like the supplied photo
    px(g, -13 + hx, -46 + hy, 7, 9, ch.outline);
    px(g, 7 + hx, -46 + hy, 7, 9, ch.outline);
    px(g, -11 + hx, -44 + hy, 5, 7, ch.fur2);
    px(g, 8 + hx, -44 + hy, 5, 7, ch.fur2);
    px(g, -13 + hx, -42 + hy, 27, 18, ch.outline);
    px(g, -11 + hx, -41 + hy, 23, 16, ch.fur);
    px(g, -10 + hx, -41 + hy, 10, 6, ch.fur2);
    px(g, 2 + hx, -40 + hy, 9, 5, ch.fur2);
    px(g, -7 + hx, -35 + hy, 5, 4, ch.light);
    px(g, 3 + hx, -35 + hy, 5, 4, ch.light);
    px(g, -6 + hx, -37 + hy, 3, 3, ch.eye);
    px(g, 4 + hx, -37 + hy, 3, 3, ch.eye);
    px(g, 0 + hx, -32 + hy, 3, 2, '#d98382');
    px(g, 1 + hx, -29 + hy, 2, 2, ch.dark);
    px(g, -8 + p.bodyX, -29 + by, 17, 2, ch.collar);

    if (pose.hammer) drawHammer(g, p.armFrontX + p.bodyX + p.armFrontW - 1, p.armFrontY + by - 1, opts.attackProgress);
  }

  function drawHammer(g, x, y, progress) {
    const swing = progress < .28 ? 0 : Math.min(1, (progress - .28) / .35);
    const hx = x + 4 + swing * 5;
    const hy = y - 13 + swing * 12;
    px(g, x + 1, y - 8 + swing * 5, 3, 17, '#7c5334');
    px(g, hx - 6, hy - 4, 15, 8, '#292d35');
    px(g, hx - 4, hy - 3, 11, 6, '#6f7680');
    px(g, hx + 6, hy - 2, 4, 4, '#b9c0c8');
  }

  function spriteReady(img) { return !!img && img.complete && (img.naturalWidth || 0) > 0; }

  function zzigaeFramesForState(state) {
    if (state === 'walk') return ZZIGAE_SPRITES.walk;
    if (state === 'punch') return ZZIGAE_SPRITES.punch;
    if (state === 'kick') return ZZIGAE_SPRITES.kick;
    if (state === 'jump' || state === 'jumpkick') return ZZIGAE_SPRITES.jump;
    if (state === 'hurt') return ZZIGAE_SPRITES.hurt;
    if (state === 'headbutt' || state === 'hammer') return ZZIGAE_SPRITES.punch;
    if (state === 'down') return ZZIGAE_SPRITES.down_getup.slice(0, 2);
    if (state === 'getup') return ZZIGAE_SPRITES.down_getup.slice(2, 4);
    return ZZIGAE_SPRITES.idle;
  }

  function pickFrame(frames, state, t, progress) {
    if (!frames?.length) return null;
    if (['punch','kick','headbutt','hammer'].includes(state)) {
      return frames[Math.min(frames.length - 1, Math.max(0, Math.floor(progress * frames.length)))];
    }
    if (state === 'jump' || state === 'jumpkick') {
      if (progress) return frames[Math.min(frames.length - 1, Math.max(0, Math.floor(progress * frames.length)))];
      const cycle = 150;
      return frames[Math.floor((t / cycle) % frames.length)];
    }
    if (state === 'hurt') {
      const cycle = 90;
      return frames[Math.floor((t / cycle) % frames.length)];
    }
    const cycle = state === 'walk' ? 110 : 180;
    return frames[Math.floor((t / cycle) % frames.length)];
  }

  function drawZzigaeSprite(g, x, y, opts = {}) {
    const state = opts.state || 'idle';
    const frames = zzigaeFramesForState(state);
    const img = pickFrame(frames, state, opts.time || 0, opts.attackProgress || 0);
    if (!spriteReady(img)) return false;
    const facing = opts.facing || 1;
    const scale = (opts.scale || 2) * 0.74;
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.scale(facing * scale, scale);
    g.drawImage(img, -24, -48, 48, 48);
    if (state === 'hammer') drawHammer(g, 9, -18, opts.attackProgress || 0);
    g.restore();
    return true;
  }

  function drawSprite(g, charKey, x, y, opts = {}) {
    if (charKey === 'zzigae' && drawZzigaeSprite(g, x, y, opts)) return;
    const ch = C[charKey] || C.zzigae;
    const baseScale = opts.scale || 2;
    const scale = baseScale * ch.visualScale;
    const facing = opts.facing || 1;
    const state = opts.state || 'idle';
    const t = opts.time || 0;
    const walkPhase = t * .014;
    const progress = opts.attackProgress || 0;
    const pose = poseFor(state, progress, walkPhase);

    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.scale(facing * scale, scale);
    if (charKey === 'gucci') drawGucci(g, pose, { ...opts, attackProgress: progress });
    else drawDog(g, charKey, pose, { ...opts, attackProgress: progress });
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

  function mapProjection() {
    return MAPS[currentMapKey]?.projection || 'iso';
  }

  function worldToScreen(x,y,z=0) {
    if (mapProjection() === 'flat') {
      return { x: 384 + x, y: 240 + y - z * .72 };
    }
    return { x: 384 + (x-y)*.62, y: 220 + (x+y)*.32 - z*.70 };
  }
  function matCorners(xr,yr){return [worldToScreen(-xr,-yr),worldToScreen(xr,-yr),worldToScreen(xr,yr),worldToScreen(-xr,yr)];}
  function poly(points,fill,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}

  function drawLivingRoom() {
    if (spriteReady(LIVING_BG)) {
      const scale = Math.max(canvas.width / LIVING_BG.naturalWidth, canvas.height / LIVING_BG.naturalHeight);
      const w = LIVING_BG.naturalWidth * scale;
      const h = LIVING_BG.naturalHeight * scale;
      const x = (canvas.width - w) * .5;
      const y = (canvas.height - h) * .5;
      ctx.drawImage(LIVING_BG, x, y, w, h);
    } else {
      ctx.fillStyle = '#b98a62';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.save();
    ctx.globalAlpha = .1;
    ctx.fillStyle = '#7a573c';
    ctx.fillRect(232, 170, 304, 200);
    ctx.restore();
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
    const depthOf = v => mapProjection()==='flat' ? (v.y||0) : ((v.x||0)+(v.y||0));
    currentItems.slice().sort((a,b)=>depthOf(a)-depthOf(b)).forEach(item=>drawItem(item,now));
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

  socket.on('connect',()=>setMessage(homeMessage,'온라인 서버 연결됨 · v4 · 찌개 스프라이트 적용'));
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
