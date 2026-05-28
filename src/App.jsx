import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Conecta ao servidor Express (porta 3000 em dev, mesma porta em produção)
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;
let socket;

export default function App() {
  // Estados da aplicação
  const [nickname, setNickname] = useState(() => localStorage.getItem('impostor_nickname') || '');
  const [inputRoomId, setInputRoomId] = useState('');
  const [roomId, setRoomId] = useState(null);
  
  const [roomState, setRoomState] = useState(null);
  const [privateGameState, setPrivateGameState] = useState(null); // { role, word, category }
  
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [cardRevealed, setCardRevealed] = useState(false);
  
  // Estado para o timer local da discussão
  const [timeLeft, setTimeLeft] = useState(0);
  const timerIntervalRef = useRef(null);

  // Inicializar o socket uma única vez
  useEffect(() => {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true
    });

    // Ouvintes globais de socket
    socket.on('connect', () => {
      console.log('Conectado ao servidor de sockets');
    });

    socket.on('room_created', (code) => {
      setRoomId(code);
      setErrorMsg(null);
    });

    socket.on('room_state', (state) => {
      setRoomState(state);
      setRoomId(state.id);
      
      // Se voltarmos para o lobby, limpa o papel privado e revelação
      if (state.gameState === 'LOBBY') {
        setPrivateGameState(null);
        setCardRevealed(false);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      }
    });

    socket.on('game_started', (privateData) => {
      setPrivateGameState(privateData);
      setCardRevealed(false); // Garante que começa fechado (por privacidade)
    });

    socket.on('discussion_started', ({ endTime }) => {
      startLocalTimer(endTime);
    });

    socket.on('discussion_ended', () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      setTimeLeft(0);
    });

    socket.on('error_message', (msg) => {
      setErrorMsg(msg);
      // Auto-oculta o erro após 4 segundos
      setTimeout(() => {
        setErrorMsg((current) => current === msg ? null : current);
      }, 4000);
    });

    return () => {
      socket.off('connect');
      socket.off('room_created');
      socket.off('room_state');
      socket.off('game_started');
      socket.off('discussion_started');
      socket.off('discussion_ended');
      socket.off('error_message');
      socket.disconnect();
    };
  }, []);

  // Persistir apelido localmente ao alterar
  const handleNicknameChange = (val) => {
    setNickname(val);
    localStorage.setItem('impostor_nickname', val);
  };

  // Temporizador sincronizado localmente com o timestamp do servidor
  const startLocalTimer = (endTime) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const updateTimer = () => {
      const remainingMs = endTime - Date.now();
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remainingSecs);

      if (remainingSecs <= 0) {
        clearInterval(timerIntervalRef.current);
      }
    };

    updateTimer(); // Executa imediatamente a primeira vez
    timerIntervalRef.current = setInterval(updateTimer, 500);
  };

  // 🧬 AÇÕES DO JOGADOR
  
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      return setErrorMsg('Por favor, escolha um apelido.');
    }
    socket.emit('create_room', { nickname });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      return setErrorMsg('Por favor, escolha um apelido.');
    }
    if (!inputRoomId.trim()) {
      return setErrorMsg('Por favor, digite o código da sala.');
    }
    socket.emit('join_room', {
      roomId: inputRoomId.toUpperCase().trim(),
      nickname
    });
  };

  const handleToggleReady = () => {
    socket.emit('toggle_ready');
  };

  const handleLeaveRoom = () => {
    socket.emit('leave_room');
    setRoomId(null);
    setRoomState(null);
    setPrivateGameState(null);
    setCardRevealed(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
  };

  // ⚙️ AÇÕES DO HOST
  
  const handleUpdateSettings = (settingsPatch) => {
    if (!roomState) return;
    const current = roomState.settings;
    socket.emit('update_settings', {
      impostorsCount: settingsPatch.impostorsCount !== undefined ? settingsPatch.impostorsCount : current.impostorsCount,
      timerDuration: settingsPatch.timerDuration !== undefined ? settingsPatch.timerDuration : current.timerDuration,
      category: settingsPatch.category !== undefined ? settingsPatch.category : current.category
    });
  };

  const handleStartGame = () => {
    socket.emit('start_game');
  };

  const handleTriggerDiscussion = () => {
    socket.emit('trigger_discussion');
  };

  const handleEndDiscussion = () => {
    socket.emit('end_discussion');
  };

  // 📋 UTILITÁRIOS
  
  const copyRoomCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Identifica jogador local nas listas
  const me = roomState?.players.find(p => p.id === socket?.id);
  const activePlayers = roomState?.players.filter(p => p.connected) || [];
  const isHost = me?.isHost || false;

  // Renderização condicional por tela
  return (
    <div className="app-container">
      {/* Pop-up de erro global */}
      {errorMsg && (
        <div className="error-popup">
          <span>⚠️ {errorMsg}</span>
          <button className="error-close-btn" onClick={() => setErrorMsg(null)}>×</button>
        </div>
      )}

      {/* TELA 1: TELA INICIAL (Criar / Entrar) */}
      {!roomId && (
        <div className="welcome-screen glass-panel">
          <div className="logo-container">
            <div className="logo-icon">🕵️‍♂️</div>
            <h1>IMPOSTOR</h1>
            <p>Descubra o espião no debate da vida real</p>
          </div>

          <form onSubmit={handleCreateRoom}>
            <div className="glass-input-group">
              <label htmlFor="nickname">Seu Apelido</label>
              <input
                id="nickname"
                type="text"
                placeholder="Ex: Felipe"
                maxLength={15}
                className="glass-input"
                value={nickname}
                onChange={(e) => handleNicknameChange(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">
              🆕 Criar Nova Sala
            </button>
          </form>

          <div className="divider">ou</div>

          <form onSubmit={handleJoinRoom}>
            <div className="glass-input-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="room-code">Código da Sala</label>
              <input
                id="room-code"
                type="text"
                placeholder="Ex: ABCD"
                maxLength={4}
                className="glass-input"
                style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.2em' }}
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              🔌 Entrar na Partida
            </button>
          </form>
        </div>
      )}

      {/* TELA 2: LOBBY (Sala de Espera) */}
      {roomId && roomState && roomState.gameState === 'LOBBY' && (
        <div className="lobby-screen glass-panel">
          <div className="room-header">
            <div>
              <p style={{ margin: 0, fontSize: '0.8rem', textAlign: 'left' }}>SALA ONLINE</p>
              <h2 style={{ margin: 0, textAlign: 'left' }}>Aguardando...</h2>
            </div>
            <div className="room-code-badge" onClick={copyRoomCode}>
              <span className="room-code-text">{roomId}</span>
              <span className="room-code-copy-icon">{copiedCode ? '✅ Copiado' : '📋 Copiar'}</span>
            </div>
          </div>

          {/* Configurações (Apenas para o Host ver e alterar, outros veem travado) */}
          <div className="settings-section">
            <span className="settings-section-title">⚙️ Ajustes da Partida</span>
            <div className="settings-grid">
              <div className="setting-item-inline">
                <label>Impostores</label>
                <select
                  disabled={!isHost}
                  className="setting-input-small glass-select"
                  value={roomState.settings.impostorsCount}
                  onChange={(e) => handleUpdateSettings({ impostorsCount: parseInt(e.target.value) })}
                >
                  <option value={1}>1 Impostor</option>
                  <option value={2}>2 Impostores</option>
                  <option value={3}>3 Impostores</option>
                </select>
              </div>

              <div className="setting-item-inline">
                <label>Timer Discussão</label>
                <select
                  disabled={!isHost}
                  className="setting-input-small glass-select"
                  value={roomState.settings.timerDuration}
                  onChange={(e) => handleUpdateSettings({ timerDuration: parseInt(e.target.value) })}
                >
                  <option value={60}>1 minuto</option>
                  <option value={120}>2 minutos</option>
                  <option value={180}>3 minutos</option>
                  <option value={240}>4 minutos</option>
                  <option value={300}>5 minutos</option>
                </select>
              </div>

              <div className="setting-item-inline" style={{ gridColumn: 'span 2' }}>
                <label>Tema das Palavras</label>
                <select
                  disabled={!isHost}
                  className="setting-input-small glass-select"
                  value={roomState.settings.category}
                  onChange={(e) => handleUpdateSettings({ category: e.target.value })}
                >
                  {roomState.availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Lista de Jogadores */}
          <div className="players-container">
            <div className="players-title-row">
              <span className="settings-section-title" style={{ margin: 0 }}>👥 Jogadores</span>
              <span className="players-count">{activePlayers.length}/20</span>
            </div>
            <div className="players-list">
              {roomState.players.map((p) => {
                const isMe = p.id === socket?.id;
                const initials = p.nickname.slice(0, 2).toUpperCase();
                return (
                  <div key={p.id} className="player-item">
                    <div className="player-info">
                      <div className={`player-avatar ${p.isHost ? 'is-host' : ''} ${isMe ? 'is-me' : ''}`}>
                        {p.isHost ? '👑' : initials}
                      </div>
                      <span className={`player-name ${isMe ? 'is-me' : ''}`}>
                        {p.nickname} {isMe && '(Você)'}
                      </span>
                    </div>
                    <div className="player-badges">
                      {!p.connected ? (
                        <span className="badge badge-disconnected">Offline</span>
                      ) : p.isHost ? (
                        <span className="badge badge-host">Dono</span>
                      ) : p.isReady ? (
                        <span className="badge badge-ready">Pronto</span>
                      ) : (
                        <span className="badge badge-not-ready">Esperando</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.5rem' }}>
            {!isHost ? (
              <button
                onClick={handleToggleReady}
                className={`btn ${me?.isReady ? 'btn-glass' : 'btn-primary'}`}
              >
                {me?.isReady ? '❌ Cancelar Pronto' : '👍 Ficar PRONTO'}
              </button>
            ) : (
              <button
                onClick={handleStartGame}
                disabled={activePlayers.length < roomState.settings.impostorsCount + 2 || !activePlayers.every(p => p.isHost || p.isReady)}
                className="btn btn-primary"
              >
                🎮 Iniciar Partida
              </button>
            )}
            
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              🚪 Sair da Sala
            </button>

            {isHost && activePlayers.length < roomState.settings.impostorsCount + 2 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-accent)', margin: 0, textAlign: 'center' }}>
                * Mínimo de {roomState.settings.impostorsCount + 2} jogadores para iniciar com {roomState.settings.impostorsCount} impostor(es).
              </p>
            )}
            {isHost && activePlayers.length >= roomState.settings.impostorsCount + 2 && !activePlayers.every(p => p.isHost || p.isReady) && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                * Aguardando todos os jogadores ficarem "Pronto" para iniciar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TELA 3: PLAYING (Em Partida - Debates na Vida Real) */}
      {roomId && roomState && roomState.gameState === 'PLAYING' && privateGameState && (
        <div className="gameplay-screen glass-panel">
          <div className="game-header">
            <span className="category-badge">📂 {privateGameState.category}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fase Vida Real</span>
          </div>

          <div style={{ margin: '0.5rem 0' }}>
            <h2 style={{ marginBottom: '0.3rem' }}>Sua Palavra Secreta</h2>
            <p>Toque no card para revelar com segurança. Não deixe os outros verem!</p>
          </div>

          {/* Privacy Shield Card */}
          <div
            className={`privacy-card ${cardRevealed ? 'is-revealed' : ''}`}
            onClick={() => setCardRevealed(!cardRevealed)}
          >
            <div className="privacy-card-inner">
              {/* Frente do Card */}
              <div className="privacy-card-front">
                <div className="shield-icon-container">🕵️‍♂️</div>
                <span className="shield-title">Toque para Revelar</span>
                <span className="shield-subtitle">Esconda a tela de vizinhos xeretas antes de tocar</span>
              </div>

              {/* Verso do Card (Revelado) */}
              <div className={`privacy-card-back ${privateGameState.role === 'impostor' ? 'is-impostor' : ''}`}>
                <span className={`role-badge-large ${privateGameState.role === 'impostor' ? 'impostor' : 'civilian'}`}>
                  {privateGameState.role === 'impostor' ? '⚡ VOCÊ É O IMPOSTOR' : '👥 VOCÊ É CIVIL'}
                </span>
                
                <span className={`secret-word-display ${privateGameState.role === 'impostor' ? 'is-impostor' : ''}`}>
                  {privateGameState.word}
                </span>

                <span className="reveal-tip">Toque para esconder novamente</span>
              </div>
            </div>
          </div>

          {/* Info de Jogadores na partida */}
          <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.15)', padding: '0.8rem 1rem', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              👥 Sobreviventes na Sala ({activePlayers.length})
            </span>
            <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {activePlayers.map(p => p.nickname).join(', ')}
            </p>
          </div>

          {/* Botões do Gameplay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {isHost ? (
              <button onClick={handleTriggerDiscussion} className="btn btn-accent">
                📢 Encerrar Partida e Discutir
              </button>
            ) : (
              <div className="btn btn-glass" style={{ cursor: 'default' }}>
                ⏳ Aguardando dono iniciar discussão
              </div>
            )}
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              🚪 Sair do Jogo
            </button>
          </div>
        </div>
      )}

      {/* TELA 4: DISCUSSION (Debate / Timer de Votação) */}
      {roomId && roomState && roomState.gameState === 'DISCUSSION' && (
        <div className="discussion-screen glass-panel">
          <div className="game-header">
            <span className="category-badge" style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}>🔥 DEBATE ATIVO</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Quem é o Impostor?</span>
          </div>

          <div style={{ margin: '0.5rem 0' }}>
            <h2 style={{ marginBottom: '0.2rem' }}>Tempo de Discussão</h2>
            <p>Debatam na vida real quem é o Impostor antes do timer expirar!</p>
          </div>

          {/* Timer Progressivo Circular */}
          <div className="timer-wrapper">
            <div className={`timer-radial ${timeLeft <= 15 ? 'is-warning' : ''}`}>
              {/* Círculo SVG de progresso */}
              <svg className="timer-svg">
                <circle className="timer-svg-circle-bg" cx="90" cy="90" r="82" />
                <circle
                  className={`timer-svg-circle-progress ${timeLeft <= 15 ? 'is-warning' : ''}`}
                  cx="90"
                  cy="90"
                  r="82"
                  strokeDasharray={2 * Math.PI * 82}
                  strokeDashoffset={
                    roomState.settings.timerDuration > 0
                      ? (2 * Math.PI * 82) * (1 - timeLeft / roomState.settings.timerDuration)
                      : 0
                  }
                />
              </svg>

              {/* Exibição Numérica */}
              <span className={`timer-numeric-display ${timeLeft <= 15 ? 'is-warning' : ''}`}>
                {formatTime(timeLeft)}
              </span>
              <span className="timer-label">Restantes</span>
            </div>
          </div>

          {/* Dica de Jogo */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.8rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            💡 <strong>Regra do Jogo:</strong> Se você acha que é o Impostor, tente deduzir a palavra dos Civis! Ao final do debate, votem e revelem seus papéis na vida real.
          </div>

          {/* Botões da Discussão */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {isHost && (
              <button onClick={handleEndDiscussion} className="btn btn-primary">
                ⏭️ Pular Timer e ir ao Lobby
              </button>
            )}
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              🚪 Sair do Jogo
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="app-footer">
        Desenvolvido com ❤️ | Impostorgamefipp
      </footer>
    </div>
  );
}
