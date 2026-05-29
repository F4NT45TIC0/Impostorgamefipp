import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { getRandomPair, getCategories } from './words.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Servir arquivos estáticos do React em produção
app.use(express.static(path.join(__dirname, 'dist')));

// Qualquer outra rota serve o index.html do React (SPA routing)
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Permite conexões de qualquer origem durante desenvolvimento
    methods: ["GET", "POST"]
  }
});

// Estrutura em memória para armazenar as salas
// rooms = {
//   [roomId]: {
//     id: roomId,
//     gameState: 'LOBBY' | 'PLAYING' | 'DISCUSSION',
//     settings: { impostorsCount: 1, timerDuration: 180, category: 'Aleatório' },
//     players: [ { id, nickname, isHost, isReady, connected, role, word } ],
//     currentWords: { civilian: '', impostor: '', category: '' },
//     discussionEndTime: null,
//     discussionTimeoutId: null
//   }
// }
const rooms = new Map();
const pactRooms = new Map();
const MAX_PACT_PLAYERS = 20;

// Função auxiliar para gerar código de sala aleatório (4 letras maiúsculas)
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  do {
    result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(result) || pactRooms.has(result)); // Garante que e unico entre os jogos
  return result;
}

// Retorna uma versão segura do estado da sala para transmissão pública
// Esconde papéis e palavras secretas dos jogadores
function getPublicRoomState(room) {
  const state = {
    id: room.id,
    gameState: room.gameState,
    serverTime: Date.now(),
    settings: room.settings,
    prepEndTime: room.prepEndTime,
    viewingEndTime: room.viewingEndTime,
    discussionEndTime: room.discussionEndTime,
    starterPlayer: room.starterPlayer,
    players: room.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.isHost,
      isReady: p.isReady,
      connected: p.connected
    })),
    // Exibe categorias disponíveis para o cliente renderizar
    availableCategories: ['Aleatório', ...getCategories()]
  };

  // Ao iniciar a revelação, envia a identidade de todos para o painel de debriefing
  if (room.gameState === 'REVEAL') {
    state.revealedRoles = room.players.map(p => ({
      nickname: p.nickname,
      role: p.role,
      word: p.word
    }));
  }

  return state;
}

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // 1. CRIAR SALA
  socket.on('create_room', ({ nickname }) => {
    if (!nickname || nickname.trim() === '') {
      return socket.emit('error_message', 'Apelido inválido.');
    }

    const roomId = generateRoomId();
    const newPlayer = {
      id: socket.id,
      nickname: nickname.trim(),
      isHost: true,
      isReady: false,
      connected: true,
      role: null,
      word: null
    };

    const room = {
      id: roomId,
      gameState: 'LOBBY',
      settings: {
        impostorsCount: 1,
        timerDuration: 180, // 3 minutos em segundos
        category: 'Aleatório'
      },
      players: [newPlayer],
      currentWords: { civilian: '', impostor: '', category: '' },
      starterPlayer: null,
      discussionEndTime: null,
      discussionTimeoutId: null
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    socket.emit('room_created', roomId);
    io.to(roomId).emit('room_state', getPublicRoomState(room));
    console.log(`Sala criada: ${roomId} por ${nickname.trim()}`);
  });

  // 2. ENTRAR NA SALA
  socket.on('join_room', ({ roomId, nickname }) => {
    if (!roomId || !nickname) {
      return socket.emit('error_message', 'Dados inválidos.');
    }

    const code = roomId.toUpperCase().trim();
    const name = nickname.trim();

    if (name === '') {
      return socket.emit('error_message', 'Apelido inválido.');
    }

    const room = rooms.get(code);
    if (!room) {
      return socket.emit('error_message', 'Sala não encontrada.');
    }

    if (room.gameState !== 'LOBBY') {
      // Tentar reconexão se o apelido for exatamente o mesmo
      const existingPlayer = room.players.find(p => p.nickname.toLowerCase() === name.toLowerCase());
      if (existingPlayer && !existingPlayer.connected) {
        // Remove socket ID antigo da sala e atualiza
        existingPlayer.id = socket.id;
        existingPlayer.connected = true;
        socket.join(code);
        
        io.to(code).emit('room_state', getPublicRoomState(room));
        
        // Envia novamente apenas a palavra privada. O papel fica oculto ate o debriefing.
        sendPrivateGameData(socket, room, existingPlayer);
        
        if (room.gameState === 'DISCUSSION') {
          socket.emit('discussion_started', {
            endTime: room.discussionEndTime,
            serverTime: Date.now()
          });
        }
        return;
      }
      return socket.emit('error_message', 'A partida já está em andamento nesta sala.');
    }

    // Verificar se apelido já existe e está ativo
    const nameExists = room.players.some(p => p.nickname.toLowerCase() === name.toLowerCase() && p.connected);
    if (nameExists) {
      return socket.emit('error_message', 'Este apelido já está em uso nesta sala.');
    }

    // Limite de 20 jogadores
    if (room.players.length >= 20) {
      return socket.emit('error_message', 'A sala está cheia (máximo de 20 jogadores).');
    }

    const newPlayer = {
      id: socket.id,
      nickname: name,
      isHost: false,
      isReady: false,
      connected: true,
      role: null,
      word: null
    };

    room.players.push(newPlayer);
    socket.join(code);

    io.to(code).emit('room_state', getPublicRoomState(room));
    console.log(`Jogador ${name} entrou na sala ${code}`);
  });

  // 2.5 SINCRONIZAR APOS RECONEXAO / CELULAR VOLTAR DA TELA BLOQUEADA
  socket.on('sync_room', ({ roomId, nickname }) => {
    if (!roomId || !nickname) return;

    const code = roomId.toUpperCase().trim();
    const name = nickname.trim();
    const room = rooms.get(code);
    if (!room || name === '') return;

    const player = room.players.find(p =>
      p.id === socket.id || p.nickname.toLowerCase() === name.toLowerCase()
    );
    if (!player) return;

    player.id = socket.id;
    player.connected = true;
    socket.join(code);

    socket.emit('room_state', getPublicRoomState(room));

    if (room.gameState !== 'LOBBY' && player.word) {
      sendPrivateGameData(socket, room, player);
    }

    if (room.gameState === 'DISCUSSION') {
      socket.emit('discussion_started', {
        endTime: room.discussionEndTime,
        serverTime: Date.now()
      });
    }
  });

  // 3. ALTERNAR PRONTO
  socket.on('toggle_ready', () => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player) return;

    // Em lobby, qualquer um pode dar pronto
    if (room.gameState === 'LOBBY') {
      player.isReady = !player.isReady;
      io.to(room.id).emit('room_state', getPublicRoomState(room));
    }
  });

  // 4. ATUALIZAR CONFIGURAÇÕES (APENAS HOST)
  socket.on('update_settings', ({ impostorsCount, timerDuration, category }) => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player || !player.isHost) return;

    if (room.gameState === 'LOBBY') {
      if (impostorsCount !== undefined && impostorsCount >= 1) {
        room.settings.impostorsCount = Math.floor(impostorsCount);
      }
      if (timerDuration !== undefined && timerDuration >= 10) {
        room.settings.timerDuration = Math.floor(timerDuration);
      }
      if (category !== undefined) {
        room.settings.category = category;
      }

      io.to(room.id).emit('room_state', getPublicRoomState(room));
    }
  });

  // 5. INICIAR PARTIDA (APENAS HOST)
  socket.on('start_game', () => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player || !player.isHost) return;

    if (room.gameState === 'LOBBY') {
      const activePlayers = room.players.filter(p => p.connected);
      
      // Validações básicas de início
      const requiredPlayers = room.settings.impostorsCount + 2; // Pelo menos Impostores + 2 Civis para fazer sentido
      if (activePlayers.length < requiredPlayers) {
        return socket.emit('error_message', `Jogadores insuficientes para iniciar com ${room.settings.impostorsCount} impostor(es). Mínimo de ${requiredPlayers} jogadores.`);
      }

      // Todos os outros jogadores (não-host) devem estar prontos, ou no geral
      const allReady = activePlayers.every(p => p.isHost || p.isReady);
      if (!allReady) {
        return socket.emit('error_message', 'Todos os jogadores precisam estar prontos!');
      }

      // 1. Transiciona para a fase de PREPARAÇÃO (5 segundos)
      room.gameState = 'PREPARING';
      room.prepEndTime = Date.now() + 5000;
      room.viewingEndTime = null;
      room.starterPlayer = null;

      io.to(room.id).emit('room_state', getPublicRoomState(room));
      console.log(`Sala ${room.id} em fase de PREPARAÇÃO por 5 segundos.`);

      // 2. Agenda a transição para início real da partida após 5s
      setTimeout(() => {
        // Valida se a sala ainda existe e permanece em fase de preparação
        const currentRoom = rooms.get(room.id);
        if (!currentRoom || currentRoom.gameState !== 'PREPARING') return;

        const currentActivePlayers = currentRoom.players.filter(p => p.connected);

        // Seleciona as palavras secretas
        const wordPair = getRandomPair(currentRoom.settings.category);
        currentRoom.currentWords = {
          civilian: wordPair.civilian,
          impostor: wordPair.impostor,
          category: wordPair.category
        };

        // Sorteia os Impostores
        const shuffledPlayers = [...currentActivePlayers].sort(() => Math.random() - 0.5);
        const impostorIds = new Set(
          shuffledPlayers.slice(0, currentRoom.settings.impostorsCount).map(p => p.id)
        );

        // Distribui papéis e palavras
        currentRoom.players.forEach(p => {
          if (p.connected) {
            if (impostorIds.has(p.id)) {
              p.role = 'impostor';
              p.word = currentRoom.currentWords.impostor;
            } else {
              p.role = 'civilian';
              p.word = currentRoom.currentWords.civilian;
            }
            // Envia de forma privada apenas a palavra para cada jogador.
            sendPrivateGameData(io.to(p.id), currentRoom, p);
          }
        });

        // Transiciona para JOGANDO e estabelece o cronômetro de 10 segundos para visualização
        currentRoom.gameState = 'PLAYING';
        currentRoom.viewingEndTime = Date.now() + 10000;
        currentRoom.starterPlayer = pickStarterPlayer(currentActivePlayers);

        io.to(currentRoom.id).emit('room_state', getPublicRoomState(currentRoom));
        console.log(`Jogo iniciado na sala ${currentRoom.id}. Categoria: ${wordPair.category}. 10s para memorização.`);
      }, 5000);
    }
  });

  // 6. ENCERRAR RODADAS E INICIAR DISCUSSÃO (APENAS HOST)
  socket.on('trigger_discussion', () => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player || !player.isHost) return;

    if (room.gameState === 'PLAYING') {
      room.gameState = 'DISCUSSION';
      
      const durationMs = room.settings.timerDuration * 1000;
      room.discussionEndTime = Date.now() + durationMs;

      io.to(room.id).emit('discussion_started', {
        endTime: room.discussionEndTime,
        serverTime: Date.now()
      });
      io.to(room.id).emit('room_state', getPublicRoomState(room));

      // Limpa qualquer timeout anterior por garantia
      if (room.discussionTimeoutId) {
        clearTimeout(room.discussionTimeoutId);
      }

      // Agendar o encerramento automático da discussão
      room.discussionTimeoutId = setTimeout(() => {
        autoEndDiscussion(room.id);
      }, durationMs);

      console.log(`Discussão iniciada na sala ${room.id}. Timer: ${room.settings.timerDuration}s`);
    }
  });

  // 7. REVELAR IMPOSTORES // DESCRIPTOGRAFAR DOSSIÊ (APENAS HOST)
  socket.on('end_discussion', () => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player || !player.isHost) return;

    if (room.gameState === 'DISCUSSION') {
      if (room.discussionTimeoutId) {
        clearTimeout(room.discussionTimeoutId);
        room.discussionTimeoutId = null;
      }
      room.gameState = 'REVEAL';
      io.to(room.id).emit('discussion_ended');
      io.to(room.id).emit('room_state', getPublicRoomState(room));
      console.log(`Dossiê descriptografado na sala ${room.id}. Infiltrados revelados.`);
    }
  });

  // 7.5 REINICIAR CANAL E VOLTAR AO LOBBY (APENAS HOST)
  socket.on('restart_lobby', () => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player || !player.isHost) return;

    if (room.gameState === 'REVEAL') {
      resetRoomToLobby(room);
    }
  });

  // PACTO DE SANGUE: CRIAR SALA
  socket.on('pact_create_room', ({ nickname }) => {
    const name = nickname?.trim();
    if (!name) return socket.emit('error_message', 'Apelido inválido.');

    const roomId = generateRoomId();
    const room = createPactRoom(roomId, socket.id, name);
    pactRooms.set(roomId, room);
    socket.join(roomId);

    socket.emit('pact_room_created', roomId);
    emitPactRoom(room);
  });

  // PACTO DE SANGUE: ENTRAR NA SALA
  socket.on('pact_join_room', ({ roomId, nickname }) => {
    const code = roomId?.toUpperCase().trim();
    const name = nickname?.trim();
    if (!code || !name) return socket.emit('error_message', 'Dados inválidos.');

    const room = pactRooms.get(code);
    if (!room) return socket.emit('error_message', 'Sala do Pacto não encontrada.');

    const existing = room.players.find(p => p.nickname.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.connected && existing.id !== socket.id) {
        return socket.emit('error_message', 'Este apelido já está em uso nesta sala.');
      }
      existing.id = socket.id;
      existing.connected = true;
      socket.join(code);
      emitPactRoom(room);
      emitPactPrivate(room, existing);
      return;
    }

    if (room.phase !== 'LOBBY') {
      return socket.emit('error_message', 'O pacto já foi selado nesta sala.');
    }
    if (room.players.length >= MAX_PACT_PLAYERS) {
      return socket.emit('error_message', 'A sala do Pacto está cheia. Máximo de 20 jogadores.');
    }

    room.players.push({
      id: socket.id,
      nickname: name,
      isHost: false,
      isReady: false,
      connected: true,
      alive: true,
      role: null,
      canVote: true,
      protectedNextNight: false
    });
    socket.join(code);
    emitPactRoom(room);
  });

  socket.on('pact_sync_room', ({ roomId, nickname }) => {
    const code = roomId?.toUpperCase().trim();
    const name = nickname?.trim();
    if (!code || !name) return;

    const room = pactRooms.get(code);
    if (!room) return;

    const player = room.players.find(p =>
      p.id === socket.id || p.nickname.toLowerCase() === name.toLowerCase()
    );
    if (!player) return;

    player.id = socket.id;
    player.connected = true;
    socket.join(code);
    emitPactRoom(room);
    emitPactPrivate(room, player);
  });

  socket.on('pact_update_settings', ({ wolfCount, specialRoles, revealDeadRoles }) => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost || room.phase !== 'LOBBY') return;

    if (wolfCount !== undefined) {
      room.settings.wolfCount = Math.min(3, Math.max(1, Math.floor(Number(wolfCount) || 1)));
    }
    if (specialRoles !== undefined) {
      room.settings.specialRoles = Boolean(specialRoles);
    }
    if (revealDeadRoles !== undefined) {
      room.settings.revealDeadRoles = Boolean(revealDeadRoles);
    }
    emitPactRoom(room);
  });

  socket.on('pact_toggle_ready', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player || room.phase !== 'LOBBY' || player.isHost) return;
    player.isReady = !player.isReady;
    emitPactRoom(room);
  });

  socket.on('pact_start_game', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost || room.phase !== 'LOBBY') return;

    const activePlayers = room.players.filter(p => p.connected);
    const minimumPlayers = getPactMinimumPlayers(room.settings.wolfCount);
    if (activePlayers.length < minimumPlayers) {
      return socket.emit('error_message', `Com ${room.settings.wolfCount} lobisomem(ns), o Pacto precisa de pelo menos ${minimumPlayers} jogadores.`);
    }
    if (!activePlayers.every(p => p.isHost || p.isReady)) {
      return socket.emit('error_message', 'Todos precisam estar prontos.');
    }

    startPactGame(room);
    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_night_action', (action) => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.alive || room.phase !== 'NIGHT') return;

    const normalized = normalizePactAction(room, player, action);
    if (!normalized) {
      return socket.emit('pact_private_message', 'Sua mente falha ao tentar canalizar esse poder agora.');
    }

    room.actions[player.id] = normalized;
    socket.emit('pact_private_message', 'Sua decisão foi selada na noite.');
    emitPactRoom(room);
  });

  socket.on('pact_resolve_night', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost || room.phase !== 'NIGHT') return;
    resolvePactNight(room);
    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_vote', ({ targetId }) => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.alive || room.phase !== 'DAY' || !player.canVote) return;

    const target = room.players.find(p => p.id === targetId && p.alive);
    if (!target) return;

    const finalTargetId = player.selfVoteTrap ? player.id : target.id;
    room.votes[player.id] = finalTargetId;
    checkPactMajority(room);
    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_end_day', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost || room.phase !== 'DAY') return;
    executePactTopVoted(room);
    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_next_night', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost || room.phase !== 'DAY') return;
    startPactNight(room);
    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_restart_lobby', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost) return;
    resetPactRoom(room);
    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_leave_room', () => {
    handlePactPlayerExit(socket);
  });

  // 8. JOGADOR SAI DA SALA VOLUNTARIAMENTE
  socket.on('leave_room', () => {
    handlePlayerExit(socket);
  });

  // 9. DESCONEXÃO DO SOCKET
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    handlePlayerExit(socket, true); // true indica desconexão involuntária
    handlePactPlayerExit(socket, true);
  });
});

const PACT_ROLES = {
  ABOMINATION: { name: 'A Abominação Costurada', faction: 'Lobisomens', team: 'wolf' },
  ALPHA: { name: 'O Alfa Alfaçado', faction: 'Lobisomens', team: 'wolf' },
  FLAGELLANT: { name: 'O Flagelante', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  BUTCHER: { name: 'O Carniceiro Devoto', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  SUCCUBUS: { name: 'O Súcubo do Confessionário', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  COLLECTOR: { name: 'O Colecionador de Pecados', faction: 'Neutro', team: 'neutral' },
  PARASITE: { name: 'O Parasita Sombrio', faction: 'Neutro', team: 'neutral' },
  VILLAGER: { name: 'Aldeão Marcado', faction: 'Vila de Teodoro Sampaio', team: 'village' }
};

function createPactRoom(roomId, hostId, nickname) {
  return {
    id: roomId,
    phase: 'LOBBY',
    hostId,
    settings: {
      wolfCount: 1,
      specialRoles: true,
      revealDeadRoles: true
    },
    dayNumber: 0,
    nightNumber: 0,
    players: [{
      id: hostId,
      nickname,
      isHost: true,
      isReady: false,
      connected: true,
      alive: true,
      role: null,
      canVote: true,
      protectedNextNight: false
    }],
    actions: {},
    votes: {},
    log: ['A Vila de Teodoro Sampaio ainda respira. Por enquanto.'],
    lastNightDeaths: [],
    nightDisabled: false,
    winner: null
  };
}

function getPactPublicRoomState(room) {
  return {
    id: room.id,
    phase: room.phase,
    serverTime: Date.now(),
    settings: room.settings,
    dayNumber: room.dayNumber,
    nightNumber: room.nightNumber,
    players: room.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.isHost,
      isReady: p.isReady,
      connected: p.connected,
      alive: p.alive,
      canVote: p.canVote,
      revealedRole: !p.alive && room.settings.revealDeadRoles !== false ? p.role?.name : null
    })),
    votes: room.votes,
    log: room.log.slice(-8),
    winner: room.winner,
    actionsCount: Object.keys(room.actions).length,
    aliveCount: room.players.filter(p => p.alive).length
  };
}

function emitPactRoom(room) {
  io.to(room.id).emit('pact_room_state', getPactPublicRoomState(room));
}

function emitPactPrivate(room, player) {
  if (!player?.connected) return;
  const collectorKnown = player.collectorKnown || [];
  io.to(player.id).emit('pact_private_state', {
    role: player.role,
    alive: player.alive,
    hostId: player.parasiteHostId || null,
    hostNickname: room.players.find(p => p.id === player.parasiteHostId)?.nickname || null,
    privateLog: (player.privateLog || []).slice(-8),
    collectorKnown
  });
}

function emitPactPrivateToAll(room) {
  room.players.forEach(player => emitPactPrivate(room, player));
}

function startPactGame(room) {
  const activePlayers = shuffle([...room.players.filter(p => p.connected)]);
  room.settings.wolfCount = Math.min(3, Math.max(1, room.settings.wolfCount || 1));
  const roles = buildPactRoleList(activePlayers.length, room.settings);

  activePlayers.forEach((player, index) => {
    player.role = roles[index] || PACT_ROLES.VILLAGER;
    player.alive = true;
    player.canVote = true;
    player.protectedNextNight = false;
    player.selfVoteTrap = false;
    player.collectorKnown = [];
    player.privateLog = [`Sua classe é ${player.role.name}. Facção: ${player.role.faction}.`];
  });

  const parasite = activePlayers.find(p => p.role.name === PACT_ROLES.PARASITE.name);
  if (parasite) {
    const hosts = activePlayers.filter(p => p.id !== parasite.id);
    const host = hosts[Math.floor(Math.random() * hosts.length)];
    parasite.parasiteHostId = host?.id || null;
    parasite.privateLog.push(`Você infestou ${host?.nickname}. Se a Vila de Teodoro Sampaio enforcar seu hospedeiro, você vence sozinho.`);
  }

  room.phase = 'NIGHT';
  room.nightNumber = 1;
  room.dayNumber = 0;
  room.actions = {};
  room.votes = {};
  room.winner = null;
  room.log = [
    'A névoa desce sobre a Vila de Teodoro Sampaio, trazendo cheiro de ferro e madeira úmida.',
    'A Noite Caiu. Recolham-se aos seus pecados.'
  ];
}

function buildPactRoleList(count, settings = {}) {
  const wolfCount = Math.min(3, Math.max(1, settings.wolfCount || 1));
  const roles = [PACT_ROLES.ALPHA];

  if (wolfCount >= 2) roles.push(PACT_ROLES.ABOMINATION);
  if (wolfCount >= 3) roles.push({ ...PACT_ROLES.ABOMINATION, name: 'Lobisomem da Matilha' });

  if (settings.specialRoles !== false) {
    const specials = [
      PACT_ROLES.FLAGELLANT,
      PACT_ROLES.BUTCHER,
      PACT_ROLES.SUCCUBUS,
      PACT_ROLES.COLLECTOR,
      PACT_ROLES.PARASITE
    ];
    const specialSlots = Math.max(0, count - roles.length - 2);
    roles.push(...specials.slice(0, specialSlots));
  }

  while (roles.length < count) roles.push(PACT_ROLES.VILLAGER);
  return shuffle(roles);
}

function getPactMinimumPlayers(wolfCount) {
  if (wolfCount >= 3) return 8;
  if (wolfCount === 2) return 6;
  return 4;
}

function normalizePactAction(room, player, action = {}) {
  const roleName = player.role?.name;
  const target = room.players.find(p => p.id === action.targetId);
  const secondTarget = room.players.find(p => p.id === action.secondTargetId);
  const livingTarget = target?.alive ? target : null;

  if (room.nightDisabled) return { type: 'blocked' };
  if ([PACT_ROLES.ALPHA.name, PACT_ROLES.ABOMINATION.name, 'Lobisomem da Matilha'].includes(roleName)) {
    if (!livingTarget || livingTarget.id === player.id) return null;
    return {
      type: 'wolf_kill',
      targetId: livingTarget.id,
      howl: roleName === PACT_ROLES.ALPHA.name && action.howl === true && !player.alphaHowlUsed
    };
  }
  if (roleName === PACT_ROLES.FLAGELLANT.name) {
    if (!livingTarget) return null;
    return { type: 'flagellant_vision', targetId: livingTarget.id };
  }
  if (roleName === PACT_ROLES.BUTCHER.name) {
    if (!target || target.alive) return null;
    return { type: 'butcher_feed', targetId: target.id };
  }
  if (roleName === PACT_ROLES.SUCCUBUS.name) {
    if (!livingTarget || !secondTarget?.alive || livingTarget.id === secondTarget.id) return null;
    return { type: 'succubus_link', targetId: livingTarget.id, secondTargetId: secondTarget.id };
  }
  if (roleName === PACT_ROLES.COLLECTOR.name) {
    if (!target) return null;
    return { type: 'collector_read', targetId: target.id };
  }
  return { type: 'wait' };
}

function resolvePactNight(room) {
  const deaths = [];
  const dawn = [];

  if (room.nightDisabled) {
    room.nightDisabled = false;
    room.phase = 'DAY';
    room.dayNumber += 1;
    room.actions = {};
    room.votes = {};
    room.log.push('A culpa coletiva sufocou a Vila de Teodoro Sampaio. Nenhum poder respondeu durante a noite.');
    return;
  }

  for (const [playerId, action] of Object.entries(room.actions)) {
    const actor = room.players.find(p => p.id === playerId && p.alive);
    const target = room.players.find(p => p.id === action.targetId);
    const secondTarget = room.players.find(p => p.id === action.secondTargetId);
    if (!actor || !target) continue;

    if (action.type === 'flagellant_vision') {
      actor.privateLog.push(`Visão de Sangue: ${target.nickname} pertence à facção ${target.role.faction}.`);
    }
    if (action.type === 'collector_read') {
      actor.collectorKnown = actor.collectorKnown || [];
      if (!actor.collectorKnown.some(entry => entry.id === target.id)) {
        actor.collectorKnown.push({ id: target.id, nickname: target.nickname, role: target.role.name });
      }
      actor.privateLog.push(`Pecado absorvido: ${target.nickname} é ${target.role.name}.`);
    }
    if (action.type === 'butcher_feed') {
      if (target.role.team === 'wolf') {
        actor.protectedNextNight = true;
        actor.privateLog.push('A carne de lobo te reveste de uma resistência profana para a próxima noite.');
      } else {
        actor.canVote = false;
        actor.privateLog.push('A carne inocente te deixou em choque. Amanhã, sua voz falhará no julgamento.');
      }
    }
    if (action.type === 'succubus_link' && secondTarget) {
      const pair = [target, secondTarget];
      const wolf = pair.find(p => p.role.team === 'wolf');
      const villager = pair.find(p => p.role.team === 'village');
      if (wolf && villager) {
        wolf.canVote = false;
        actor.privateLog.push(`Chantagem firmada: ${wolf.nickname} perderá o voto se ${villager.nickname} cair.`);
      }
    }
    if (action.howl && target.alive) {
      target.selfVoteTrap = true;
      actor.alphaHowlUsed = true;
      actor.privateLog.push(`O Uivo da Demência foi cravado em ${target.nickname}.`);
    }
  }

  const wolfActions = Object.entries(room.actions)
    .map(([playerId, action]) => ({ actor: room.players.find(p => p.id === playerId), action }))
    .filter(({ actor, action }) => actor?.alive && actor.role.team === 'wolf' && action.type === 'wolf_kill');

  const killAction = wolfActions[0]?.action;
  const target = room.players.find(p => p.id === killAction?.targetId && p.alive);
  if (target) {
    if (target.protectedNextNight) {
      target.protectedNextNight = false;
      dawn.push(`${target.nickname} foi encontrado vivo, pálido, protegido por algo que ninguém ousa nomear.`);
    } else {
      target.alive = false;
      deaths.push(target);
      dawn.push(`${target.nickname} não viu o amanhecer. A Vila de Teodoro Sampaio encontrou apenas silêncio e marcas na porta.`);
    }
  } else {
    dawn.push('A noite arranhou as paredes, mas ninguém caiu.');
  }

  handleParasiteNightDeaths(room, deaths);
  room.lastNightDeaths = deaths.map(p => p.id);
  room.phase = 'DAY';
  room.dayNumber += 1;
  room.actions = {};
  room.votes = {};
  room.log.push(`Amanhecer ${room.dayNumber}.`, ...dawn);
  checkPactWin(room);
}

function checkPactMajority(room) {
  const eligible = room.players.filter(p => p.alive && p.canVote);
  const needed = Math.floor(eligible.length / 2) + 1;
  const counts = countVotes(room);
  const majority = Object.entries(counts).find(([, count]) => count >= needed);
  if (majority) executePactPlayer(room, majority[0]);
}

function executePactTopVoted(room) {
  const counts = countVotes(room);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) {
    room.log.push('O dia morreu sem consenso. A forca permaneceu vazia.');
    return checkPactWin(room);
  }
  executePactPlayer(room, top[0]);
}

function countVotes(room) {
  return Object.values(room.votes).reduce((acc, targetId) => {
    acc[targetId] = (acc[targetId] || 0) + 1;
    return acc;
  }, {});
}

function executePactPlayer(room, targetId) {
  const target = room.players.find(p => p.id === targetId && p.alive);
  if (!target) return;
  target.alive = false;
  room.votes = {};
  room.log.push(room.settings.revealDeadRoles !== false
    ? `${target.nickname} foi levado ao julgamento. A corda revelou: ${target.role.name}.`
    : `${target.nickname} foi levado ao julgamento. A corda não revelou sua classe.`);
  if (target.role.name === PACT_ROLES.FLAGELLANT.name) {
    room.nightDisabled = true;
    room.log.push(room.settings.revealDeadRoles !== false
      ? 'A culpa do Flagelante caiu sobre todos. A próxima noite não terá habilidades.'
      : 'Uma culpa pesada caiu sobre todos. A próxima noite não terá habilidades.');
  }
  const parasite = room.players.find(p => p.alive && p.role?.name === PACT_ROLES.PARASITE.name);
  if (parasite?.parasiteHostId === target.id) {
    room.phase = 'ENDED';
    room.winner = { faction: 'O Parasita Sombrio', text: `${parasite.nickname} venceu sozinho. A Vila de Teodoro Sampaio enforcou seu hospedeiro.` };
    return;
  }
  checkPactWin(room);
}

function handleParasiteNightDeaths(room, deaths) {
  const parasite = room.players.find(p => p.alive && p.role?.name === PACT_ROLES.PARASITE.name);
  if (parasite && deaths.some(dead => dead.id === parasite.parasiteHostId)) {
    parasite.alive = false;
    room.log.push(`${parasite.nickname} se apagou junto do hospedeiro devorado.`);
  }
}

function checkPactWin(room) {
  if (room.phase === 'ENDED') return;
  const alive = room.players.filter(p => p.alive);
  const wolves = alive.filter(p => p.role?.team === 'wolf');
  const villagers = alive.filter(p => p.role?.team === 'village');
  const collector = alive.find(p => p.role?.name === PACT_ROLES.COLLECTOR.name);

  if (collector) {
    const deadKnown = (collector.collectorKnown || []).filter(entry => {
      const player = room.players.find(p => p.id === entry.id);
      return player && !player.alive;
    });
    if (deadKnown.length >= 3) {
      room.phase = 'ENDED';
      room.winner = { faction: 'O Colecionador de Pecados', text: `${collector.nickname} roubou a vitória com três pecados de mortos.` };
      return;
    }
  }
  if (wolves.length === 0) {
    room.phase = 'ENDED';
    room.winner = { faction: 'Vila de Teodoro Sampaio', text: 'Os sobreviventes eliminaram as ameaças da Vila de Teodoro Sampaio.' };
    return;
  }
  if (wolves.length >= villagers.length) {
    room.phase = 'ENDED';
    room.winner = { faction: 'Lobisomens', text: 'A matilha igualou a Vila de Teodoro Sampaio. Teodoro pertence aos predadores.' };
  }
}

function startPactNight(room) {
  room.phase = 'NIGHT';
  room.nightNumber += 1;
  room.actions = {};
  room.votes = {};
  room.players.forEach(p => {
    p.selfVoteTrap = false;
    if (p.alive) p.canVote = true;
  });
  room.log.push(`Noite ${room.nightNumber}. A Vila de Teodoro Sampaio recolhe as luzes e expõe as próprias culpas.`);
}

function resetPactRoom(room) {
  room.phase = 'LOBBY';
  room.dayNumber = 0;
  room.nightNumber = 0;
  room.actions = {};
  room.votes = {};
  room.winner = null;
  room.lastNightDeaths = [];
  room.nightDisabled = false;
  room.log = ['A Vila de Teodoro Sampaio ainda respira. Por enquanto.'];
  room.players = room.players.filter(p => p.connected).map((p, index) => ({
    id: p.id,
    nickname: p.nickname,
    isHost: index === 0,
    isReady: false,
    connected: true,
    alive: true,
    role: null,
    canVote: true,
    protectedNextNight: false
  }));
  room.hostId = room.players[0]?.id;
  room.settings = {
    wolfCount: room.settings?.wolfCount || 1,
    specialRoles: room.settings?.specialRoles !== false,
    revealDeadRoles: room.settings?.revealDeadRoles !== false
  };
}

function handlePactPlayerExit(socket, isDisconnect = false) {
  const { room, player } = getPactRoomAndPlayer(socket.id);
  if (!room || !player) return;

  if (isDisconnect && room.phase !== 'LOBBY') {
    player.connected = false;
    emitPactRoom(room);
    return;
  }

  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(room.id);
  if (room.players.length === 0) {
    pactRooms.delete(room.id);
    return;
  }
  if (player.isHost) {
    const nextHost = room.players.find(p => p.connected) || room.players[0];
    if (nextHost) {
      room.players.forEach(p => { p.isHost = p.id === nextHost.id; });
      room.hostId = nextHost.id;
    }
  }
  emitPactRoom(room);
}

function getPactRoomAndPlayer(socketId) {
  for (const room of pactRooms.values()) {
    const player = room.players.find(p => p.id === socketId);
    if (player) return { room, player };
  }
  return { room: null, player: null };
}

function shuffle(list) {
  return list
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

// Reseta a sala de volta ao Lobby
function resetRoomToLobby(room) {
  if (room.discussionTimeoutId) {
    clearTimeout(room.discussionTimeoutId);
    room.discussionTimeoutId = null;
  }

  room.gameState = 'LOBBY';
  room.discussionEndTime = null;
  room.currentWords = { civilian: '', impostor: '', category: '' };
  room.starterPlayer = null;

  // Reseta estado dos jogadores
  room.players.forEach(p => {
    p.isReady = false;
    p.role = null;
    p.word = null;
  });

  // Remove jogadores que desconectaram permanentemente durante a rodada
  room.players = room.players.filter(p => p.connected);

  io.to(room.id).emit('discussion_ended');
  io.to(room.id).emit('room_state', getPublicRoomState(room));
  console.log(`Sala ${room.id} retornou ao lobby.`);
}

// Encerramento automático quando o timer de discussão zera (Transiciona para REVEAL)
function autoEndDiscussion(roomId) {
  const room = rooms.get(roomId);
  if (room && room.gameState === 'DISCUSSION') {
    if (room.discussionTimeoutId) {
      clearTimeout(room.discussionTimeoutId);
      room.discussionTimeoutId = null;
    }
    room.gameState = 'REVEAL';
    io.to(room.id).emit('discussion_ended');
    io.to(room.id).emit('room_state', getPublicRoomState(room));
    console.log(`Discussão encerrada por tempo na sala ${room.id}. Revelando infiltrados.`);
  }
}

function sendPrivateGameData(target, room, player) {
  target.emit('game_started', {
    word: player.word,
    category: room.currentWords.category,
    serverTime: Date.now()
  });
}

function pickStarterPlayer(players) {
  if (!players.length) return null;

  const starter = players[Math.floor(Math.random() * players.length)];
  return {
    id: starter.id,
    nickname: starter.nickname
  };
}

// Remove jogador ou gerencia desconexão temporária
function handlePlayerExit(socket, isDisconnect = false) {
  const { room, player } = getRoomAndPlayer(socket.id);
  if (!room || !player) return;

  const roomId = room.id;

  if (isDisconnect && room.gameState !== 'LOBBY') {
    // Em jogo ativo, marcar como desconectado para permitir reconexão sem travar a partida
    player.connected = false;
    io.to(roomId).emit('room_state', getPublicRoomState(room));
    console.log(`Jogador ${player.nickname} desconectou temporariamente da sala ${roomId}`);
    return;
  }

  // Se for saída voluntária ou desconexão em LOBBY, remove de vez
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(roomId);

  // Se a sala ficou vazia, exclui ela
  const activePlayers = room.players.filter(p => p.connected);
  if (activePlayers.length === 0) {
    if (room.discussionTimeoutId) {
      clearTimeout(room.discussionTimeoutId);
    }
    rooms.delete(roomId);
    console.log(`Sala ${roomId} vazia e removida.`);
    return;
  }

  // Se quem saiu era o Dono da Sala, promove outro jogador ativo a Dono
  if (player.isHost) {
    const nextHost = room.players.find(p => p.connected);
    if (nextHost) {
      nextHost.isHost = true;
      console.log(`Jogador ${nextHost.nickname} promovido a Dono da Sala ${roomId}`);
    }
  }

  io.to(roomId).emit('room_state', getPublicRoomState(room));
  console.log(`Jogador ${player.nickname} saiu da sala ${roomId}`);
}

// Função auxiliar para encontrar a sala e o jogador a partir do socket.id
function getRoomAndPlayer(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === socketId);
    if (player) {
      return { room, player };
    }
  }
  return { room: null, player: null };
}

// Iniciar o servidor na porta configurada (Render passa a porta por env)
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
