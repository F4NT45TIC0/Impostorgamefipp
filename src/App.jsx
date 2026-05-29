import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import PactGame from './PactGame.jsx';

// Conecta ao servidor Express (porta 3000 em dev, mesma porta em produção)
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;
let socket;

export default function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  // Estados da aplicação
  const [nickname, setNickname] = useState(() => localStorage.getItem('impostor_nickname') || '');
  const [inputRoomId, setInputRoomId] = useState('');
  const [roomId, setRoomId] = useState(null);
  
  const [roomState, setRoomState] = useState(null);
  const [privateGameState, setPrivateGameState] = useState(null); // { word, category }
  
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  
  // Timers da aplicação
  const [timeLeft, setTimeLeft] = useState(0);              // Timer de Discussão
  const [prepTimeLeft, setPrepTimeLeft] = useState(0);      // Timer de Preparação (5s)
  const [viewingTimeLeft, setViewingTimeLeft] = useState(0);  // Timer de Visualização (10s)
  
  const timerIntervalRef = useRef(null);
  const prepIntervalRef = useRef(null);
  const viewingIntervalRef = useRef(null);
  const roomIdRef = useRef(null);
  const nicknameRef = useRef(nickname);
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);

  // Inicializar o socket uma única vez
  useEffect(() => {
    socket = io(SOCKET_URL, {
      autoConnect: true
    });

    const syncCurrentRoom = () => {
      if (roomIdRef.current && nicknameRef.current.trim()) {
        socket.emit('sync_room', {
          roomId: roomIdRef.current,
          nickname: nicknameRef.current
        });
      }
    };

    // Ouvintes globais de socket
    socket.on('connect', () => {
      console.log('Conexão estabelecida com o mainframe.');
      syncCurrentRoom();
    });

    socket.on('reconnect', () => {
      syncCurrentRoom();
    });

    socket.on('room_created', (code) => {
      setRoomId(code);
      setErrorMsg(null);
    });

    socket.on('room_state', (state) => {
      updateServerOffset(state.serverTime);
      setRoomState(state);
      setRoomId(state.id);
      
      // Se voltarmos para o lobby, limpa os papéis privados e revelações
      if (state.gameState === 'LOBBY') {
        setPrivateGameState(null);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
        if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
        setTimeLeft(0);
        setPrepTimeLeft(0);
        setViewingTimeLeft(0);
      }

      if (state.gameState !== 'DISCUSSION' && timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        setTimeLeft(0);
      }
    });

    socket.on('game_started', (privateData) => {
      updateServerOffset(privateData.serverTime);
      setPrivateGameState(privateData);
    });

    socket.on('discussion_started', ({ endTime, serverTime }) => {
      updateServerOffset(serverTime);
      startLocalTimer(endTime);
    });

    socket.on('discussion_ended', () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimeLeft(0);
    });

    document.addEventListener('visibilitychange', syncCurrentRoom);
    window.addEventListener('focus', syncCurrentRoom);
    window.addEventListener('pageshow', syncCurrentRoom);

    socket.on('error_message', (msg) => {
      setErrorMsg(msg);
      // Auto-oculta o erro após 4 segundos
      setTimeout(() => {
        setErrorMsg((current) => current === msg ? null : current);
      }, 4000);
    });

    return () => {
      socket.off('connect');
      socket.off('reconnect');
      socket.off('room_created');
      socket.off('room_state');
      socket.off('game_started');
      socket.off('discussion_started');
      socket.off('discussion_ended');
      socket.off('error_message');
      document.removeEventListener('visibilitychange', syncCurrentRoom);
      window.removeEventListener('focus', syncCurrentRoom);
      window.removeEventListener('pageshow', syncCurrentRoom);
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
        const diff = roomState.prepEndTime - getSyncedNow();
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

    // 2. GERENCIAR CRONÔMETRO DE VISUALIZAÇÃO (10 segundos)
    if (roomState.gameState === 'PLAYING' && roomState.viewingEndTime) {
      if (viewingIntervalRef.current) clearInterval(viewingIntervalRef.current);
      
      const updateViewing = () => {
        const diff = roomState.viewingEndTime - getSyncedNow();
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

  useEffect(() => {
    if (
      roomState &&
      roomState.gameState !== 'LOBBY' &&
      !privateGameState &&
      roomId &&
      nickname.trim()
    ) {
      socket?.emit('sync_room', { roomId, nickname });
    }
  }, [roomState, privateGameState, roomId, nickname]);

  // Persistir apelido localmente ao alterar
  const handleNicknameChange = (val) => {
    setNickname(val);
    localStorage.setItem('impostor_nickname', val);
  };

  function updateServerOffset(serverTime) {
    if (typeof serverTime === 'number') {
      serverOffsetRef.current = serverTime - Date.now();
    }
  }

  function getSyncedNow() {
    return Date.now() + serverOffsetRef.current;
  }

  // Temporizador sincronizado localmente com o timestamp do servidor para a Discussão
  const startLocalTimer = (endTime) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const updateTimer = () => {
      const remainingMs = endTime - getSyncedNow();
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remainingSecs);

      if (remainingSecs <= 0) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };

    updateTimer(); // Executa imediatamente a primeira vez
    timerIntervalRef.current = setInterval(updateTimer, 500);
  };

  // 🧬 AÇÕES DO JOGADOR
  
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      return setErrorMsg('Apelido obrigatorio.');
    }
    socket.emit('create_room', { nickname });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      return setErrorMsg('Apelido obrigatorio.');
    }
    if (!inputRoomId.trim()) {
      return setErrorMsg('Codigo da sala necessario.');
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
    socket.emit('end_discussion'); // Triga a transição para REVEAL
  };

  const handleRestartLobby = () => {
    socket.emit('restart_lobby'); // Reseta para LOBBY
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

  if (!selectedGame) {
    return (
      <div className="hub-container">
        <section className="hub-hero">
          <div className="hub-brand-mark">AF</div>
          <div>
            <span className="hub-kicker">FACULDADE // ARCADE</span>
            <h1 className="hub-title">ATLÉTICA FRIV</h1>
            <p className="hub-subtitle">
              Escolha um jogo para abrir uma sala com a galera.
            </p>
          </div>
        </section>

        <section className="hub-games-grid" aria-label="Jogos disponíveis">
          <button className="hub-game-card is-available" onClick={() => setSelectedGame('impostor')}>
            <span className="hub-game-status">DISPONÍVEL</span>
            <span className="hub-game-art" aria-hidden="true">
              <span className="hub-game-screen">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </span>
            <span className="hub-game-title">Impostor</span>
            <span className="hub-game-copy">
              Palavra secreta, blefe e interrogatório em sala.
            </span>
            <span className="hub-play-cta">JOGAR AGORA</span>
          </button>

          <div className="hub-game-card is-available">
            <span className="hub-game-status">NOVO</span>
            <span className="hub-game-art pact-art" aria-hidden="true">
              <span className="pact-moon"></span>
              <span className="pact-mark">PB</span>
            </span>
            <span className="hub-game-title">O Pacto de Sangue</span>
            <span className="hub-game-copy">
              Lobisomem sombrio com noite, voto e papéis secretos.
            </span>
            <button className="hub-play-cta hub-card-action" onClick={() => setSelectedGame('pact')}>
              JOGAR AGORA
            </button>
          </div>
        </section>

        <footer className="app-footer">
          ATLÉTICA FRIV // HUB DE JOGOS
        </footer>
      </div>
    );
  }

  if (selectedGame === 'pact') {
    return <PactGame socket={socket} onBack={() => setSelectedGame(null)} />;
  }

  // Renderização condicional por tela
  return (
    <div className="app-container">
      {/* Pop-up de erro global */}
      {errorMsg && (
        <div className="error-popup">
          <span>ALERTA: {errorMsg}</span>
          <button className="error-close-btn" onClick={() => setErrorMsg(null)}>×</button>
        </div>
      )}

      {/* TELA 1: TELA INICIAL (Acesso ao Mainframe) */}
      {!roomId && (
        <div className="welcome-screen glass-panel">
          <button type="button" className="hub-back-button" onClick={() => setSelectedGame(null)}>
            VOLTAR AO HUB
          </button>
          <div className="logo-container">
            <div className="logo-icon">IN</div>
            <h1>IMPOSTOR // CONTROL</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              SISTEMA DE ANÁLISE DE INFILTRAÇÃO E ESPIONAGEM
            </p>
          </div>

          <form onSubmit={handleCreateRoom}>
            <div className="glass-input-group">
              <label htmlFor="nickname">IDENTIFICAÇÃO DE AGENTE</label>
              <input
                id="nickname"
                type="text"
                placeholder="REGISTRAR APELIDO..."
                maxLength={15}
                className="glass-input"
                value={nickname}
                onChange={(e) => handleNicknameChange(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">
              CRIAR SALA DE OPERAÇÕES
            </button>
          </form>

          <div className="divider">CONEXÃO SECUNDÁRIA</div>

          <form onSubmit={handleJoinRoom}>
            <div className="glass-input-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="room-code">DIRECIONAR CÓDIGO DO CANAL</label>
              <input
                id="room-code"
                type="text"
                placeholder="CÓDIGO DE 4 LETRAS"
                maxLength={4}
                className="glass-input"
                style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.2em' }}
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              ACESSAR CANAL ATIVO
            </button>
          </form>
        </div>
      )}

      {/* TELA 2: LOBBY (Dossiês do Squad de Operação) */}
      {roomId && roomState && roomState.gameState === 'LOBBY' && (
        <div className="lobby-screen glass-panel">
          <div className="room-header">
            <div>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-dimmed)', fontFamily: 'var(--font-mono)' }}>CANAL CRIPTOGRAFADO</p>
              <h2 style={{ margin: 0, textAlign: 'left', fontWeight: 'bold' }}>SALA DE ESPERA</h2>
            </div>
            <div className="room-code-badge" onClick={copyRoomCode}>
              <span className="room-code-text">{roomId}</span>
              <span className="room-code-copy-icon" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                {copiedCode ? '[COPIADO]' : '[COPIAR]'}
              </span>
            </div>
          </div>

          {/* Configurações (Apenas para o Host ver e alterar, outros veem travado) */}
          <div className="settings-section">
            <span className="settings-section-title">PARÂMETROS DA DIRETRIZ</span>
            <div className="settings-grid">
              <div className="setting-item-inline">
                <label>INFILTRADOS</label>
                <select
                  disabled={!isHost}
                  className="setting-input-small glass-select"
                  value={roomState.settings.impostorsCount}
                  onChange={(e) => handleUpdateSettings({ impostorsCount: parseInt(e.target.value) })}
                >
                  <option value={1}>1 IMPOSTOR</option>
                  <option value={2}>2 IMPOSTORES</option>
                  <option value={3}>3 IMPOSTORES</option>
                </select>
              </div>

              <div className="setting-item-inline">
                <label>TIMER DEBATE</label>
                <select
                  disabled={!isHost}
                  className="setting-input-small glass-select"
                  value={roomState.settings.timerDuration}
                  onChange={(e) => handleUpdateSettings({ timerDuration: parseInt(e.target.value) })}
                >
                  <option value={60}>1 MINUTO</option>
                  <option value={120}>2 MINUTOS</option>
                  <option value={180}>3 MINUTOS</option>
                  <option value={240}>4 MINUTOS</option>
                  <option value={300}>5 MINUTOS</option>
                </select>
              </div>

              <div className="setting-item-inline" style={{ gridColumn: 'span 2' }}>
                <label>DIRETÓRIO DE PALAVRAS // BANCO DE DADOS</label>
                <select
                  disabled={!isHost}
                  className="setting-input-small glass-select"
                  value={roomState.settings.category}
                  onChange={(e) => handleUpdateSettings({ category: e.target.value })}
                >
                  {roomState.availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Lista de Jogadores */}
          <div className="players-container">
            <div className="players-title-row">
              <span className="settings-section-title" style={{ margin: 0 }}>INTEGRANTES DO SQUAD</span>
              <span className="players-count">{activePlayers.length} ATIVOS</span>
            </div>
            <div className="players-list">
              {roomState.players.map((p) => {
                const isMe = p.id === socket?.id;
                return (
                  <div key={p.id} className="player-item">
                    <div className="player-info">
                      <span className={`player-avatar ${p.isHost ? 'is-host' : ''}`}>
                        {p.isHost ? '[LÍDER]' : '   //'}
                      </span>
                      <span className={`player-name ${isMe ? 'is-me' : ''}`}>
                        {p.nickname.toUpperCase()} {isMe && '(VOCÊ)'}
                      </span>
                    </div>
                    <div className="player-badges">
                      {!p.connected ? (
                        <span className="badge badge-disconnected">[OFFLINE]</span>
                      ) : p.isHost ? (
                        <span className="badge badge-host">[ANFITRIÃO]</span>
                      ) : p.isReady ? (
                        <span className="badge badge-ready">[PRONTO]</span>
                      ) : (
                        <span className="badge badge-not-ready">[AGUARDANDO]</span>
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
                {me?.isReady ? 'CANCELAR PRONTO' : 'DECLARAR PRONTO // ATIVO'}
              </button>
            ) : (
              <button
                onClick={handleStartGame}
                disabled={activePlayers.length < roomState.settings.impostorsCount + 2 || !activePlayers.every(p => p.isHost || p.isReady)}
                className="btn btn-primary"
              >
                EXECUTAR DIRETRIZ DE INFILTRAÇÃO
              </button>
            )}
            
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              DESCONECTAR CANAL
            </button>

            {isHost && activePlayers.length < roomState.settings.impostorsCount + 2 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--impostor-red)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                AVISO: NECESSÁRIO MÍNIMO DE {roomState.settings.impostorsCount + 2} AGENTES PARA CONEXÃO COM {roomState.settings.impostorsCount} INFILTRADOS.
              </p>
            )}
            {isHost && activePlayers.length >= roomState.settings.impostorsCount + 2 && !activePlayers.every(p => p.isHost || p.isReady) && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                STATUS: AGUARDANDO SINCRONIZAÇÃO DE PRONTO DE TODOS OS INTEGRANTES.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TELA 3: PREPARING (5s de Contagem Regressiva de Segurança) */}
      {roomId && roomState && roomState.gameState === 'PREPARING' && (
        <div className="glass-panel welcome-screen" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="category-badge" style={{ fontSize: '0.75rem', borderColor: 'var(--amber-orange)', color: 'var(--amber-orange)' }}>TRANSMISSÃO IMINENTE</span>
          <h2 style={{ fontSize: '1.4rem', marginTop: '0.5rem', fontWeight: 'bold' }}>PREPARE-SE</h2>
          <p style={{ maxWidth: '280px', margin: '0.5rem auto 1.5rem auto', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
            SINCRONIZE SUA TELA PRIVADAMENTE. AS IDENTIDADES SERÃO ENVIADAS AO DISPOSITIVO EM:
          </p>
          <div style={{
            fontSize: '6rem',
            fontWeight: 'normal',
            fontFamily: 'var(--font-mono)',
            color: 'var(--amber-orange)',
            textShadow: '0 0 15px var(--amber-glow)',
            lineHeight: 1,
            margin: '0.5rem 0'
          }}>
            {prepTimeLeft}
          </div>
          <div className="btn btn-glass" style={{ cursor: 'default', fontSize: '0.8rem', width: 'auto' }}>
            CONEXÃO CRIPTOGRAFADA ATIVA
          </div>
        </div>
      )}

      {/* TELA 4: PLAYING (Visualização Segura de 10s) */}
      {roomId && roomState && roomState.gameState === 'PLAYING' && privateGameState && (
        <div className="gameplay-screen glass-panel">
          <div className="game-header">
            <span className="category-badge">DIRETÓRIO: {privateGameState.category.toUpperCase()}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>CONFIDENCIAL // DETECÇÃO</span>
          </div>

          {/* CRONÔMETRO DE VISUALIZAÇÃO ATIVO */}
          {viewingTimeLeft > 0 ? (
            <>
              <div style={{ margin: '0.4rem 0' }}>
                <h2 style={{ marginBottom: '0.2rem', fontSize: '1.1rem' }}>ARQUIVO DE IDENTIDADE</h2>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'rgba(255, 159, 0, 0.03)', border: '1px dashed rgba(255, 159, 0, 0.25)', padding: '0.5rem 1rem', borderRadius: '4px', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--amber-orange)', textShadow: '0 0 4px var(--amber-glow)' }}>
                    AUTODESTRUIÇÃO EM: {viewingTimeLeft} SEGUNDOS
                  </span>
                </div>
                {/* Barra de Progresso Rígida */}
                <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.02)', borderRadius: '0px', overflow: 'hidden', marginBottom: '0.2rem' }}>
                  <div style={{ width: `${(viewingTimeLeft / 10) * 100}%`, height: '100%', background: 'var(--amber-orange)', boxShadow: '0 0 5px var(--amber-glow)', transition: 'width 0.25s linear' }}></div>
                </div>
              </div>

              {/* Privacy Shield Card */}
              <div
                className="privacy-card is-revealed"
              >
                <div className="privacy-card-inner">
                  {/* Frente do Card */}
                  <div className="privacy-card-front">
                    <div className="shield-icon-container">SECURE</div>
                    <span className="shield-title">ACESSAR FICHA</span>
                    <span className="shield-subtitle">BLOQUEIE A VISÃO EXTERNA. O ARQUIVO SERÁ REMOVIDO DO TERMINAL.</span>
                  </div>

                  {/* Verso do Card (Revelado) */}
                  <div className="privacy-card-back">
                    <span className="role-badge-large civilian">
                      REVELAR PALAVRA
                    </span>
                    
                    <span className="secret-word-display">
                      {privateGameState.word.toUpperCase()}
                    </span>

                    <span className="reveal-tip">MEMORIZE ANTES DO LOCKDOWN</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ARQUIVOS APAGADOS APÓS 10 SEGUNDOS */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 51, 51, 0.3)',
              borderRadius: '8px',
              padding: '2.2rem 1.4rem',
              boxShadow: 'var(--shadow-terminal)',
              textAlign: 'center',
              margin: '0.4rem 0',
              animation: 'terminalBoot 0.4s ease-out'
            }}>
              <div style={{
                width: '60px',
                height: '60px',
                border: '1px solid var(--impostor-red)',
                background: 'rgba(255,51,51,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--impostor-red)',
                boxShadow: '0 0 10px rgba(255,51,51,0.2)',
                marginBottom: '1rem',
              }}>
                LOCK
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: 'var(--impostor-red)',
                textShadow: '0 0 4px var(--impostor-glow)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '0.3rem'
              }}>
                [DADOS APAGADOS]
              </span>
              <span style={{ fontSize: '1.15rem', fontFamily: 'var(--font-mono)', color: '#fff', marginBottom: '0.6rem' }}>
                VISUALIZAÇÃO ENCERRADA
              </span>
              {roomState.starterPlayer && (
                <div style={{
                  width: '100%',
                  border: '1px dashed rgba(255, 159, 0, 0.25)',
                  background: 'rgba(255, 159, 0, 0.04)',
                  borderRadius: '4px',
                  padding: '0.75rem 0.9rem',
                  marginBottom: '0.8rem',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase'
                }}>
                  <span style={{
                    display: 'block',
                    fontSize: '0.68rem',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.08em',
                    marginBottom: '0.25rem'
                  }}>
                    INICIAR RODADA NA VIDA REAL
                  </span>
                  <span style={{
                    display: 'block',
                    fontSize: '1.2rem',
                    color: 'var(--amber-orange)',
                    textShadow: '0 0 6px var(--amber-glow)',
                    overflowWrap: 'anywhere'
                  }}>
                    {roomState.starterPlayer.nickname.toUpperCase()}
                  </span>
                </div>
              )}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '280px', lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>
                A palavra secreta foi permanentemente expurgada deste terminal por motivos de segurança operacional. O debate e interrogatório ocorrem agora inteiramente na vida real.
              </p>
            </div>
          )}

          {/* Lista de Integrantes Operando */}
          <div className="crew-status-panel">
            <span className="crew-status-title">AGENTES EM OPERAÇÃO EM CAMPO ({activePlayers.length})</span>
            <span className="crew-status-names">
              {activePlayers.map(p => p.nickname.toUpperCase()).join(' // ')}
            </span>
          </div>

          {/* Botões do Gameplay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {isHost ? (
              <button onClick={handleTriggerDiscussion} className="btn btn-accent">
                ENCERRAR TRANSMISSÃO // INICIAR DEBRIEFING
              </button>
            ) : (
              <div className="btn btn-glass" style={{ cursor: 'default', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                AGUARDANDO LÍDER ENCERRAR OPERAÇÃO...
              </div>
            )}
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              DESCONECTAR CANAL
            </button>
          </div>
        </div>
      )}

      {/* TELA 5: DISCUSSION (Debate / Timer Ativo - IMPOSTORES OCULTOS!) */}
      {roomId && roomState && roomState.gameState === 'DISCUSSION' && (
        <div className="discussion-screen glass-panel">
          <div className="game-header">
            <span className="category-badge" style={{ borderColor: 'var(--impostor-red)', color: 'var(--impostor-red)' }}>SESSÃO DE INTERROGATÓRIO</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>DECRYPTING</span>
          </div>

          <div style={{ margin: '0.4rem 0' }}>
            <h2 style={{ marginBottom: '0.2rem', fontSize: '1.1rem' }}>TEMPO DE DISCUSSÃO</h2>
            <p>Proceda com a investigação na vida real para identificar quem blefou ou infiltrou.</p>
          </div>

          {/* Timer Regressivo Rígido */}
          <div className="timer-wrapper">
            <div className={`timer-radial ${timeLeft <= 15 ? 'is-warning' : ''}`}>
              <svg className="timer-svg">
                <circle className="timer-svg-circle-bg" cx="85" cy="85" r="79" />
                <circle
                  className={`timer-svg-circle-progress ${timeLeft <= 15 ? 'is-warning' : ''}`}
                  cx="85"
                  cy="85"
                  r="79"
                  strokeDasharray={2 * Math.PI * 79}
                  strokeDashoffset={
                    roomState.settings.timerDuration > 0
                      ? (2 * Math.PI * 79) * (1 - timeLeft / roomState.settings.timerDuration)
                      : 0
                  }
                />
              </svg>

              <span className={`timer-numeric-display ${timeLeft <= 15 ? 'is-warning' : ''}`}>
                {formatTime(timeLeft)}
              </span>
              <span className={`timer-label ${timeLeft <= 15 ? 'is-warning' : ''}`}>RESTANTES</span>
            </div>
          </div>

          {/* Diretriz Operacional */}
          <div className="hud-tips">
            DIRETRIZ DE INVESTIGAÇÃO: Debatam ativamente na vida real. Façam o interrogatório, o Infiltrado não foi revelado nos sistemas ainda. Decidam seus votos!
          </div>

          {/* Lista de Agentes para Investigar */}
          <div className="crew-status-panel">
            <span className="crew-status-title">INTEGRANTES NA SESSÃO DE DEBATE</span>
            <span className="crew-status-names" style={{ color: '#fff' }}>
              {activePlayers.map(p => p.nickname.toUpperCase()).join(' // ')}
            </span>
          </div>

          {/* Botões da Discussão */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {isHost ? (
              <button onClick={handleEndDiscussion} className="btn btn-primary">
                DESCRIPTOGRAFAR DOSSIÊ // REVELAR INFILTRADO
              </button>
            ) : (
              <div className="btn btn-glass" style={{ cursor: 'default', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                AGUARDANDO LÍDER REVELAR DOSSIÊ...
              </div>
            )}
            <button onClick={handleLeaveRoom} className="btn btn-glass">
              DESCONECTAR CANAL
            </button>
          </div>
        </div>
      )}

      {/* TELA 6: REVEAL (Debriefing final, exibe a verdade após o debate) */}
      {roomId && roomState && roomState.gameState === 'REVEAL' && (() => {
        const roundImpostors = roomState.revealedRoles?.filter(p => p.role === 'impostor') || [];
        const impostorNames = roundImpostors.map(p => p.nickname.toUpperCase()).join(' // ');
        return (
          <div className="discussion-screen glass-panel">
            <div className="game-header">
              <span className="category-badge" style={{ borderColor: 'var(--agent-green)', color: 'var(--agent-green)', textShadow: '0 0 4px var(--agent-glow)' }}>ARQUIVOS DESCRIPTOGRAFADOS</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>DECOMPRESSED</span>
            </div>

            <div style={{ margin: '0.4rem 0' }}>
              <h2 style={{ marginBottom: '0.2rem', fontSize: '1.1rem' }}>DEBRIEFING DA RODADA</h2>
              <p>Todos os dados operacionais foram expostos. Analisem os resultados.</p>
            </div>

            {/* 🔥 BANNER TÁTICO: O IMPOSTOR DA RODADA ERA: */}
            <div style={{
              background: 'rgba(255, 51, 51, 0.05)',
              border: '1px solid var(--impostor-red)',
              borderRadius: '8px',
              padding: '1.2rem',
              textAlign: 'center',
              margin: '0.5rem 0 1rem 0',
              boxShadow: '0 0 15px rgba(255, 51, 51, 0.15)',
              animation: 'pulseEmergencyConsole 1.5s infinite alternate'
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: 'var(--impostor-red)',
                letterSpacing: '0.12em',
                display: 'block',
                marginBottom: '0.4rem'
              }}>
                [IDENTIFICAÇÃO DE INFILTRADO COMPLETA]
              </span>
              <h3 style={{
                fontSize: '1.1rem',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontWeight: 'normal',
                margin: 0
              }}>
                O IMPOSTOR DA RODADA ERA:
              </h3>
              <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: 'var(--impostor-red)',
                textShadow: '0 0 10px var(--impostor-glow)',
                marginTop: '0.5rem',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em'
              }}>
                {impostorNames || 'NENHUM INFILTRADO DETECTADO'}
              </div>
            </div>

            {/* 🔍 DOSSIÊ COMPLETO REVELADO DEPOIS DO DEBATE! */}
            {roomState.revealedRoles && (
              <div style={{
                textAlign: 'left',
                background: 'rgba(0, 0, 0, 0.85)',
                border: '1px solid rgba(255, 159, 0, 0.15)',
                borderRadius: '8px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                margin: '0.5rem 0'
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  color: 'var(--amber-orange)',
                  letterSpacing: '0.05em',
                  display: 'block',
                  borderBottom: '1px dashed rgba(255, 159, 0, 0.2)',
                  paddingBottom: '0.3rem',
                  margin: 0
                }}>
                  DOSSIÊ DA RODADA ATIVA // VERDADE EXPOSTA
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {/* 1. Impostores em Vermelho */}
                  {roomState.revealedRoles.filter(p => p.role === 'impostor').map((p, idx) => (
                    <div key={`imp-${idx}`} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(255, 51, 51, 0.04)',
                      border: '1px solid rgba(255, 51, 51, 0.25)',
                      padding: '0.55rem 0.8rem',
                      borderRadius: '4px'
                    }}>
                      <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                        SUSPEITO: {p.nickname.toUpperCase()}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="badge" style={{ background: 'rgba(255, 51, 51, 0.1)', color: 'var(--impostor-red)', border: '1px solid rgba(255,51,51,0.3)', fontSize: '0.6rem', padding: '0.05rem 0.25rem' }}>
                          INFILTRADO
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--impostor-red)', fontWeight: 'bold', textShadow: '0 0 4px var(--impostor-glow)' }}>
                          "{p.word.toUpperCase()}"
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* 2. Civis em Verde */}
                  {roomState.revealedRoles.filter(p => p.role === 'civilian').map((p, idx) => (
                    <div key={`civ-${idx}`} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(0, 230, 118, 0.01)',
                      border: '1px solid rgba(0, 230, 118, 0.08)',
                      padding: '0.55rem 0.8rem',
                      borderRadius: '4px'
                    }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                        AGENTE: {p.nickname.toUpperCase()}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="badge" style={{ background: 'rgba(0, 230, 118, 0.05)', color: 'var(--agent-green)', border: '1px solid rgba(0,230,118,0.15)', fontSize: '0.6rem', padding: '0.05rem 0.25rem' }}>
                          AGENTE
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--agent-green)', fontWeight: 'bold' }}>
                          "{p.word.toUpperCase()}"
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diretriz Operacional Pós-Jogo */}
            <div className="hud-tips" style={{ borderLeftColor: 'var(--agent-green)' }}>
              DIRETRIZ FINAL: Analisem a performance de infiltração. Como o espião conseguiu se disfarçar? Quando a sala for recomposta, ajuste os parâmetros e inicie uma nova rodada.
            </div>

            {/* Botões do Painel de Revelação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {isHost ? (
                <button onClick={handleRestartLobby} className="btn btn-primary">
                  RECOMPOR SALA // VOLTAR AO LOBBY
                </button>
              ) : (
                <div className="btn btn-glass" style={{ cursor: 'default', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  AGUARDANDO LÍDER RECOMPOR SALA...
                </div>
              )}
              <button onClick={handleLeaveRoom} className="btn btn-glass">
                DESCONECTAR CANAL
              </button>
            </div>
          </div>
        );
      })()}

      {/* FOOTER */}
      <footer className="app-footer">
        CLASSIFIED DATA SYSTEM // IMPOSTORGAMEFIPP
      </footer>
    </div>
  );
}
