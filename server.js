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

// Função auxiliar para gerar código de sala aleatório (4 letras maiúsculas)
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  do {
    result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(result)); // Garante que é único
  return result;
}

// Retorna uma versão segura do estado da sala para transmissão pública
// Esconde papéis e palavras secretas dos jogadores
function getPublicRoomState(room) {
  const state = {
    id: room.id,
    gameState: room.gameState,
    settings: room.settings,
    prepEndTime: room.prepEndTime,
    viewingEndTime: room.viewingEndTime,
    discussionEndTime: room.discussionEndTime,
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

  // Ao iniciar a discussão, revela a identidade de todos para o painel de debriefing
  if (room.gameState === 'DISCUSSION') {
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
        
        // Envia as informações privadas do jogador novamente
        socket.emit('game_started', {
          role: existingPlayer.role,
          word: existingPlayer.word,
          category: room.currentWords.category
        });
        
        if (room.gameState === 'DISCUSSION') {
          socket.emit('discussion_started', { endTime: room.discussionEndTime });
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
            // Envia de forma privada para cada jogador
            io.to(p.id).emit('game_started', {
              role: p.role,
              word: p.word,
              category: currentRoom.currentWords.category
            });
          }
        });

        // Transiciona para JOGANDO e estabelece o cronômetro de 15 segundos para visualização
        currentRoom.gameState = 'PLAYING';
        currentRoom.viewingEndTime = Date.now() + 15000;

        io.to(currentRoom.id).emit('room_state', getPublicRoomState(currentRoom));
        console.log(`Jogo iniciado na sala ${currentRoom.id}. Categoria: ${wordPair.category}. 15s para memorização.`);
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

      io.to(room.id).emit('discussion_started', { endTime: room.discussionEndTime });
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

  // 7. VOLTAR PARA O LOBBY (APENAS HOST)
  socket.on('end_discussion', () => {
    const { room, player } = getRoomAndPlayer(socket.id);
    if (!room || !player || !player.isHost) return;

    if (room.gameState === 'DISCUSSION' || room.gameState === 'PLAYING') {
      resetRoomToLobby(room);
    }
  });

  // 8. JOGADOR SAI DA SALA VOLUNTARIAMENTE
  socket.on('leave_room', () => {
    handlePlayerExit(socket);
  });

  // 9. DESCONEXÃO DO SOCKET
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    handlePlayerExit(socket, true); // true indica desconexão involuntária
  });
});

// Reseta a sala de volta ao Lobby
function resetRoomToLobby(room) {
  if (room.discussionTimeoutId) {
    clearTimeout(room.discussionTimeoutId);
    room.discussionTimeoutId = null;
  }

  room.gameState = 'LOBBY';
  room.discussionEndTime = null;
  room.currentWords = { civilian: '', impostor: '', category: '' };

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

// Encerramento automático quando o timer de discussão zera
function autoEndDiscussion(roomId) {
  const room = rooms.get(roomId);
  if (room && room.gameState === 'DISCUSSION') {
    resetRoomToLobby(room);
  }
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
