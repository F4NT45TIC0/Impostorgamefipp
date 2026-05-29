import { useEffect, useMemo, useState } from 'react';

const ROLE_GUIDE = {
  'O Alfa Alfaçado': {
    side: 'Lobisomens',
    goal: 'Vencer quando os lobisomens ficarem em número igual ou maior que a Vila de Teodoro Sampaio.',
    night: 'Toda noite pode escolher uma pessoa viva para ser o ataque da matilha.',
    extra: 'Uma vez por partida pode marcar "Uivo da Demência". A pessoa escolhida votará contra si mesma no próximo dia, mesmo achando que votou em outra pessoa.',
    tip: 'Combine com outros lobisomens fora da tela, mas envie apenas um alvo confiável para a noite não ficar perdida.'
  },
  'A Abominação Costurada': {
    side: 'Lobisomens',
    goal: 'Ajudar a matilha a igualar ou superar o número de aldeões vivos.',
    night: 'Escolhe uma pessoa viva para atacar durante a noite. Se houver mais de um lobisomem, o primeiro ataque registrado será usado.',
    extra: 'Nesta versão rápida, ela funciona como o segundo lobisomem forte da matilha.',
    tip: 'Use a discussão do dia para parecer útil para a vila, não para defender lobisomem de forma óbvia.'
  },
  'Lobisomem da Matilha': {
    side: 'Lobisomens',
    goal: 'Ajudar a matilha a dominar a Vila de Teodoro Sampaio.',
    night: 'Escolhe uma pessoa viva para atacar. O ataque da matilha é resolvido em conjunto.',
    extra: 'Não possui poder especial além do ataque, então seu poder real é blefar bem no dia.',
    tip: 'Com 3 lobisomens, votem de forma coordenada, mas sem parecer um bloco automático.'
  },
  'O Flagelante': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Descobrir quem ameaça a vila e ajudar a eliminar todos os lobisomens.',
    night: 'Escolhe uma pessoa viva e descobre a facção dela: Lobisomens, Vila de Teodoro Sampaio ou Neutro.',
    extra: 'Se for enforcado durante o dia, a culpa coletiva bloqueia todas as habilidades da próxima noite.',
    tip: 'Não entregue sua informação cedo demais. Tente puxar votos no alvo certo sem se expor de graça.'
  },
  'O Carniceiro Devoto': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Sobreviver e usar os mortos para entender o que aconteceu.',
    night: 'Escolhe alguém que já morreu. Se era lobisomem, você fica protegido na próxima noite. Se era aldeão, você fica abalado e perde o voto no dia seguinte.',
    extra: 'Ele é mais útil depois que a primeira morte acontece. Na primeira noite pode apenas aguardar.',
    tip: 'Olhe a lista de mortos antes de agir. Escolher qualquer morto sem pensar pode te tirar o voto no pior momento.'
  },
  'O Súcubo do Confessionário': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Usar chantagem para enfraquecer os lobisomens sem revelar tudo no chat.',
    night: 'Escolhe duas pessoas vivas. Se uma for lobisomem e a outra for da vila, o lobisomem perde o voto.',
    extra: 'Se as duas pessoas forem da mesma facção, nada acontece.',
    tip: 'Escolha pares que estão se defendendo demais ou que parecem estar combinando discurso.'
  },
  'O Colecionador de Pecados': {
    side: 'Neutro',
    goal: 'Vencer sozinho se sobreviver e conhecer a classe exata de pelo menos 3 jogadores mortos.',
    night: 'Escolhe qualquer jogador e descobre a classe exata dele.',
    extra: 'Você não joga pela vila nem pelos lobisomens. Sua vitória rouba a vitória dos outros.',
    tip: 'Investigue pessoas que podem morrer logo. Informação sobre morto vale muito mais para sua condição de vitória.'
  },
  'O Parasita Sombrio': {
    side: 'Neutro',
    goal: 'Vencer sozinho se seu hospedeiro secreto for enforcado pela Vila de Teodoro Sampaio.',
    night: 'Não escolhe ação. No início da partida o sistema sorteia um hospedeiro para você.',
    extra: 'Se seu hospedeiro morrer atacado à noite, você morre junto. Se ele sobreviver até o fim, você perde.',
    tip: 'Tente fazer seu hospedeiro parecer suspeito o bastante para ser votado, mas não tão suspeito a ponto de ser atacado à noite.'
  },
  'Aldeão Marcado': {
    side: 'Vila de Teodoro Sampaio',
    goal: 'Eliminar todos os lobisomens e impedir que neutros roubem a partida.',
    night: 'Não possui ação noturna. Use o botão de aguardar para confirmar que está vivo.',
    extra: 'Seu poder é votar, discutir e perceber contradições.',
    tip: 'Faça perguntas objetivas: em quem a pessoa confia, em quem votaria, e por quê.'
  }
};

const ROLE_ORDER = [
  'O Alfa Alfaçado',
  'A Abominação Costurada',
  'Lobisomem da Matilha',
  'O Flagelante',
  'O Carniceiro Devoto',
  'O Súcubo do Confessionário',
  'O Colecionador de Pecados',
  'O Parasita Sombrio',
  'Aldeão Marcado'
];

export default function PactGame({ socket, onBack }) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('pact_nickname') || '');
  const [inputRoomId, setInputRoomId] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [privateState, setPrivateState] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [secondTargetId, setSecondTargetId] = useState('');
  const [howl, setHowl] = useState(false);
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

  useEffect(() => {
    setTargetId('');
    setSecondTargetId('');
    setHowl(false);
  }, [roomState?.phase, roleNameFromState(privateState)]);

  const me = useMemo(
    () => roomState?.players.find(player => player.id === socket?.id),
    [roomState, socket?.id]
  );
  const isHost = Boolean(me?.isHost);
  const connectedPlayers = roomState?.players.filter(player => player.connected) || [];
  const alivePlayers = roomState?.players.filter(player => player.alive) || [];
  const deadPlayers = roomState?.players.filter(player => !player.alive) || [];
  const roleName = privateState?.role?.name;
  const livingTargets = alivePlayers.filter(player => player.id !== socket?.id);
  const anyTargets = roomState?.players.filter(player => player.id !== socket?.id) || [];
  const deadTargets = deadPlayers;
  const settings = roomState?.settings || { wolfCount: 1, specialRoles: true };

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
      howl
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
          <span className="hub-kicker">LOBISOMEM // HORROR SOCIAL</span>
          <h1 className="pact-title">O PACTO DE SANGUE</h1>
          <p>
            A Vila de Teodoro Sampaio fechou os portões. Crie uma sala, escolha a quantidade de lobisomens e jogue com até 20 pessoas.
          </p>

          <form onSubmit={createRoom} className="pact-form">
            <label>Apelido</label>
            <input value={nickname} onChange={(event) => handleNicknameChange(event.target.value)} maxLength={15} required autoComplete="nickname" />
            <button className="btn btn-primary" type="submit">CRIAR PACTO</button>
          </form>

          <form onSubmit={joinRoom} className="pact-form">
            <label>Código da sala</label>
            <input value={inputRoomId} onChange={(event) => setInputRoomId(event.target.value.toUpperCase())} maxLength={4} autoCapitalize="characters" />
            <button className="btn btn-secondary" type="submit">ENTRAR NO PACTO</button>
          </form>

          <RoleGuide />
        </section>
      </div>
    );
  }

  return (
    <div className="pact-container">
      {message && <div className="error-popup"><span>{message}</span></div>}

      <section className="pact-panel">
        <div className="pact-room-header">
          <div>
            <span className="hub-kicker">SALA {roomId}</span>
            <h1 className="pact-title">O PACTO DE SANGUE</h1>
          </div>
          <button type="button" className="hub-back-button" onClick={leaveRoom}>SAIR</button>
        </div>

        <div className="pact-phase-strip">
          <span>{phaseLabel(roomState.phase)}</span>
          <span>{alivePlayers.length} vivos</span>
          <span>{connectedPlayers.length}/20 conectados</span>
        </div>

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
          <RoleCard roleName={privateState.role.name} hostNickname={privateState.hostNickname} />
        )}

        {roomState.phase === 'NIGHT' && (
          <NightView
            roleName={roleName}
            livingTargets={livingTargets}
            deadTargets={deadTargets}
            anyTargets={anyTargets}
            targetId={targetId}
            setTargetId={setTargetId}
            secondTargetId={secondTargetId}
            setSecondTargetId={setSecondTargetId}
            howl={howl}
            setHowl={setHowl}
            submitNightAction={submitNightAction}
            isHost={isHost}
            socket={socket}
          />
        )}

        {roomState.phase === 'DAY' && (
          <DayView
            alivePlayers={alivePlayers}
            me={me}
            voteCounts={voteCounts}
            vote={vote}
            isHost={isHost}
            socket={socket}
          />
        )}

        {roomState.phase === 'ENDED' && (
          <section className="pact-ending">
            <span>FIM DO PACTO</span>
            <h2>{roomState.winner?.faction}</h2>
            <p>{roomState.winner?.text}</p>
            {isHost && (
              <button className="btn btn-primary" onClick={() => socket?.emit('pact_restart_lobby')}>
                REABRIR LOBBY
              </button>
            )}
          </section>
        )}

        <LogPanel log={roomState.log} />
        <PlayersPanel players={roomState.players} voteCounts={voteCounts} />

        {roomState.phase !== 'LOBBY' && <RoleGuide compact />}

        {privateState?.privateLog?.length > 0 && (
          <section className="pact-private-log">
            <span>Mensagens privadas</span>
            {privateState.privateLog.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
          </section>
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
          <span className="pact-section-label">Preparação da partida</span>
          <p>
            O host escolhe de 1 a 3 lobisomens. O resto da sala vira aldeão ou recebe classes especiais, se essa opção estiver ligada.
          </p>
        </div>

        <div className="pact-settings-grid">
          <label className="pact-setting">
            <span>Lobisomens</span>
            <select
              className="glass-select"
              disabled={!isHost}
              value={settings.wolfCount}
              onChange={(event) => updateSettings({ wolfCount: Number(event.target.value) })}
            >
              <option value={1}>1 lobisomem</option>
              <option value={2}>2 lobisomens</option>
              <option value={3}>3 lobisomens</option>
            </select>
          </label>

          <label className="pact-setting pact-toggle-setting">
            <span>Classes especiais</span>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={settings.specialRoles}
              onChange={(event) => updateSettings({ specialRoles: event.target.checked })}
            />
          </label>
        </div>

        <div className="pact-rules-note">
          <strong>{connectedPlayers.length}/20 jogadores</strong>
          <span>Mínimo com essa configuração: {minimumPlayers}. Máximo da sala: 20.</span>
          <span>{settings.specialRoles ? 'Classes especiais podem entrar além de aldeões comuns.' : 'Modo simples: lobisomens contra aldeões marcados.'}</span>
        </div>

        {isHost ? (
          <button className="btn btn-primary" disabled={!canStart} onClick={() => socket?.emit('pact_start_game')}>
            SELAR O PACTO
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={() => socket?.emit('pact_toggle_ready')}>
            ALTERAR PRONTO
          </button>
        )}
      </section>

      <RoleGuide />
    </>
  );
}

function RoleCard({ roleName, hostNickname }) {
  const guide = ROLE_GUIDE[roleName] || {
    side: 'Desconhecido',
    goal: 'Siga as mensagens da partida.',
    night: 'Aguarde o comando da noite.',
    extra: 'Sem regra adicional.',
    tip: 'Observe os votos.'
  };

  return (
    <section className="pact-role-card">
      <span>Sua classe</span>
      <strong>{roleName}</strong>
      <div className="pact-role-details">
        <p><b>Facção:</b> {guide.side}</p>
        <p><b>Objetivo:</b> {guide.goal}</p>
        <p><b>Noite:</b> {guide.night}</p>
        <p><b>Detalhe:</b> {guide.extra}</p>
        <p><b>Dica:</b> {guide.tip}</p>
        {hostNickname && <p><b>Hospedeiro:</b> {hostNickname}</p>}
      </div>
    </section>
  );
}

function NightView(props) {
  const {
    roleName, livingTargets, deadTargets, anyTargets, targetId, setTargetId,
    secondTargetId, setSecondTargetId, howl, setHowl, submitNightAction, isHost, socket
  } = props;
  const needsDead = roleName === 'O Carniceiro Devoto';
  const needsAny = roleName === 'O Colecionador de Pecados';
  const targets = needsDead ? deadTargets : needsAny ? anyTargets : livingTargets;
  const needsSecond = roleName === 'O Súcubo do Confessionário';
  const hasAction = !['Aldeão Marcado', 'O Parasita Sombrio'].includes(roleName);

  return (
    <section className="pact-action-box">
      <h2>A Noite Caiu</h2>
      <p>Escolha sua ação em silêncio. Depois toque em enviar. Se você não tiver poder, apenas aguarde a noite.</p>
      {hasAction ? (
        <>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="glass-select">
            <option value="">{needsDead ? 'ESCOLHA UM MORTO' : 'ALVO PRINCIPAL'}</option>
            {targets.map(player => (
              <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
            ))}
          </select>

          {needsSecond && (
            <select value={secondTargetId} onChange={(event) => setSecondTargetId(event.target.value)} className="glass-select">
              <option value="">SEGUNDO ALVO</option>
              {livingTargets.map(player => (
                <option key={player.id} value={player.id}>{player.nickname.toUpperCase()}</option>
              ))}
            </select>
          )}

          {roleName === 'O Alfa Alfaçado' && (
            <label className="pact-check">
              <input type="checkbox" checked={howl} onChange={(event) => setHowl(event.target.checked)} />
              Usar Uivo da Demência
            </label>
          )}

          <button className="btn btn-primary" onClick={submitNightAction} disabled={!targetId || (needsSecond && !secondTargetId)}>
            ENVIAR AÇÃO
          </button>
        </>
      ) : (
        <button className="btn btn-glass" onClick={() => socket?.emit('pact_night_action', { targetId: livingTargets[0]?.id })}>
          AGUARDAR A NOITE
        </button>
      )}

      {isHost && (
        <button className="btn btn-accent" onClick={() => socket?.emit('pact_resolve_night')}>
          RESOLVER NOITE
        </button>
      )}
    </section>
  );
}

function DayView({ alivePlayers, me, voteCounts, vote, isHost, socket }) {
  return (
    <section className="pact-action-box">
      <h2>O Dia Abriu</h2>
      <p>Discutam na vida real. Quando a mesa decidir, cada pessoa viva vota em quem deve ser enforcado.</p>
      <div className="pact-vote-grid">
        {alivePlayers.map(player => (
          <button
            key={player.id}
            className="pact-vote-button"
            disabled={!me?.alive || !me?.canVote || player.id === me.id}
            onClick={() => vote(player.id)}
          >
            <span>{player.nickname}</span>
            <strong>{voteCounts[player.id] || 0}</strong>
          </button>
        ))}
      </div>
      {isHost && (
        <div className="pact-host-row">
          <button className="btn btn-accent" onClick={() => socket?.emit('pact_end_day')}>ENCERRAR DIA</button>
          <button className="btn btn-primary" onClick={() => socket?.emit('pact_next_night')}>PRÓXIMA NOITE</button>
        </div>
      )}
    </section>
  );
}

function RoleGuide({ compact = false }) {
  return (
    <section className={`pact-guide ${compact ? 'is-compact' : ''}`}>
      <span className="pact-section-label">Guia das classes</span>
      {ROLE_ORDER.map((name) => {
        const guide = ROLE_GUIDE[name];
        return (
          <details key={name} className="pact-guide-item">
            <summary>
              <strong>{name}</strong>
              <small>{guide.side}</small>
            </summary>
            <p><b>Objetivo:</b> {guide.goal}</p>
            <p><b>Ação:</b> {guide.night}</p>
            <p><b>Regra:</b> {guide.extra}</p>
            <p><b>Dica:</b> {guide.tip}</p>
          </details>
        );
      })}
    </section>
  );
}

function LogPanel({ log }) {
  return (
    <section className="pact-log">
      <span>Crônica de Teodoro Sampaio</span>
      {log.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
    </section>
  );
}

function PlayersPanel({ players, voteCounts }) {
  return (
    <section className="pact-players">
      {players.map(player => (
        <div key={player.id} className={`pact-player ${player.alive ? '' : 'is-dead'}`}>
          <span>{player.nickname.toUpperCase()}</span>
          <small>
            {!player.connected ? 'offline' : player.alive ? `${voteCounts[player.id] || 0} votos` : player.revealedRole}
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

function roleNameFromState(privateState) {
  return privateState?.role?.name || '';
}
