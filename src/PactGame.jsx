import { useEffect, useMemo, useState } from 'react';

const ROLE_HELP = {
  'O Alfa Alfaçado': 'Lobisomem. Pode atacar e usar Uivo da Demência uma vez para sabotar o voto de alguém.',
  'A Abominação Costurada': 'Lobisomem. Participa do ataque da matilha.',
  'O Flagelante': 'Vila. Investiga a facção de um jogador durante a noite.',
  'O Carniceiro Devoto': 'Vila. Pode consumir um morto: lobo dá proteção, aldeão tira seu voto.',
  'O Súcubo do Confessionário': 'Vila. Liga dois vivos; se forem lobo e aldeão, o lobo perde o voto.',
  'O Colecionador de Pecados': 'Neutro. Descobre classes. Vence sozinho se conhecer 3 mortos.',
  'O Parasita Sombrio': 'Neutro. Vence se seu hospedeiro for enforcado pela vila.',
  'Aldeão Marcado': 'Vila. Sobreviva, discuta e vote para eliminar os lobisomens.'
};

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
      setTimeout(() => setMessage((current) => current === msg ? null : current), 3000);
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

  const me = useMemo(
    () => roomState?.players.find(player => player.id === socket?.id),
    [roomState, socket?.id]
  );
  const isHost = Boolean(me?.isHost);
  const alivePlayers = roomState?.players.filter(player => player.alive) || [];
  const deadPlayers = roomState?.players.filter(player => !player.alive) || [];
  const roleName = privateState?.role?.name;
  const livingTargets = alivePlayers.filter(player => player.id !== socket?.id);
  const anyTargets = roomState?.players.filter(player => player.id !== socket?.id) || [];
  const deadTargets = deadPlayers;

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
            Dunwich fechou os portões. Crie uma sala, distribua papéis secretos e sobreviva ao ciclo de noite e julgamento.
          </p>

          <form onSubmit={createRoom} className="pact-form">
            <label>Apelido</label>
            <input value={nickname} onChange={(event) => handleNicknameChange(event.target.value)} maxLength={15} required />
            <button className="btn btn-primary" type="submit">CRIAR PACTO</button>
          </form>

          <form onSubmit={joinRoom} className="pact-form">
            <label>Código da sala</label>
            <input value={inputRoomId} onChange={(event) => setInputRoomId(event.target.value.toUpperCase())} maxLength={4} />
            <button className="btn btn-secondary" type="submit">ENTRAR NO PACTO</button>
          </form>
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
          <span>Noite {roomState.nightNumber} / Dia {roomState.dayNumber}</span>
        </div>

        {roomState.phase === 'LOBBY' && (
          <LobbyView roomState={roomState} isHost={isHost} socket={socket} />
        )}

        {roomState.phase !== 'LOBBY' && privateState?.role && (
          <section className="pact-role-card">
            <span>Sua classe</span>
            <strong>{privateState.role.name}</strong>
            <p>{ROLE_HELP[privateState.role.name] || `Facção: ${privateState.role.faction}`}</p>
            {privateState.hostNickname && <p>Hospedeiro: {privateState.hostNickname}</p>}
          </section>
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

function LobbyView({ roomState, isHost, socket }) {
  const ready = roomState.players.every(player => player.isHost || player.isReady);
  return (
    <section className="pact-lobby-actions">
      <p>Reúna pelo menos 4 jogadores. Quando todos estiverem prontos, o host sela o pacto.</p>
      {isHost ? (
        <button className="btn btn-primary" disabled={roomState.players.length < 4 || !ready} onClick={() => socket?.emit('pact_start_game')}>
          SELAR O PACTO
        </button>
      ) : (
        <button className="btn btn-secondary" onClick={() => socket?.emit('pact_toggle_ready')}>
          ALTERAR PRONTO
        </button>
      )}
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
      <p>Escolha em silêncio. O amanhecer cobra tudo.</p>
      {hasAction ? (
        <>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="glass-select">
            <option value="">ALVO PRINCIPAL</option>
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
      <p>Discutam na vida real. Quando escolherem, votem no condenado.</p>
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

function LogPanel({ log }) {
  return (
    <section className="pact-log">
      <span>Crônica de Dunwich</span>
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
            {player.alive ? `${voteCounts[player.id] || 0} votos` : player.revealedRole}
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
