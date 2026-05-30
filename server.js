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

    // Auto-resolve a noite se todos os jogadores vivos e conectados enviaram suas ações!
    const livingPlayers = room.players.filter(p => p.alive && p.connected);
    const actionCount = Object.keys(room.actions).length;
    
    if (actionCount >= livingPlayers.length) {
      resolvePactNight(room);
    }

    emitPactRoom(room);
    emitPactPrivateToAll(room);
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
    if (!room || !player?.alive || room.phase !== 'DAY') return;

    // Se o jogador for devedor de um Agiota vivo, ele não pode iniciar o seu próprio voto
    const agiota = room.players.find(p => p.id === player.debtorOf && p.alive);
    if (agiota) {
      return socket.emit('pact_private_message', 'Você está endividado! Seu voto é controlado pelo Agiota.');
    }

    if (!player.canVote || player.hangover || player.gagged) {
      return socket.emit('pact_private_message', 'Você está impossibilitado de votar hoje (ressaca ou mordaça).');
    }

    const target = room.players.find(p => p.id === targetId && p.alive);
    if (!target) return;

    const finalTargetId = player.selfVoteTrap ? player.id : target.id;
    room.votes[player.id] = finalTargetId;

    // Se este jogador for um Agiota, todos os seus devedores vivos que podem votar são forçados a votar no mesmo alvo!
    const isAgiota = player.role?.name === PACT_ROLES.AGIOTA.name;
    if (isAgiota) {
      room.players.forEach(p => {
        if (p.alive && p.connected && p.debtorOf === player.id && p.canVote && !p.hangover && !p.gagged) {
          room.votes[p.id] = finalTargetId;
          p.privateLog.push(`Contrato cobrado! Você foi forçado a votar no mesmo alvo que seu Agiota (${player.nickname}).`);
        }
      });
    }

    // Auto-resolve o dia se todos os eleitores elegíveis e conectados votaram!
    const eligibleVoters = room.players.filter(p => p.alive && p.connected && p.canVote && !p.hangover && !p.gagged);
    const voteCount = Object.keys(room.votes).length;
    
    if (voteCount >= eligibleVoters.length) {
      executePactTopVoted(room);
      if (room.phase !== 'ENDED') {
        startPactNight(room);
      }
    } else {
      // Se não atingiu todos, verifica maioria absoluta instantânea!
      checkPactMajority(room);
    }

    emitPactRoom(room);
    emitPactPrivateToAll(room);
  });

  socket.on('pact_end_day', () => {
    const { room, player } = getPactRoomAndPlayer(socket.id);
    if (!room || !player?.isHost || room.phase !== 'DAY') return;
    executePactTopVoted(room);
    if (room.phase !== 'ENDED') {
      startPactNight(room);
    }
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
  // Lobisomens
  ALPHA: { name: 'O Alfa Alfaçado', faction: 'Lobisomens', team: 'wolf' },
  ILUSIONISTA: { name: 'O Lobisomem Ilusionista', faction: 'Lobisomens', team: 'wolf' },
  HIPNOTISTA: { name: 'O Lobisomem Hipnotista', faction: 'Lobisomens', team: 'wolf' },
  ACOSSADO: { name: 'O Lobisomem Acossado', faction: 'Lobisomens', team: 'wolf' },
  MIMETICO: { name: 'O Lobisomem Mimético', faction: 'Lobisomens', team: 'wolf' },
  
  // Vila de Teodoro Sampaio
  PADEIRO: { name: 'O Padeiro da Taverna', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  BENZEDEIRA: { name: 'A Benzedeira Curandeira', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  FISCAL: { name: 'O Fiscal da Prefeitura', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  COVEIRO: { name: 'O Coveiro Ladrão de Túmulos', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  FOFOQUEIRO: { name: 'O Fofoqueiro da Paróquia', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  BEATA: { name: 'A Beata Milagrosa', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  VILLAGER: { name: 'Aldeão Marcado', faction: 'Vila de Teodoro Sampaio', team: 'village' },
  
  // Neutros
  AGIOTA: { name: 'O Agiota de Teodoro', faction: 'Neutro', team: 'neutral' },
  RADIALISTA: { name: 'O Radialista da Rádio Teodoro', faction: 'Neutro', team: 'neutral' },
  PARASITE: { name: 'O Parasita Sombrio', faction: 'Neutro', team: 'neutral' }
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
    lastNightAnnounce: [],
    lastDayAnnounce: [],
    nightDisabled: false,
    radioDirective: null,
    activeSwap: null,
    winner: null
  };
}

function getPactPublicRoomState(room) {
  const isCensura = room.radioDirective === 'Censura Federal';
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
      canVote: p.canVote && !p.hangover && !p.gagged,
      gagged: p.gagged,
      hangover: p.hangover,
      debtorOf: p.debtorOf,
      revealedRole: !p.alive && (room.settings.revealDeadRoles !== false || p.purified) ? p.role?.name : null
    })),
    votes: isCensura && room.phase === 'DAY' ? {} : room.votes,
    radioDirective: room.radioDirective,
    log: room.log.slice(-8),
    winner: room.winner,
    actionsCount: Object.keys(room.actions).length,
    votedCount: Object.keys(room.votes).length,
    eligibleCount: room.players.filter(p => p.alive && p.connected && p.canVote && !p.hangover && !p.gagged).length,
    aliveCount: room.players.filter(p => p.alive).length,
    lastNightAnnounce: room.lastNightAnnounce || [],
    lastDayAnnounce: room.lastDayAnnounce || []
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
    privateLog: (player.privateLog || []).slice(-10),
    collectorKnown,
    gagged: player.gagged || false,
    hangover: player.hangover || false,
    debtorOf: player.debtorOf || null,
    debtorOfNickname: room.players.find(p => p.id === player.debtorOf)?.nickname || null,
    stolenAbility: player.stolenAbility || null,
    alphaHowlUsed: player.alphaHowlUsed || false,
    usedDirectives: player.usedDirectives || [],
    hasActed: Boolean(room.actions[player.id]),
    hasVoted: Boolean(room.votes[player.id])
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
    player.gagged = false;
    player.hangover = false;
    player.debtorOf = null;
    player.stolenAbility = null;
    player.purified = false;
    player.acossadoAttacker = null;
    player.usedDirectives = [];
    player.alphaHowlUsed = false;
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
  room.radioDirective = null;
  room.activeSwap = null;
  room.winner = null;
  room.log = [
    'A névoa desce sobre a Vila de Teodoro Sampaio, trazendo cheiro de ferro e madeira úmida.',
    'A Noite Caiu. Recolham-se aos seus pecados.'
  ];
}

function buildPactRoleList(count, settings = {}) {
  const wolfCount = Math.min(3, Math.max(1, settings.wolfCount || 1));
  
  const wolfPool = [
    PACT_ROLES.ALPHA,
    PACT_ROLES.ILUSIONISTA,
    PACT_ROLES.HIPNOTISTA,
    PACT_ROLES.ACOSSADO,
    PACT_ROLES.MIMETICO
  ];
  
  const roles = wolfPool.slice(0, wolfCount);

  if (settings.specialRoles !== false) {
    const specialsPool = [
      PACT_ROLES.PADEIRO,
      PACT_ROLES.BENZEDEIRA,
      PACT_ROLES.FISCAL,
      PACT_ROLES.COVEIRO,
      PACT_ROLES.FOFOQUEIRO,
      PACT_ROLES.BEATA,
      PACT_ROLES.AGIOTA,
      PACT_ROLES.RADIALISTA,
      PACT_ROLES.PARASITE
    ];
    
    const shuffledSpecials = shuffle([...specialsPool]);
    const maxSpecials = Math.max(0, count - roles.length - 1);
    roles.push(...shuffledSpecials.slice(0, maxSpecials));
  }

  while (roles.length < count) {
    roles.push(PACT_ROLES.VILLAGER);
  }
  return shuffle(roles);
}

function getPactMinimumPlayers(wolfCount) {
  if (wolfCount >= 3) return 8;
  if (wolfCount === 2) return 6;
  return 4;
}

function normalizePactAction(room, player, action = {}) {
  const activeRole = player.stolenAbility || player.role;
  const roleName = activeRole?.name;
  const target = room.players.find(p => p.id === action.targetId);
  const secondTarget = room.players.find(p => p.id === action.secondTargetId);
  const livingTarget = target?.alive ? target : null;

  if (room.nightDisabled) return { type: 'blocked' };
  
  // Lobisomens
  if (player.role?.team === 'wolf') {
    if (!livingTarget || livingTarget.id === player.id) return null;
    
    if (roleName === PACT_ROLES.ALPHA.name) {
      return {
        type: 'wolf_kill',
        targetId: livingTarget.id,
        howl: action.howl === true && !player.alphaHowlUsed
      };
    }
    if (roleName === PACT_ROLES.ILUSIONISTA.name) {
      return {
        type: 'ilusionista_swap',
        targetId: livingTarget.id,
        swapFirstId: action.swapFirstId || null,
        swapSecondId: action.swapSecondId || null
      };
    }
    if (roleName === PACT_ROLES.HIPNOTISTA.name) {
      return {
        type: 'hipnotista_gag',
        targetId: livingTarget.id,
        gagTargetId: action.gagTargetId || null
      };
    }
    if (roleName === PACT_ROLES.MIMETICO.name) {
      return {
        type: 'mimetico_spy',
        targetId: livingTarget.id,
        spyTargetId: action.spyTargetId || null
      };
    }
    return {
      type: 'wolf_kill',
      targetId: livingTarget.id
    };
  }
  
  // Vila e Neutros
  if (roleName === PACT_ROLES.PADEIRO.name) {
    if (!livingTarget) return null;
    return { type: 'padeiro_bread', targetId: livingTarget.id };
  }
  if (roleName === PACT_ROLES.BENZEDEIRA.name) {
    if (!livingTarget) return null;
    return { type: 'benzedeira_potion', targetId: livingTarget.id };
  }
  if (roleName === PACT_ROLES.FISCAL.name) {
    if (!livingTarget || !secondTarget?.alive || livingTarget.id === secondTarget.id) return null;
    return { type: 'fiscal_audit', targetId: livingTarget.id, secondTargetId: secondTarget.id };
  }
  if (roleName === PACT_ROLES.COVEIRO.name) {
    if (!target || target.alive) return null;
    return { type: 'coveiro_exhume', targetId: target.id };
  }
  if (roleName === PACT_ROLES.FOFOQUEIRO.name) {
    if (!livingTarget) return null;
    return { type: 'fofoqueiro_watch', targetId: livingTarget.id };
  }
  if (roleName === PACT_ROLES.BEATA.name) {
    if (!target) return null;
    return { type: 'beata_pray', targetId: target.id };
  }
  if (roleName === PACT_ROLES.AGIOTA.name) {
    if (!livingTarget) return null;
    return { type: 'agiota_loan', targetId: livingTarget.id };
  }
  if (roleName === PACT_ROLES.RADIALISTA.name) {
    if (!action.directive) return null;
    return { type: 'radialista_broadcast', directive: action.directive };
  }
  
  return { type: 'wait' };
}

function resolvePactNight(room) {
  const deaths = [];
  const dawn = [];
  const protectedIds = new Set();
  const fofoqueiroCounts = {};
  
  let wolfKillTargetId = null;
  let wolfHowl = false;
  let wolfHangover = false;
  
  let swapFirst = null;
  let swapSecond = null;
  let gagTarget = null;
  let spyTarget = null;
  
  let acossadoInvestigatorId = null;

  if (room.nightDisabled) {
    room.nightDisabled = false;
    room.phase = 'DAY';
    room.dayNumber += 1;
    room.actions = {};
    room.votes = {};
    room.log.push('A culpa coletiva sufocou a Vila de Teodoro Sampaio. Nenhum poder respondeu durante a noite.');
    return;
  }

  // 1. Contar visitas para o Fofoqueiro
  for (const [actorId, action] of Object.entries(room.actions)) {
    const actor = room.players.find(p => p.id === actorId && p.alive);
    if (!actor) continue;
    
    const targets = [
      action.targetId,
      action.secondTargetId,
      action.swapFirstId,
      action.swapSecondId,
      action.gagTargetId,
      action.spyTargetId
    ].filter(Boolean);
    
    targets.forEach(tId => {
      fofoqueiroCounts[tId] = (fofoqueiroCounts[tId] || 0) + 1;
    });
  }

  // 2. Extrair Ações de prioridade dos Lobisomens (Alvo comum e debuffs)
  const wolfActions = Object.entries(room.actions)
    .map(([playerId, action]) => ({ actor: room.players.find(p => p.id === playerId), action }))
    .filter(({ actor, action }) => actor?.alive && actor.role.team === 'wolf' && action.targetId);

  if (wolfActions.length > 0) {
    // Primeiro voto de ataque registrado pelos lobos é o definitivo
    const attackAction = wolfActions[0].action;
    wolfKillTargetId = attackAction.targetId;
    
    wolfActions.forEach(({ actor, action }) => {
      const activeRole = actor.stolenAbility || actor.role;
      if (activeRole.name === PACT_ROLES.ALPHA.name && action.howl) {
        wolfHowl = true;
        actor.alphaHowlUsed = true;
      }
      if (activeRole.name === PACT_ROLES.ILUSIONISTA.name && action.swapFirstId && action.swapSecondId) {
        swapFirst = action.swapFirstId;
        swapSecond = action.swapSecondId;
      }
      if (activeRole.name === PACT_ROLES.HIPNOTISTA.name && action.gagTargetId) {
        gagTarget = action.gagTargetId;
      }
      if (activeRole.name === PACT_ROLES.MIMETICO.name && action.spyTargetId) {
        spyTarget = action.spyTargetId;
      }
    });
  }

  // 3. Processar Ações dos Aldeões e Neutros
  for (const [actorId, action] of Object.entries(room.actions)) {
    const actor = room.players.find(p => p.id === actorId && p.alive);
    if (!actor) continue;
    
    const activeRole = actor.stolenAbility || actor.role;
    const roleName = activeRole?.name;
    const target = room.players.find(p => p.id === action.targetId);
    const secondTarget = room.players.find(p => p.id === action.secondTargetId);

    // RADIALISTA
    if (roleName === PACT_ROLES.RADIALISTA.name && action.type === 'radialista_broadcast') {
      room.radioDirective = action.directive;
      actor.usedDirectives = actor.usedDirectives || [];
      if (!actor.usedDirectives.includes(action.directive)) {
        actor.usedDirectives.push(action.directive);
      }
      actor.privateLog.push(`Teoria veiculada com sucesso: ${action.directive}`);
    }

    // PADEIRO
    if (roleName === PACT_ROLES.PADEIRO.name && target) {
      protectedIds.add(target.id);
      target.hangover = true;
      actor.privateLog.push(`Você serviu pão com cachaça para ${target.nickname}. Ele está protegido da morte, mas com ressaca amanhã.`);
      if (target.role?.team === 'wolf') {
        wolfHangover = true;
      }
    }

    // BENZEDEIRA
    if (roleName === PACT_ROLES.BENZEDEIRA.name && target) {
      if (target.role?.team === 'wolf') {
        actor.privateLog.push(`Sua Garrafada ferveu! ${target.nickname} é um Lobisomem.`);
        if (target.role.name === PACT_ROLES.ACOSSADO.name) {
          acossadoInvestigatorId = actorId;
        }
      } else {
        actor.privateLog.push(`Sua Garrafada permaneceu calma. ${target.nickname} é da Vila/Neutro.`);
        target.hangover = false;
        target.gagged = false;
        target.privateLog.push(`A Benzedeira orou por você e limpou todos os seus males (ressaca/mordaça).`);
      }
    }

    // AGIOTA
    if (roleName === PACT_ROLES.AGIOTA.name && target) {
      protectedIds.add(target.id);
      target.debtorOf = actor.id;
      actor.privateLog.push(`Você deu proteção financeira para ${target.nickname}. Amanhã ele deve te seguir.`);
    }

    // BEATA
    if (roleName === PACT_ROLES.BEATA.name && target) {
      if (target.alive) {
        protectedIds.add(target.id);
        actor.privateLog.push(`Oração focada em ${target.nickname}. Ele está protegido de ataques esta noite.`);
      } else {
        target.purified = true;
        actor.privateLog.push(`Alma de ${target.nickname} purificada. Classe revelada pela capela.`);
      }
    }

    // FISCAL
    if (roleName === PACT_ROLES.FISCAL.name && target && secondTarget) {
      const same = target.role?.team === secondTarget.role?.team;
      actor.privateLog.push(`Auditoria Concluída: ${target.nickname} e ${secondTarget.nickname} pertencem a ${same ? 'no mínimo à MESMA facção' : 'facções DIFERENTES'}.`);
      if (target.role?.name === PACT_ROLES.ACOSSADO.name || secondTarget.role?.name === PACT_ROLES.ACOSSADO.name) {
        acossadoInvestigatorId = actorId;
      }
    }

    // FOFOQUEIRO
    if (roleName === PACT_ROLES.FOFOQUEIRO.name && target) {
      const visits = fofoqueiroCounts[target.id] || 0;
      actor.privateLog.push(`Fofoca do dia: A casa de ${target.nickname} recebeu exatamente ${visits} visitas esta noite.`);
      if (target.role?.name === PACT_ROLES.ACOSSADO.name) {
        acossadoInvestigatorId = actorId;
      }
    }

    // COVEIRO (Necro)
    if (roleName === PACT_ROLES.COVEIRO.name && target && !target.alive) {
      actor.stolenAbility = target.role;
      actor.privateLog.push(`Túmulo de ${target.nickname} profanado. Você roubou os poderes da classe ${target.role.name} para a próxima noite!`);
    }
  }

  // 4. Processar Lobisomem Acossado
  if (acossadoInvestigatorId) {
    const acossado = room.players.find(p => p.alive && p.role?.name === PACT_ROLES.ACOSSADO.name);
    const investigator = room.players.find(p => p.id === acossadoInvestigatorId);
    if (acossado && investigator) {
      acossado.acossadoAttacker = investigator.id;
      acossado.privateLog.push(`Atenção! Você percebeu que ${investigator.nickname} te investigou hoje. Amanhã seu voto contra ele terá peso duplo!`);
    }
  }

  // 5. Aplicar Debuffs dos Lobos
  if (swapFirst && swapSecond) {
    const p1 = room.players.find(p => p.id === swapFirst && p.alive);
    const p2 = room.players.find(p => p.id === swapSecond && p.alive);
    if (p1 && p2) {
      room.activeSwap = { a: p1.id, b: p2.id };
    }
  }

  if (gagTarget) {
    const target = room.players.find(p => p.id === gagTarget && p.alive);
    if (target) {
      target.gagged = true;
      target.privateLog.push(`Uivo da Hipnose! Você está amordaçado pelo pânico hoje e seu voto vale 0.`);
    }
  }

  // 6. Ataque dos Lobisomens
  if (wolfKillTargetId) {
    const target = room.players.find(p => p.id === wolfKillTargetId && p.alive);
    if (target) {
      if (wolfHangover) {
        dawn.push('Um uivo dolorido de estômago ecoou na noite. Os lobos pareciam empanturrados de ressaca, e ninguém caiu.');
      } else if (protectedIds.has(target.id)) {
        dawn.push(`Marcas de garras rasgaram a porta de ${target.nickname}, mas algo sagrado/profano o manteve em pé esta noite.`);
      } else {
        target.alive = false;
        deaths.push(target);
        dawn.push(`${target.nickname} foi encontrado sob o luar frio. O silêncio tomou sua casa.`);
        
        // Se a vítima tinha o Uivo da Demência marcado nela:
        if (wolfHowl) {
          target.selfVoteTrap = true;
        }
      }
    }
  } else {
    dawn.push('A noite passou gelada, arranhando os telhados de Teodoro Sampaio. Ninguém caiu.');
  }

  // Se o Mimético espionou um investigador ativo, transmite o log privado dele para o lobo
  if (spyTarget) {
    const spy = room.players.find(p => p.alive && p.role?.name === PACT_ROLES.MIMETICO.name);
    const victim = room.players.find(p => p.id === spyTarget && p.alive);
    if (spy && victim) {
      const report = victim.privateLog[victim.privateLog.length - 1];
      if (report) {
        spy.privateLog.push(`[MIMETISMO] Cópia do relatório de ${victim.nickname}: "${report}"`);
      }
    }
  }

  // 7. Agendar amanhecer e checar vitória
  handleParasiteNightDeaths(room, deaths);
  room.lastNightDeaths = deaths.map(p => p.id);
  room.phase = 'DAY';
  room.dayNumber += 1;
  room.actions = {};
  room.votes = {};
  room.lastNightAnnounce = [...dawn];
  room.lastDayAnnounce = [];
  
  if (room.radioDirective) {
    room.log.push(`Amanhecer ${room.dayNumber}. Transmissão AM da Rádio Teodoro: "${room.radioDirective}" ativa hoje!`, ...dawn);
  } else {
    room.log.push(`Amanhecer ${room.dayNumber}.`, ...dawn);
  }
  
  checkPactWin(room);
}

function checkPactMajority(room) {
  if (room.radioDirective === 'Fake News') return; // Sem maioria automática no Fake News
  
  const eligible = room.players.filter(p => p.alive && p.canVote && !p.hangover && !p.gagged);
  const needed = Math.floor(eligible.length / 2) + 1;
  const counts = countVotes(room);
  const majority = Object.entries(counts).find(([, count]) => count >= needed);
  if (majority) {
    executePactPlayer(room, majority[0]);
    if (room.phase !== 'ENDED') {
      startPactNight(room);
    }
  }
}

function executePactTopVoted(room) {
  room.lastDayAnnounce = [];
  room.lastNightAnnounce = [];

  if (room.radioDirective === 'Lei Seca') {
    const msg = 'A Lei Seca da Rádio Teodoro silenciou a forca hoje. Nenhum enforcamento ocorreu.';
    room.log.push(msg);
    room.lastDayAnnounce = [msg];
    room.votes = {};
    return checkPactWin(room);
  }
  
  const counts = countVotes(room);
  
  if (room.radioDirective === 'Fake News') {
    // Julgamento reverso (menor quantidade de votos, mas mínimo de 1)
    const eligible = room.players.filter(p => p.alive && counts[p.id] > 0);
    if (eligible.length === 0) {
      const msg = 'A rádio transmitiu Fake News, mas ninguém recebeu votos hoje.';
      room.log.push(msg);
      room.lastDayAnnounce = [msg];
      room.votes = {};
      return checkPactWin(room);
    }
    const sorted = eligible.sort((a, b) => counts[a.id] - counts[b.id]);
    const victim = sorted[0];
    const msg = `Fake News! A Vila enforcou o menos votado hoje.`;
    room.log.push(msg);
    room.lastDayAnnounce = [msg];
    executePactPlayer(room, victim.id);
    return;
  }
  
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) {
    const msg = 'O dia morreu sem consenso. A forca permaneceu vazia.';
    room.log.push(msg);
    room.lastDayAnnounce = [msg];
    return checkPactWin(room);
  }
  executePactPlayer(room, top[0]);
}

function countVotes(room) {
  const rawVotes = Object.entries(room.votes).reduce((acc, [voterId, targetId]) => {
    const voter = room.players.find(p => p.id === voterId);
    if (voter && voter.alive && !voter.hangover && !voter.gagged) {
      acc[targetId] = (acc[targetId] || 0) + 1;
    }
    return acc;
  }, {});

  // Ilusionista Swap
  if (room.activeSwap) {
    const { a, b } = room.activeSwap;
    const valA = rawVotes[a] || 0;
    const valB = rawVotes[b] || 0;
    
    const swapped = { ...rawVotes };
    if (valA > 0 || valB > 0) {
      swapped[a] = valB;
      swapped[b] = valA;
    }
    return swapped;
  }

  return rawVotes;
}

function executePactPlayer(room, targetId) {
  const target = room.players.find(p => p.id === targetId && p.alive);
  if (!target) return;
  
  target.alive = false;
  room.votes = {};
  
  const msg = room.settings.revealDeadRoles !== false || target.purified
    ? `${target.nickname} foi levado ao julgamento. A corda revelou: ${target.role.name}.`
    : `${target.nickname} foi levado ao julgamento. A corda ocultou sua classe.`;
  room.log.push(msg);
  
  room.lastDayAnnounce = room.lastDayAnnounce || [];
  if (!room.lastDayAnnounce.includes(msg)) {
    room.lastDayAnnounce.push(msg);
  }
  room.lastNightAnnounce = [];

  // Parasita Sombrio victory condition
  const parasite = room.players.find(p => p.alive && p.role?.name === PACT_ROLES.PARASITE.name);
  if (parasite?.parasiteHostId === target.id) {
    room.phase = 'ENDED';
    room.winner = { 
      faction: 'O Parasita Sombrio', 
      text: `${parasite.nickname} venceu sozinho! A Vila enforcou seu hospedeiro e o parasita espalhou sua sombra.` 
    };
    return;
  }
  
  checkPactWin(room);
}

function handleParasiteNightDeaths(room, deaths) {
  const parasite = room.players.find(p => p.alive && p.role?.name === PACT_ROLES.PARASITE.name);
  if (parasite && deaths.some(dead => dead.id === parasite.parasiteHostId)) {
    parasite.alive = false;
    room.log.push(`O Parasita Sombrio (${parasite.nickname}) se esvaiu no ar junto de seu hospedeiro morto.`);
  }
}

function checkPactWin(room) {
  if (room.phase === 'ENDED') return;
  const alive = room.players.filter(p => p.alive);
  
  // 1. Agiota victory condition (3 devedores vivos ao mesmo tempo)
  const agiota = alive.find(p => p.role?.name === PACT_ROLES.AGIOTA.name);
  if (agiota) {
    const activeDebtors = alive.filter(p => p.debtorOf === agiota.id);
    if (activeDebtors.length >= 3) {
      room.phase = 'ENDED';
      room.winner = { 
        faction: 'O Agiota de Teodoro', 
        text: `${agiota.nickname} cobrou suas promissórias de sangue de 3 moradores vivos e fugiu vitorioso de Teodoro Sampaio!` 
      };
      return;
    }
  }

  // 2. Radialista victory condition (3 teorias veiculadas com sucesso)
  const radialista = alive.find(p => p.role?.name === PACT_ROLES.RADIALISTA.name);
  if (radialista && radialista.usedDirectives && radialista.usedDirectives.length >= 3) {
    room.phase = 'ENDED';
    room.winner = { 
      faction: 'O Radialista da Rádio Teodoro', 
      text: `${radialista.nickname} completou 3 irradiações de fake news na vila e venceu sozinho!` 
    };
    return;
  }

  // 3. Fações Padrão
  const wolves = alive.filter(p => p.role?.team === 'wolf');
  const villagers = alive.filter(p => p.role?.team === 'village');

  if (wolves.length === 0) {
    room.phase = 'ENDED';
    room.winner = { faction: 'Vila de Teodoro Sampaio', text: 'Os sobreviventes baniram o pavor sob a lua cheia em Teodoro Sampaio.' };
    return;
  }
  if (wolves.length >= villagers.length) {
    room.phase = 'ENDED';
    room.winner = { faction: 'Lobisomens', text: 'A matilha dominou a Vila de Teodoro Sampaio.' };
  }
}

function startPactNight(room) {
  room.phase = 'NIGHT';
  room.nightNumber += 1;
  room.actions = {};
  room.votes = {};
  room.radioDirective = null;
  room.activeSwap = null;
  
  room.players.forEach(p => {
    p.selfVoteTrap = false;
    p.gagged = false;
    p.hangover = false;
    p.debtorOf = null;
    p.acossadoAttacker = null;
    if (p.alive) p.canVote = true;
  });
  
  room.log.push(`Noite ${room.nightNumber}. A Vila recolhe as luzes e expõe os próprios pecados.`);
}

function resetPactRoom(room) {
  room.phase = 'LOBBY';
  room.dayNumber = 0;
  room.nightNumber = 0;
  room.actions = {};
  room.votes = {};
  room.radioDirective = null;
  room.activeSwap = null;
  room.winner = null;
  room.lastNightDeaths = [];
  room.lastNightAnnounce = [];
  room.lastDayAnnounce = [];
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
    
    // Auto-resolve night or day when a player disconnects!
    if (room.phase === 'NIGHT') {
      const livingPlayers = room.players.filter(p => p.alive && p.connected);
      const actionCount = Object.keys(room.actions).length;
      if (actionCount >= livingPlayers.length && livingPlayers.length > 0) {
        resolvePactNight(room);
      }
    } else if (room.phase === 'DAY') {
      const eligibleVoters = room.players.filter(p => p.alive && p.connected && p.canVote && !p.hangover && !p.gagged);
      const voteCount = Object.keys(room.votes).length;
      if (voteCount >= eligibleVoters.length && eligibleVoters.length > 0) {
        executePactTopVoted(room);
        if (room.phase !== 'ENDED') {
          startPactNight(room);
        }
      } else {
        checkPactMajority(room);
      }
    }
    
    emitPactRoom(room);
    emitPactPrivateToAll(room);
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

  room.players.forEach(p => {
    p.isReady = false;
    p.role = null;
    p.word = null;
  });

  room.players = room.players.filter(p => p.connected);

  io.to(room.id).emit('discussion_ended');
  io.to(room.id).emit('room_state', getPublicRoomState(room));
  console.log(`Sala ${room.id} retornou ao lobby.`);
}

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

function handlePlayerExit(socket, isDisconnect = false) {
  const { room, player } = getRoomAndPlayer(socket.id);
  if (!room || !player) return;

  const roomId = room.id;

  if (isDisconnect && room.gameState !== 'LOBBY') {
    player.connected = false;
    io.to(roomId).emit('room_state', getPublicRoomState(room));
    console.log(`Jogador ${player.nickname} desconectou temporariamente da sala ${roomId}`);
    return;
  }

  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(roomId);

  const activePlayers = room.players.filter(p => p.connected);
  if (activePlayers.length === 0) {
    if (room.discussionTimeoutId) {
      clearTimeout(room.discussionTimeoutId);
    }
    rooms.delete(roomId);
    console.log(`Sala ${roomId} vazia e removida.`);
    return;
  }

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

function getRoomAndPlayer(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === socketId);
    if (player) {
      return { room, player };
    }
  }
  return { room: null, player: null };
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

