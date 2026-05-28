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
  
  // Timers da aplicação
  const [timeLeft, setTimeLeft] = useState(0);              // Timer de Discussão
  const [prepTimeLeft, setPrepTimeLeft] = useState(0);      // Timer de Preparação (5s)
  const [viewingTimeLeft, setViewingTimeLeft] = useState(0);  // Timer de Visualização (15s)
  
  const timerIntervalRef = useRef(null);
  const prepIntervalRef = useRef(null);
  const viewingIntervalRef = useRef(null);

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
      
      // Se voltarmos para o lobby, limpa os papéis privados e revelações
      if (state.gameState === 'LOBBY') {
        setPrivateGameState(null);
        setCardRevealed(false);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
        if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
        setTimeLeft(0);
        setPrepTimeLeft(0);
        setViewingTimeLeft(0);
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

  // Efeito reativo para sincronizar e rodar os cronômetros de Preparação e Visualização
  useEffect(() => {
    if (!roomState) {
      setPrepTimeLeft(0);
      setViewingTimeLeft(0);
      return;
    }

    // 1. GERENCIAR CRONÔMETRO DE PREPARAÇÃO (5 segundos)
    if (roomState.gameState === 'PREPARING' && roomState.prepEndTime) {
      if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
      
      const updatePrep = () => {
        const diff = roomState.prepEndTime - Date.now();
        const secs = Math.max(0, Math.ceil(diff / 1000));
        setPrepTimeLeft(secs);
        if (secs <= 0) {
          clearInterval(prepIntervalRef.current);
        }
      };
      updatePrep();
      prepIntervalRef.current = setInterval(updatePrep, 250);
    } else {
      if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
      setPrepTimeLeft(0);
    }

    // 2. GERENCIAR CRONÔMETRO DE VISUALIZAÇÃO (15 segundos)
    if (roomState.gameState === 'PLAYING' && roomState.viewingEndTime) {
      if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
      
      const updateViewing = () => {
        const diff = roomState.viewingEndTime - Date.now();
        const secs = Math.max(0, Math.ceil(diff / 1000));
        setViewingTimeLeft(secs);
        if (secs <= 0) {
          clearInterval(viewingIntervalRef.current);
        }
      };
      updateViewing();
      viewingIntervalRef.current = setInterval(updateViewing, 250);
    } else {
      if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
      setViewingTimeLeft(0);
    }

    return () => {
      if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
      if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
    };
  }, [roomState]);

  // Persistir apelido localmente ao alterar
  const handleNicknameChange = (val) => {
    setNickname(val);
    localStorage.setItem('impostor_nickname', val);
  };

  // Temporizador sincronizado localmente com o timestamp do servidor para a Discussão
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
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
    if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
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
              <p style={{ margin: 0, fontSize: '0.75rem', textAlign: 'left', color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>SALA ONLINE</p>
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
              <p style={{ fontSize: '0.8rem', color: 'var(--neon-pink)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                * Mínimo de {roomState.settings.impostorsCount + 2} jogadores para iniciar com {roomState.settings.impostorsCount} impostor(es).
              </p>
            )}
            {isHost && activePlayers.length >= roomState.settings.impostorsCount + 2 && !activePlayers.every(p => p.isHost || p.isReady) && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-sec)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                * Aguardando todos os jogadores ficarem "Pronto" para iniciar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TELA 3: PREPARING (5s de Contagem Regressiva de Segurança) */}
      {roomId && roomState && roomState.gameState === 'PREPARING' && (
        <div className="glass-panel welcome-screen" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="category-badge" style={{ fontSize: '0.75rem', borderColor: 'var(--neon-purple)', color: 'var(--neon-purple)' }}>🛰️ AGENDANDO INÍCIO</span>
          <h2 style={{ fontSize: '1.6rem', marginTop: '0.5rem' }}>Prepare-se!</h2>
          <p style={{ maxWidth: '280px', margin: '0.5rem auto 1.5rem auto' }}>
            Segure seu celular com segurança e oculte sua tela dos vizinhos. Suas palavras serão transmitidas em:
          </p>
          <div style={{
            fontSize: '6rem',
            fontWeight: '900',
            fontFamily: 'var(--font-mono)',
            color: 'var(--neon-cyan)',
            textShadow: '0 0 25px var(--neon-cyan-glow)',
            animation: 'scaleWarnText 1s infinite alternate',
            lineHeight: 1,
            margin: '1rem 0'
          }}>
            {prepTimeLeft}
          </div>
          <div className="btn btn-glass" style={{ cursor: 'default', fontSize: '0.85rem', width: 'auto' }}>
            🔒 Conexão Criptografada Segura
          </div>
        </div>
      )}

      {/* TELA 4: PLAYING (Em Partida - Cronômetro de Visualização de 15s) */}
      {roomId && roomState && roomState.gameState === 'PLAYING' && privateGameState && (
        <div className="gameplay-screen glass-panel">
          <div className="game-header">
            <span className="category-badge">📂 {privateGameState.category}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>CONFIDENCIAL</span>
          </div>

          {/* CRONÔMETRO DE VISUALIZAÇÃO ATIVO */}
          {viewingTimeLeft > 0 ? (
            <>
              <div style={{ margin: '0.5rem 0' }}>
                <h2 style={{ marginBottom: '0.2rem' }}>Sua Palavra Secreta</h2>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'rgba(255, 0, 127, 0.05)', border: '1px dashed rgba(255, 0, 127, 0.3)', padding: '0.6rem 1rem', borderRadius: '12px', marginBottom: '0.8rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--neon-pink)', textShadow: '0 0 6px var(--neon-pink-glow)', animation: 'pulse 1s infinite alternate' }}>
                    🚨 DESTRUIÇÃO EM: {viewingTimeLeft} segundos!
                  </span>
                </div>
                {/* Barra de Progresso Regressiva */}
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                  <div style={{ width: `${(viewingTimeLeft / 15) * 100}%`, height: '100%', background: 'var(--neon-pink)', boxShadow: '0 0 8px var(--neon-pink-glow)', transition: 'width 0.25s linear' }}></div>
                </div>
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
                    <span className="shield-title">Revelar Identidade</span>
                    <span className="shield-subtitle">Esconda a tela antes de abrir. O arquivo se autodestruirá.</span>
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
            </>
          ) : (
            /* SISTEMA BLOQUEADO APÓS 15 SEGUNDOS (SEM OVERLAPS, SEGURANÇA MÁXIMA) */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle, rgba(30, 8, 16, 0.45) 0%, rgba(4, 2, 9, 0.95) 100%)',
              border: '2px solid rgba(255, 51, 51, 0.22)',
              borderRadius: '24px',
              padding: '2.4rem 1.6rem',
              boxShadow: 'inset 0 0 20px rgba(255,51,51,0.06), var(--shadow-main)',
              textAlign: 'center',
              margin: '0.5rem 0',
              animation: 'fadeEnter 0.5s ease-out'
            }}>
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                border: '2px solid var(--neon-red)',
                background: 'rgba(255,51,51,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                color: 'var(--neon-red)',
                boxShadow: '0 0 15px rgba(255,51,51,0.3)',
                marginBottom: '1.2rem',
                animation: 'emergencyPulse 1s infinite alternate'
              }}>
                🔒
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
                fontWeight: '900',
                color: 'var(--neon-red)',
                textShadow: '0 0 6px var(--neon-red-glow)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: '0.4rem'
              }}>
                ARQUIVO DESTRUÍDO
              </span>
              <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fff', marginBottom: '0.8rem', textTransform: 'uppercase' }}>
                Fase de Memorização Encerrada
              </span>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sec)', margin: 0, maxWidth: '280px', lineHeight: 1.4 }}>
                A sua palavra foi apagada da memória deste aparelho. O jogo agora está acontecendo <strong>na vida real</strong>! Debatam fisicamente e encontrem o Impostor!
              </p>
            </div>
          )}

          {/* Info de Jogadores na partida */}
          <div className="crew-status-panel">
            <span className="crew-status-title">👥 Sobreviventes na Sala ({activePlayers.length})</span>
            <span className="crew-status-names">
              {activePlayers.map(p => p.nickname).join(', ')}
            </span>
          </div>

          {/* Botões do Gameplay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {isHost ? (
              <button onClick={handleTriggerDiscussion} className="btn btn-accent">
                📢 Iniciar Revelação e Debate
              </button>
            ) : (
              <div className="btn btn-glass" style={{ cursor: 'default', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                ⏳ Aguardando dono encerrar partida...
              </div>
            )}
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              🚪 Sair do Jogo
            </button>
          </div>
        </div>
      )}

      {/* TELA 5: DISCUSSION (Debate / Timer / REVELAÇÃO COMPLETA DOS IMPOSTORES) */}
      {roomId && roomState && roomState.gameState === 'DISCUSSION' && (
        <div className="discussion-screen glass-panel">
          <div className="game-header">
            <span className="category-badge" style={{ borderColor: 'var(--neon-pink)', color: 'var(--neon-pink)', textShadow: '0 0 4px var(--neon-pink-glow)' }}>🔥 DEBATE E VOTAÇÃO</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>REVELADO</span>
          </div>

          <div style={{ margin: '0.5rem 0' }}>
            <h2 style={{ marginBottom: '0.2rem' }}>Tempo de Discussão</h2>
            <p>Debatam quem é o Impostor na vida real e façam a sua votação final!</p>
          </div>

          {/* Timer Progressivo Circular */}
          <div className="timer-wrapper">
            <div className={`timer-radial ${timeLeft <= 15 ? 'is-warning' : ''}`}>
              {/* Círculo SVG de progresso */}
              <svg className="timer-svg">
                <circle className="timer-svg-circle-bg" cx="95" cy="95" r="87" />
                <circle
                  className={`timer-svg-circle-progress ${timeLeft <= 15 ? 'is-warning' : ''}`}
                  cx="95"
                  cy="95"
                  r="87"
                  strokeDasharray={2 * Math.PI * 87}
                  strokeDashoffset={
                    roomState.settings.timerDuration > 0
                      ? (2 * Math.PI * 87) * (1 - timeLeft / roomState.settings.timerDuration)
                      : 0
                  }
                />
              </svg>

              {/* Exibição Numérica */}
              <span className={`timer-numeric-display ${timeLeft <= 15 ? 'is-warning' : ''}`}>
                {formatTime(timeLeft)}
              </span>
              <span className={`timer-label ${timeLeft <= 15 ? 'is-warning' : ''}`}>Restantes</span>
            </div>
          </div>

          {/* 🔥 100% REVELAÇÃO DOS IMPOSTORES / CIVIS (FEATURE SUPER PEDIDA!) */}
          {roomState.revealedRoles && (
            <div style={{
              textAlign: 'left',
              background: 'rgba(4, 2, 9, 0.6)',
              border: '1px solid rgba(157, 78, 221, 0.2)',
              borderRadius: '20px',
              padding: '1.2rem',
              boxShadow: 'inset 0 0 15px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: '900',
                textTransform: 'uppercase',
                color: 'var(--neon-cyan)',
                textShadow: '0 0 6px var(--neon-cyan-glow)',
                letterSpacing: '0.05em',
                display: 'block',
                borderBottom: '1px dashed rgba(0, 245, 212, 0.25)',
                paddingBottom: '0.4rem',
                margin: 0
              }}>
                🔎 DOSSIÊ DA RODADA (REVELADO)
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* 1. Impostores Primeiro com Roxo/Rosa Pulsante */}
                {roomState.revealedRoles.filter(p => p.role === 'impostor').map((p, idx) => (
                  <div key={`imp-${idx}`} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255, 0, 127, 0.05)',
                    border: '1px solid rgba(255, 0, 127, 0.25)',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '12px',
                    boxShadow: '0 0 8px rgba(255,0,127,0.03)'
                  }}>
                    <span style={{ color: '#fff', fontWeight: '800', fontSize: '0.9rem' }}>
                      😈 {p.nickname}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge" style={{ background: 'rgba(255, 0, 127, 0.2)', color: 'var(--neon-pink)', border: '1px solid rgba(255,0,127,0.4)', fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>
                        Impostor
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: '900', color: 'var(--neon-pink)', textShadow: '0 0 4px var(--neon-pink-glow)' }}>
                        "{p.word}"
                      </span>
                    </div>
                  </div>
                ))}

                {/* 2. Civis Depois com Ciano Neon */}
                {roomState.revealedRoles.filter(p => p.role === 'civilian').map((p, idx) => (
                  <div key={`civ-${idx}`} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0, 245, 212, 0.01)',
                    border: '1px solid rgba(0, 245, 212, 0.1)',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '12px'
                  }}>
                    <span style={{ color: 'var(--text-sec)', fontWeight: '600', fontSize: '0.9rem' }}>
                      👥 {p.nickname}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge" style={{ background: 'rgba(0, 245, 212, 0.08)', color: 'var(--neon-cyan)', border: '1px solid rgba(0,245,212,0.2)', fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>
                        Civil
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--neon-cyan)' }}>
                        "{p.word}"
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dica de Discussão */}
          <div className="hud-tips">
            💡 <strong>Debriefing:</strong> O Impostor conseguiu descobrir a palavra secreta dos Civis? Ele soube mentir na vida real? Analisem a jogabilidade da rodada!
          </div>

          {/* Botões da Discussão */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {isHost && (
              <button onClick={handleEndDiscussion} className="btn btn-primary">
                ⏭️ Encerrar e Voltar ao Lobby
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
