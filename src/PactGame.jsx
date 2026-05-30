import { useEffect, useMemo, useState } from 'react';

const ROLE_GUIDE = {
  'O Alfa Alfaçado': {
    side: 'Lobisomens',
    goal: 'Eliminar a vila ou igualar seu número.',
    night: 'Escolhe um jogador para matar.',
    extra: 'Pode uivar uma vez na partida para forçar o alvo a votar em si mesmo no dia seguinte.',
    tip: 'Use o uivo estratégico no investigador principal da vila.'
  },
  'O Lobisomem Ilusionista': {
    side: 'Lobisomens',
    goal: 'Eliminar a vila ou igualar seu número.',
    night: 'Escolhe um jogador para matar e dois jogadores vivos para embaralhar os votos.',
    extra: 'Os botões de voto dos dois alvos na tela dos outros são trocados secretamente!',
    tip: 'Baralhe suspeitos óbvios com inocentes para criar acusações de mentira.'
  },
  'O Lobisomem Hipnotista': {
    side: 'Lobisomens',
    goal: 'Eliminar a vila ou igualar seu número.',
    night: 'Escolhe um jogador para matar e um jogador vivo para amordaçar.',
    extra: 'O jogador amordaçado não consegue falar no chat e o peso do seu voto vira zero.',
    tip: 'Silencie a pessoa mais faladeira da vila para tirar sua influência.'
  },
  'O Lobisomem Acossado': {
    side: 'Lobisomens',
    goal: 'Eliminar a vila ou igualar seu número.',
    night: 'Escolhe um jogador para matar.',
    extra: 'Se for investigado por alguém à noite, descobre quem foi. Seu voto contra essa pessoa tem peso duplo.',
    tip: 'Vire o jogo contra investigadores alegando que eles são suspeitos.'
  },
  'O Lobisomem Mimético': {
    side: 'Lobisomens',
    goal: 'Eliminar a vila ou igualar seu número.',
    night: 'Escolhe um jogador para matar e um morador para copiar o relatório.',
    extra: 'Ao amanhecer, você ganha uma cópia exata de qualquer relatório investigativo que ele receba.',
    tip: 'Fique de olho em quem parece saber demais e copie seus relatórios.'
  },
  'O Padeiro da Taverna': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todas as ameaças da matilha e salvar a vila.',
    night: 'Oferece um Pão com Cachaça para um jogador vivo.',
    extra: 'O alvo fica imune a morte, mas fica de ressaca (tela borrada e perde o voto). Se dado a um lobo, a matilha inteira perde o ataque!',
    tip: 'Se suspeitar muito de alguém ser lobo, dê o pão para neutralizar o ataque dos lobos.'
  },
  'A Benzedeira Curandeira': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todas as ameaças da matilha e salvar a vila.',
    night: 'Lança uma Garrafada de Ervas em um jogador vivo.',
    extra: 'Queima e descobre se o alvo é lobo. Se for aldeão, limpa todos os seus debuffs de ressaca ou mordaça!',
    tip: 'Use para curar e purificar aliados amordaçados ou investigar suspeitos.'
  },
  'O Fiscal da Prefeitura': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todas as ameaças da matilha e salvar a vila.',
    night: 'Escolhe dois jogadores vivos para fazer uma auditoria.',
    extra: 'Descobre se ambos pertencem à mesma facção ou a facções diferentes.',
    tip: 'Encontre conexões e garanta inocentes auditando-os junto com você.'
  },
  'O Coveiro Ladrão de Túmulos': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todas as ameaças da matilha e salvar a vila.',
    night: 'Exuma um jogador morto recente de Teodoro Sampaio.',
    extra: 'Descobre a classe dele e rouba sua habilidade ativa para usar na próxima noite!',
    tip: 'Aproveite habilidades fortes de suporte ou ataque de mortos recentes.'
  },
  'O Fofoqueiro da Paróquia': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todas as ameaças da matilha e salvar a vila.',
    night: 'Vigia a casa de um morador à noite.',
    extra: 'Descobre exatamente quantas visitas (ações) ele recebeu à noite.',
    tip: 'Monitore pessoas chaves para saber se estão agindo sobre elas.'
  },
  'A Beata Milagrosa': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todas as ameaças da matilha e salvar a vila.',
    night: 'Ora por um vivo (proteção contra morte) ou por um morto recente.',
    extra: 'Se orar por um morto, sua classe é purificada e revelada publicamente a todos no amanhecer.',
    tip: 'Reveja classes ocultas de mortos para dar pistas seguras à vila.'
  },
  'O Agiota de Teodoro': {
    side: 'Neutro Caótico',
    goal: 'Vencer acumulando 3 devedores sobreviventes ativos ao mesmo tempo.',
    night: 'Dá um Empréstimo de Sangue para proteger um jogador de morte.',
    extra: 'O devedor tem o seu voto no dia 100% controlado e espelhado pelo Agiota no backend.',
    tip: 'Proteja alvos óbvios dos lobos para forçá-los a virar devedores e acumular votos.'
  },
  'O Radialista da Rádio Teodoro': {
    side: 'Neutro Caótico',
    goal: 'Vencer transmitindo 3 Teorias conspiratórias com sucesso ou sobrevivendo até o final.',
    night: 'Transmite uma Teoria da Conspiração que muda as regras do dia seguinte.',
    extra: 'Pode instaurar Lei Seca (sem votos), Fake News (enforca menos votado) ou Censura Federal (votos secretos).',
    tip: 'Combine teorias que facilitem sua sobrevivência e manipulem o ritmo do dia.'
  },
  'O Parasita Sombrio': {
    side: 'Neutro',
    goal: 'Vencer sozinho se a vila enforcar seu hospedeiro secreto durante o dia.',
    night: 'Não tem ação noturna, apenas observe de perto.',
    extra: 'Sorteia um hospedeiro no início. Se ele morrer à noite, você morre de desgosto. Se sobreviver até o fim, você perde.',
    tip: 'Instigue dúvidas sutis sobre seu hospedeiro para que a vila o enforque, mas proteja-o de suspeitas absurdas à noite.'
  },
  'Aldeão Marcado': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar lobos e neutros da vila.',
    night: 'Apenas durma em segurança na névoa.',
    extra: 'Seu poder está na sua voz, dedução e voto no debate diário.',
    tip: 'Preste muita atenção em contradições ou votos forçados nas trocas ilusionistas.'
  }
};

const ROLE_ORDER = Object.keys(ROLE_GUIDE);

export default function PactGame({ socket, onBack }) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('pact_nickname') || '');
  const [inputRoomId, setInputRoomId] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [privateState, setPrivateState] = useState(null);
  
  // Ações da noite
  const [targetId, setTargetId] = useState('');
  const [secondTargetId, setSecondTargetId] = useState('');
  const [swapFirstId, setSwapFirstId] = useState('');
  const [swapSecondId, setSwapSecondId] = useState('');
  const [gagTargetId, setGagTargetId] = useState('');
  const [spyTargetId, setSpyTargetId] = useState('');
  const [howl, setHowl] = useState(false);
  const [directive, setDirective] = useState('');
  
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleCreated = (code) => setRoomId(code);
    const handleRoom = (state) => {
      setRoomState(state);
      setRoomId(state.id);
    };
    const handlePrivate = (state) => setPrivateState(state);
    const handleMessage = (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage((current) => current === msg ? null : current), 3500);
    };

    socket.on('pact_room_created', handleCreated);
    socket.on('pact_room_state', handleRoom);
    socket.on('pact_private_state', handlePrivate);
    socket.on('pact_private_message', handleMessage);
    socket.on('error_message', handleMessage);

    return () => {
      socket.off('pact_room_created', handleCreated);
      socket.off('pact_room_state', handleRoom);
      socket.off('pact_private_state', handlePrivate);
      socket.off('pact_private_message', handleMessage);
      socket.off('error_message', handleMessage);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const syncRoom = () => {
      if (roomId && nickname.trim()) {
        socket.emit('pact_sync_room', { roomId, nickname });
      }
    };

    socket.on('connect', syncRoom);
    document.addEventListener('visibilitychange', syncRoom);
    window.addEventListener('focus', syncRoom);
    window.addEventListener('pageshow', syncRoom);

    return () => {
      socket.off('connect', syncRoom);
      document.removeEventListener('visibilitychange', syncRoom);
      window.removeEventListener('focus', syncRoom);
      window.removeEventListener('pageshow', syncRoom);
    };
  }, [socket, roomId, nickname]);

  // Resetar seletores ao mudar de fase
  useEffect(() => {
    setTargetId('');
    setSecondTargetId('');
    setSwapFirstId('');
    setSwapSecondId('');
    setGagTargetId('');
    setSpyTargetId('');
    setHowl(false);
    setDirective('');
  }, [roomState?.phase, privateState?.role?.name]);

  const me = useMemo(
    () => roomState?.players.find(player => player.id === socket?.id),
    [roomState, socket?.id]
  );
  
  const isHost = Boolean(me?.isHost);
  const connectedPlayers = roomState?.players.filter(player => player.connected) || [];
  const alivePlayers = roomState?.players.filter(player => player.alive) || [];
  const deadPlayers = roomState?.players.filter(player => !player.alive) || [];
  
  const activeRole = privateState?.stolenAbility || privateState?.role;
  const roleName = activeRole?.name;
  const team = privateState?.role?.team;
  
  const livingTargets = alivePlayers.filter(player => player.id !== socket?.id);
  const deadTargets = deadPlayers;
  const anyTargets = roomState?.players.filter(player => player.id !== socket?.id) || [];
  const settings = roomState?.settings || { wolfCount: 1, specialRoles: true, revealDeadRoles: true };
  const isDeadLocked = roomState?.phase !== 'LOBBY' && roomState?.phase !== 'ENDED' && me && !me.alive;

  const handleNicknameChange = (value) => {
    setNickname(value);
    localStorage.setItem('pact_nickname', value);
  };

  const createRoom = (event) => {
    event.preventDefault();
    socket?.emit('pact_create_room', { nickname });
  };

  const joinRoom = (event) => {
    event.preventDefault();
    socket?.emit('pact_join_room', { roomId: inputRoomId, nickname });
  };

  const leaveRoom = () => {
    socket?.emit('pact_leave_room');
    setRoomId(null);
    setRoomState(null);
    setPrivateState(null);
    setTargetId('');
    setSecondTargetId('');
  };

  const submitNightAction = () => {
    socket?.emit('pact_night_action', {
      targetId,
      secondTargetId,
      swapFirstId,
      swapSecondId,
      gagTargetId,
      spyTargetId,
      howl,
      directive
    });
  };

  const vote = (id) => {
    socket?.emit('pact_vote', { targetId: id });
  };

  const updateSettings = (patch) => {
    socket?.emit('pact_update_settings', patch);
  };

  const voteCounts = Object.values(roomState?.votes || {}).reduce((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  if (!roomId || !roomState) {
    return (
      <div className="pact-container">
        <button type="button" className="hub-back-button" onClick={onBack}>VOLTAR AO HUB</button>
        <section className="pact-panel pact-entry">
          <span className="hub-kicker" style={{ color: '#ba0c0c' }}>LOBISOMEM // SOCIEDADE OCULTA</span>
          <h1 className="pact-title" style={{ borderBottomColor: '#ba0c0c', textShadow: '0 0 10px rgba(186,12,12,0.45)' }}>O PACTO DE SANGUE</h1>
          <p>
            A névoa úmida fechou os portões da Vila de Teodoro Sampaio. Crie uma sala, escolha as regras e encare classes altamente estratégicas e caóticas.
          </p>

          <form onSubmit={createRoom} className="pact-form" style={{ borderColor: 'rgba(186,12,12,0.2)' }}>
            <label>Seu Apelido</label>
            <input value={nickname} onChange={(event) => handleNicknameChange(event.target.value)} maxLength={15} required autoComplete="nickname" />
            <button className="btn btn-danger" type="submit">CRIAR PACTO DE SANGUE</button>
          </form>

          <form onSubmit={joinRoom} className="pact-form" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <label>Código da sala</label>
            <input value={inputRoomId} onChange={(event) => setInputRoomId(event.target.value.toUpperCase())} maxLength={4} placeholder="ABCD" autoCapitalize="characters" />
            <button className="btn btn-glass" type="submit">ENTRAR NO PACTO</button>
          </form>

          <RoleGuide />
        </section>
      </div>
    );
  }

  const isNight = roomState.phase === 'NIGHT';
  const isDebuffGagged = privateState?.gagged;
  const isDebuffHangover = privateState?.hangover;

  return (
    <div className="pact-container">
      {message && <div className="error-popup" style={{ borderLeft: '4px solid #ba0c0c' }}><span>{message}</span></div>}

      {/* Gagged Mordaça Alert */}
      {isDebuffGagged && roomState.phase === 'DAY' && (
        <div className="gagged-alert-overlay">
          <div className="gagged-chains-icon">⛓️</div>
          <h2 className="gagged-title">PARALISIA DO PAVOR</h2>
          <p style={{ color: '#ba0c0c', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            Você foi amordaçado pelo pânico esta noite. Suas opções de voto e debate foram trancadas!
          </p>
        </div>
      )}

      {/* Hangover Ressaca Alert */}
      {isDebuffHangover && roomState.phase === 'DAY' && (
        <div className="hangover-alert-overlay">
          <div className="hangover-badge">🥴 RESSACA DE CACHAÇA</div>
        </div>
      )}

      <section className={`pact-panel ${isNight ? 'is-night' : ''} ${(isDebuffHangover && roomState.phase === 'DAY') ? 'has-hangover' : ''} ${(isDebuffGagged && roomState.phase === 'DAY') ? 'has-gagged' : ''}`}>
        
        <div className="pact-room-header">
          <div>
            <span className="hub-kicker" style={{ color: isNight ? '#5b62a6' : '#ba0c0c' }}>SALA CRIPTOGRAFADA {roomId}</span>
            <h1 className="pact-title" style={{ textShadow: isNight ? '0 0 10px rgba(100,100,220,0.3)' : '0 0 10px rgba(186,12,12,0.35)' }}>
              O PACTO DE SANGUE
            </h1>
          </div>
          <button type="button" className="hub-back-button" onClick={leaveRoom}>DEIXAR SALA</button>
        </div>

        <div className="pact-phase-strip">
          <span style={{ 
            color: isNight ? '#8b93ff' : '#d4af37', 
            borderColor: isNight ? 'rgba(100,100,220,0.3)' : 'rgba(212,175,55,0.3)',
            background: isNight ? 'rgba(100,100,220,0.04)' : 'rgba(212,175,55,0.04)'
          }}>
            {phaseLabel(roomState.phase)} {roomState.phase === 'DAY' ? roomState.dayNumber : roomState.phase === 'NIGHT' ? roomState.nightNumber : ''}
          </span>
          <span style={{ color: '#00e676', borderColor: 'rgba(0,230,118,0.2)', background: 'rgba(0,230,118,0.04)' }}>
            {alivePlayers.length} moradores vivos
          </span>
          <span style={{ color: '#a0a0b0', borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
            {connectedPlayers.length}/20 conectados
          </span>
        </div>

        {roomState.radioDirective && roomState.phase === 'DAY' && (
          <div className="radio-conspiracy-indicator">
            <span>📻 RÁDIO TEODORO AM (DIRETRIZ ATIVA)</span>
            <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0 }}>
              <b>{roomState.radioDirective}:</b> {
                roomState.radioDirective === 'Lei Seca' ? 'O julgamento foi cancelado hoje. Nenhum morador pode votar.' :
                roomState.radioDirective === 'Fake News' ? 'A vila enforcará o morador com MENOS votos (mínimo de 1 voto).' :
                'Censura Federal ativada. A votação do dia é secreta (você não verá os votos acumulados na tela).'
              }
            </p>
          </div>
        )}

        {isDeadLocked ? (
          <DeadScreen roleName={privateState?.role?.name} />
        ) : (
          <>
            {roomState.phase === 'LOBBY' && (
              <LobbyView
                roomState={roomState}
                isHost={isHost}
                socket={socket}
                settings={settings}
                updateSettings={updateSettings}
                connectedPlayers={connectedPlayers}
              />
            )}

            {roomState.phase !== 'LOBBY' && privateState?.role && (
              <RoleCard 
                roleName={privateState.role.name} 
                hostNickname={privateState.hostNickname}
                stolenAbility={privateState.stolenAbility}
                debtorOfNickname={privateState.debtorOfNickname}
                team={team}
              />
            )}

            {roomState.phase === 'NIGHT' && me?.alive && (
              <NightView
                roleName={roleName}
                livingTargets={livingTargets}
                deadTargets={deadTargets}
                anyTargets={anyTargets}
                targetId={targetId}
                setTargetId={setTargetId}
                secondTargetId={secondTargetId}
                setSecondTargetId={setSecondTargetId}
                swapFirstId={swapFirstId}
                setSwapFirstId={setSwapFirstId}
                swapSecondId={swapSecondId}
                setSwapSecondId={setSwapSecondId}
                gagTargetId={gagTargetId}
                setGagTargetId={setGagTargetId}
                spyTargetId={spyTargetId}
                setSpyTargetId={setSpyTargetId}
                howl={howl}
                setHowl={setHowl}
                directive={directive}
                setDirective={setDirective}
                submitNightAction={submitNightAction}
                isHost={isHost}
                socket={socket}
                usedDirectives={privateState?.usedDirectives || []}
                alphaHowlUsed={privateState?.alphaHowlUsed}
              />
            )}

            {roomState.phase === 'DAY' && me?.alive && (
              <DayView
                alivePlayers={alivePlayers}
                me={me}
                voteCounts={voteCounts}
                vote={vote}
                isHost={isHost}
                socket={socket}
                radioDirective={roomState.radioDirective}
                debtorOf={privateState?.debtorOf}
                debtorOfNickname={privateState?.debtorOfNickname}
              />
            )}

            {roomState.phase === 'ENDED' && (
              <section className="pact-ending" style={{ borderColor: '#ba0c0c', background: 'rgba(14,8,8,0.7)' }}>
                <span>FIM DO PACTO DE SANGUE</span>
                <h2 style={{ color: '#ba0c0c' }}>{roomState.winner?.faction}</h2>
                <p style={{ color: '#fff', fontSize: '1.05rem' }}>{roomState.winner?.text}</p>
                {isHost && (
                  <button className="btn btn-danger" onClick={() => socket?.emit('pact_restart_lobby')} style={{ width: 'auto', alignSelf: 'center', marginTop: '0.8rem' }}>
                    REABRIR LOBBY DA VILA
                  </button>
                )}
              </section>
            )}

            <LogPanel log={roomState.log} />
            <PlayersPanel players={roomState.players} voteCounts={voteCounts} />

            {roomState.phase !== 'LOBBY' && <RoleGuide compact />}

            {privateState?.privateLog?.length > 0 && (
              <section className="pact-private-log" style={{ borderLeftColor: '#ba0c0c', background: 'rgba(0,0,0,0.7)' }}>
                <span>Segredos do seu Coração</span>
                {privateState.privateLog.map((entry, index) => <p key={`${entry}-${index}`} style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem' }}>{entry}</p>)}
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function LobbyView({ roomState, isHost, socket, settings, updateSettings, connectedPlayers }) {
  const ready = roomState.players.every(player => player.isHost || player.isReady);
  const minimumPlayers = getMinimumPlayers(settings.wolfCount);
  const canStart = connectedPlayers.length >= minimumPlayers && ready;

  return (
    <>
      <section className="pact-lobby-actions">
        <div>
          <span className="pact-section-label">Preparação do Pacto de Sangue</span>
          <p>
            O dono da sala configura o número de lobisomens. Ao iniciar, todos os integrantes receberão suas classes secretas de <b>Teodoro Sampaio</b>.
          </p>
        </div>

        <div className="pact-settings-grid">
          <label className="pact-setting">
            <span>Ameaça de Lobos</span>
            <select
              className="glass-select"
              disabled={!isHost}
              value={settings.wolfCount}
              onChange={(event) => updateSettings({ wolfCount: Number(event.target.value) })}
              style={{ color: '#ba0c0c', borderColor: 'rgba(186,12,12,0.3)' }}
            >
              <option value={1}>1 lobisomem</option>
              <option value={2}>2 lobisomens</option>
              <option value={3}>3 lobisomens</option>
            </select>
          </label>

          <label className="pact-setting pact-toggle-setting" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <span>Classes Especiais</span>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={settings.specialRoles}
              onChange={(event) => updateSettings({ specialRoles: event.target.checked })}
            />
          </label>

          <label className="pact-setting pact-toggle-setting" style={{ borderColor: 'rgba(255,255,255,0.08)', gridColumn: 'span 2' }}>
            <span>Revelar Classe de Morto</span>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={settings.revealDeadRoles !== false}
              onChange={(event) => updateSettings({ revealDeadRoles: event.target.checked })}
            />
          </label>
        </div>

        <div className="pact-rules-note" style={{ borderColor: '#ba0c0c', background: 'rgba(186,12,12,0.03)' }}>
          <strong>{connectedPlayers.length}/20 moradores na vila</strong>
          <span>Mínimo necessário para esta configuração: {minimumPlayers} jogadores.</span>
          <span>{settings.specialRoles ? 'Classes avançadas da Vila e Neutros caóticos ativadas.' : 'Modo clássico puro: Apenas lobos e aldeões simples.'}</span>
          <span>{settings.revealDeadRoles !== false ? 'Classes de moradores enforcados serão reveladas.' : 'As classes dos mortos permanecerão um mistério.'}</span>
        </div>

        {isHost ? (
          <button className="btn btn-danger" disabled={!canStart} onClick={() => socket?.emit('pact_start_game')}>
            SELAR PACTO DE SANGUE
          </button>
        ) : (
          <button className="btn btn-glass" onClick={() => socket?.emit('pact_toggle_ready')}>
            ALTERAR PRONTO
          </button>
        )}
      </section>

      <RoleGuide />
    </>
  );
}

function DeadScreen({ roleName }) {
  return (
    <section className="pact-dead-screen" style={{ borderColor: '#ba0c0c' }}>
      <span>SUA VIDA SE FOI</span>
      <strong>{roleName || 'SUA HISTÓRIA TERMINOU'}</strong>
      <p>
        Você foi assassinado ou enforcado por Teodoro Sampaio. Agora você é um espírito silencioso, apenas assistindo até o fim do pacto.
      </p>
    </section>
  );
}

function RoleCard({ roleName, hostNickname, stolenAbility, debtorOfNickname, team }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const guide = ROLE_GUIDE[roleName] || {
    side: 'Desconhecido',
    goal: 'Siga os sussurros do seu painel.',
    night: 'Aguarde a noite cair.',
    extra: 'Sem regra adicional.',
    tip: 'Observe com cautela.'
  };

  const sideColor = team === 'wolf' ? '#ba0c0c' : team === 'neutral' ? '#d4af37' : '#00e676';

  return (
    <div className="pact-card-container" onClick={() => setIsFlipped(!isFlipped)}>
      <div className={`pact-card-inner ${isFlipped ? 'is-flipped' : ''}`}>
        
        {/* Card Front: Confidencial */}
        <div className="pact-card-front">
          <div className="shield-icon-container" style={{ color: '#ba0c0c', borderColor: 'rgba(186,12,12,0.3)', background: 'rgba(186,12,12,0.04)' }}>
            SEGREDOS DA NOITE
          </div>
          <span className="shield-title" style={{ color: '#ba0c0c', textShadow: '0 0 5px rgba(186,12,12,0.4)' }}>
            REVELAR CLASSE
          </span>
          <span className="shield-subtitle" style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            Toque para girar a carta de forma segura.
          </span>
        </div>

        {/* Card Back: Detalhes da Classe */}
        <div className={`pact-card-back ${team === 'wolf' ? 'is-wolf' : team === 'neutral' ? 'is-neutral' : ''}`}>
          <span className="role-badge-large" style={{ 
            color: sideColor, 
            borderColor: sideColor, 
            background: `${sideColor}08` 
          }}>
            {roleName}
          </span>
          <div className="pact-role-details" style={{ fontSize: '0.8rem', textAlign: 'left', width: '100%' }}>
            <p><b>Facção:</b> <span style={{ color: sideColor }}>{guide.side}</span></p>
            <p><b>Meta:</b> {guide.goal}</p>
            <p><b>Ação:</b> {guide.night}</p>
            <p><b>Bônus:</b> {guide.extra}</p>
            {stolenAbility && <p style={{ color: '#00e676' }}><b>Poder Roubado:</b> {stolenAbility.name}</p>}
            {debtorOfNickname && <p className="debt-blood-badge">Seu voto pertence ao Agiota ({debtorOfNickname})</p>}
            {hostNickname && <p><b>Hospedeiro:</b> {hostNickname}</p>}
          </div>
        </div>

      </div>
    </div>
  );
}

function NightView(props) {
  const {
    roleName, livingTargets, deadTargets, anyTargets, targetId, setTargetId,
    secondTargetId, setSecondTargetId, swapFirstId, setSwapFirstId, swapSecondId, setSwapSecondId,
    gagTargetId, setGagTargetId, spyTargetId, setSpyTargetId, howl, setHowl, directive, setDirective,
    submitNightAction, isHost, socket, usedDirectives, alphaHowlUsed
  } = props;

  const needsDead = roleName === 'O Coveiro Ladrão de Túmulos';
  const targets = needsDead ? deadTargets : livingTargets;

  // lobisomens adicionais
  const isIlusionista = roleName === 'O Lobisomem Ilusionista';
  const isHipnotista = roleName === 'O Lobisomem Hipnotista';
  const isMimetico = roleName === 'O Lobisomem Mimético';
  const isAlpha = roleName === 'O Alfa Alfaçado';

  // Vila adicionais
  const isFiscal = roleName === 'O Fiscal da Prefeitura';
  const isBeata = roleName === 'A Beata Milagrosa';
  
  // Neutro
  const isRadialista = roleName === 'O Radialista da Rádio Teodoro';

  const hasAction = !['Aldeão Marcado', 'O Parasita Sombrio'].includes(roleName);

  return (
    <section className="pact-action-box" style={{ borderColor: 'rgba(100,100,220,0.3)', background: 'rgba(8,8,12,0.85)' }}>
      <h2 style={{ color: '#8b93ff' }}>A Noite Caiu</h2>
      <p style={{ color: '#a0a0b0' }}>Use seus poderes secretos e sele sua ação. Se você não possuir poder ou já agiu, apenas aguarde.</p>
      
      {hasAction ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
          
          {/* Target principal (para a maioria das classes e ataque comum dos lobos) */}
          {!isRadialista && (
            <label className="pact-setting">
              <span>{isBeata ? 'Proteger Vivo / Purificar Morto' : needsDead ? 'Desenterrar Corpo Morto' : 'Alvo Principal'}</span>
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="glass-select" style={{ color: '#8b93ff', borderColor: 'rgba(100,100,220,0.3)' }}>
                <option value="">{needsDead ? 'ESCOLHER MORTO' : 'SELECIONE O ALVO'}</option>
                {(isBeata ? anyTargets : targets).map(player => (
                  <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
                ))}
              </select>
            </label>
          )}

          {/* Poder de Radialista */}
          {isRadialista && (
            <label className="pact-setting">
              <span>Transmitir Teoria da Conspiração</span>
              <select value={directive} onChange={(event) => setDirective(event.target.value)} className="glass-select" style={{ color: '#d4af37', borderColor: 'rgba(212,175,55,0.3)' }}>
                <option value="">SELECIONE A DIRETRIZ</option>
                {!usedDirectives.includes('Lei Seca') && <option value="Lei Seca">LEI SECA (Cancela os votos do dia)</option>}
                {!usedDirectives.includes('Fake News') && <option value="Fake News">FAKE NEWS (Enforca quem tem menos votos)</option>}
                {!usedDirectives.includes('Censura Federal') && <option value="Censura Federal">CENSURA FEDERAL (Votos secretos)</option>}
              </select>
            </label>
          )}

          {/* Poder do Fiscal da Prefeitura */}
          {isFiscal && (
            <label className="pact-setting">
              <span>Segundo Alvo da Auditoria</span>
              <select value={secondTargetId} onChange={(event) => setSecondTargetId(event.target.value)} className="glass-select" style={{ color: '#8b93ff', borderColor: 'rgba(100,100,220,0.3)' }}>
                <option value="">SELECIONE SEGUNDO ALVO</option>
                {livingTargets.filter(p => p.id !== targetId).map(player => (
                  <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
                ))}
              </select>
            </label>
          )}

          {/* Poder do Lobisomem Ilusionista (Troca de Votos) */}
          {isIlusionista && (
            <>
              <label className="pact-setting">
                <span>Ilusão: Primeiro Jogador Vivo</span>
                <select value={swapFirstId} onChange={(event) => setSwapFirstId(event.target.value)} className="glass-select" style={{ color: '#ba0c0c', borderColor: 'rgba(186,12,12,0.3)' }}>
                  <option value="">PRIMEIRO ALVO DE VOTO</option>
                  {livingTargets.map(player => (
                    <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
                  ))}
                </select>
              </label>

              <label className="pact-setting">
                <span>Ilusão: Segundo Jogador Vivo</span>
                <select value={swapSecondId} onChange={(event) => setSwapSecondId(event.target.value)} className="glass-select" style={{ color: '#ba0c0c', borderColor: 'rgba(186,12,12,0.3)' }}>
                  <option value="">SEGUNDO ALVO DE VOTO</option>
                  {livingTargets.filter(p => p.id !== swapFirstId).map(player => (
                    <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {/* Poder do Lobisomem Hipnotista (Gag Mordaça) */}
          {isHipnotista && (
            <label className="pact-setting">
              <span>Lançar Mordaça do Pavor</span>
              <select value={gagTargetId} onChange={(event) => setGagTargetId(event.target.value)} className="glass-select" style={{ color: '#ba0c0c', borderColor: 'rgba(186,12,12,0.3)' }}>
                <option value="">AMORDAÇAR JOGADOR</option>
                {livingTargets.map(player => (
                  <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
                ))}
              </select>
            </label>
          )}

          {/* Poder do Lobisomem Mimético (Spy) */}
          {isMimetico && (
            <label className="pact-setting">
              <span>Mimetizar Investigador (Copiar Relatório)</span>
              <select value={spyTargetId} onChange={(event) => setSpyTargetId(event.target.value)} className="glass-select" style={{ color: '#ba0c0c', borderColor: 'rgba(186,12,12,0.3)' }}>
                <option value="">ESPIONAR RELATÓRIO DE JOGADOR</option>
                {livingTargets.map(player => (
                  <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
                ))}
              </select>
            </label>
          )}

          {/* Uivo do Alfa */}
          {isAlpha && !alphaHowlUsed && (
            <label className="pact-check" style={{ marginTop: '0.4rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={howl} onChange={(event) => setHowl(event.target.checked)} style={{ accentColor: '#ba0c0c' }} />
              Uivar Demência (Forçar voto contra si mesmo)
            </label>
          )}

          <button 
            className="btn btn-secondary" 
            onClick={submitNightAction} 
            disabled={
              (!isRadialista && !targetId) || 
              (isRadialista && !directive) || 
              (isFiscal && !secondTargetId) ||
              (isIlusionista && (!swapFirstId || !swapSecondId)) ||
              (isHipnotista && !gagTargetId) ||
              (isMimetico && !spyTargetId)
            }
            style={{ borderColor: '#8b93ff', color: '#8b93ff', background: 'rgba(100,100,220,0.05)', marginTop: '0.5rem' }}
          >
            CONFIRMAR DECISÃO NOTURNA
          </button>
        </div>
      ) : (
        <button className="btn btn-glass" onClick={() => socket?.emit('pact_night_action', { targetId: livingTargets[0]?.id })}>
          AGUARDAR TRANQUILAMENTE A NOITE
        </button>
      )}

      {isHost && (
        <button className="btn btn-accent" onClick={() => socket?.emit('pact_resolve_night')} style={{ marginTop: '0.7rem' }}>
          RESOLVER A NOITE
        </button>
      )}
    </section>
  );
}

function DayView({ alivePlayers, me, voteCounts, vote, isHost, socket, radioDirective, debtorOf, debtorOfNickname }) {
  const isCensura = radioDirective === 'Censura Federal';
  const isLeiSeca = radioDirective === 'Lei Seca';

  return (
    <section className="pact-action-box" style={{ borderColor: 'rgba(186,12,12,0.25)' }}>
      <h2>O Dia Abriu</h2>
      
      {isLeiSeca ? (
        <p style={{ color: '#ba0c0c', fontFamily: 'var(--font-mono)' }}>
          A Lei Seca está ativa! Nenhum enforcamento é permitido hoje. Use o tempo para dialogar e planejar.
        </p>
      ) : (
        <p>Discutam em campo. Ao entrarem em acordo, cliquem em quem deve ser enforcado hoje.</p>
      )}

      {debtorOfNickname && (
        <p className="debt-blood-badge" style={{ alignSelf: 'center', marginBottom: '0.5rem' }}>
          Seu voto está hipotecado! Você votará automaticamente igual a: {debtorOfNickname}.
        </p>
      )}

      <div className="pact-vote-grid">
        {alivePlayers.map(player => (
          <button
            key={player.id}
            className="pact-vote-button"
            disabled={!me?.alive || isLeiSeca || player.id === me.id || Boolean(debtorOf)}
            onClick={() => vote(player.id)}
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <span>{player.nickname}</span>
            <strong style={{ color: '#ba0c0c' }}>
              {isCensura ? '?' : (voteCounts[player.id] || 0)}
            </strong>
          </button>
        ))}
      </div>

      {isHost && (
        <div className="pact-host-row" style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-accent" onClick={() => socket?.emit('pact_end_day')}>ENCERRAR JULGAMENTO</button>
          <button className="btn btn-danger" onClick={() => socket?.emit('pact_next_night')}>INICIAR NOITE SEGUINTE</button>
        </div>
      )}
    </section>
  );
}

function RoleGuide({ compact = false }) {
  return (
    <section className={`pact-guide ${compact ? 'is-compact' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.4)' }}>
      <span className="pact-section-label" style={{ color: '#ba0c0c' }}>Dicionário de Classes de Teodoro</span>
      {ROLE_ORDER.map((name) => {
        const guide = ROLE_GUIDE[name];
        return (
          <details key={name} className="pact-guide-item" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)' }}>
            <summary>
              <strong>{name}</strong>
              <small style={{ color: guide.side === 'Lobisomens' ? '#ba0c0c' : guide.side === 'Neutro' || guide.side === 'Neutro Caótico' ? '#d4af37' : '#00e676' }}>
                {guide.side}
              </small>
            </summary>
            <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.35 }}>
              <b>Meta:</b> {guide.goal}<br />
              <b>Ação Noturna:</b> {guide.night}<br />
              <b>Passiva/Extra:</b> {guide.extra}<br />
              <b>Dica:</b> <i>{guide.tip}</i>
            </p>
          </details>
        );
      })}
    </section>
  );
}

function LogPanel({ log }) {
  return (
    <section className="pact-log" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.6)' }}>
      <span className="pact-section-label" style={{ color: '#ba0c0c' }}>Crônica da Vila de Teodoro</span>
      {log.map((entry, index) => <p key={`${entry}-${index}`} style={{ fontSize: '0.85rem', color: entry.startsWith('Amanhecer') || entry.startsWith('A Noite') ? '#ba0c0c' : 'rgba(255,255,255,0.8)' }}>{entry}</p>)}
    </section>
  );
}

function PlayersPanel({ players, voteCounts }) {
  return (
    <section className="pact-players" style={{ gap: '0.5rem', background: 'transparent', border: 'none', padding: 0 }}>
      {players.map(player => (
        <div key={player.id} className={`pact-player ${player.alive ? '' : 'is-dead'}`} style={{ 
          borderColor: player.alive ? 'rgba(255,255,255,0.05)' : 'rgba(186,12,12,0.22)',
          background: player.alive ? 'rgba(0,0,0,0.55)' : 'rgba(10,5,5,0.6)'
        }}>
          <span style={{ color: player.alive ? '#fff' : '#a03030' }}>
            {player.nickname.toUpperCase()} {player.isHost && '👑'}
          </span>
          <small style={{ color: player.alive ? '#00e676' : '#a03030' }}>
            {!player.connected ? 'offline' : player.alive ? `${voteCounts[player.id] || 0} votos` : (player.revealedRole || 'morto')}
          </small>
        </div>
      ))}
    </section>
  );
}

function phaseLabel(phase) {
  if (phase === 'LOBBY') return 'Lobby';
  if (phase === 'NIGHT') return 'Noite';
  if (phase === 'DAY') return 'Dia';
  return 'Encerrado';
}

function getMinimumPlayers(wolfCount) {
  if (wolfCount >= 3) return 8;
  if (wolfCount === 2) return 6;
  return 4;
}
