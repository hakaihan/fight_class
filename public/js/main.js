import { Net } from './net.js';
import state, { otherKey } from './state.js';
import * as ui from './ui.js';
import * as anim from './anim.js';
import * as render from './render.js';
import { CHAR_META, EFFECT_LABELS } from './charMeta.js';
import { C2S, S2C } from '../shared/protocol.js';

const net = new Net();
const animState = anim.createAnimState();
const ctx = ui.el.canvas.getContext('2d');

function toSide(seatKey) {
	return seatKey === state.youKey ? 'me' : 'opponent';
}

function nicknameOf(seatKey) {
	const idx = seatKey === 'p1' ? 0 : 1;
	return state.lobbyPlayers[idx]?.nickname || (seatKey === state.youKey ? '나' : '상대');
}

function charIdOf(seatKey, snapshot) {
	return snapshot.players[seatKey].charId;
}

// ---------- 로비 ----------

ui.el.createRoomBtn.addEventListener('click', () => joinOrCreate('create'));
ui.el.joinRoomBtn.addEventListener('click', () => joinOrCreate('join'));

async function joinOrCreate(action) {
	const nickname = ui.el.nicknameInput.value.trim();
	if (!nickname) return ui.setLobbyError('닉네임을 입력하세요.');

	let roomId;
	if (action === 'join') {
		roomId = ui.el.roomCodeInput.value.trim().toUpperCase();
		if (!/^[A-Z0-9]{6}$/.test(roomId)) return ui.setLobbyError('방 코드는 영문/숫자 6자리입니다.');
	}

	ui.setLobbyError('');
	try {
		await net.connect({ action, nickname, roomId });
	} catch {
		return ui.setLobbyError('방에 연결할 수 없습니다. 코드를 확인하세요.');
	}
	state.nickname = nickname;
	registerHandlers();
	ui.showScreen('select');
}

// ---------- 서버 메시지 핸들러 ----------

function registerHandlers() {
	net.on(S2C.ROOM_STATE, onRoomState);
	net.on(S2C.BATTLE_START, onBattleStart);
	net.on(S2C.BATTLE_TURN, onBattleTurn);
	net.on(S2C.BATTLE_END, onBattleEnd);
	net.on(S2C.GAME_ERROR, onGameError);
	net.on('_close', onDisconnected);
}

function onRoomState(payload) {
	state.roomId = payload.roomId;
	state.phase = payload.phase;
	state.lobbyPlayers = payload.players;

	if (payload.phase === 'lobby' || payload.phase === 'select') {
		ui.showScreen('select');
		ui.renderSelectScreen(payload.roomId, payload.players);
	}
}

function onBattleStart(payload) {
	state.youKey = payload.youKey;
	state.snapshot = payload.snapshot;
	state.pendingSnapshot = null;
	state.phase = 'battle';
	animState.queue.length = 0;
	animState.playing = false;
	animState.floatingTexts = [];

	ui.clearLog();
	ui.setSkillLabels(charIdOf(state.youKey, state.snapshot));
	ui.showScreen('battle');
	renderHud();
}

function onBattleTurn(payload) {
	const before = state.snapshot;
	for (const ev of payload.events) {
		enqueueAnimStep(ev, before);
		logEvent(ev, before);
	}
	state.pendingSnapshot = payload.snapshot;
	state.actionPending = false;
}

function onBattleEnd(payload) {
	state.battleEnd = payload;
	// 상대가 나가서 온 종료는 battle:turn(애니메이션)이 따라오지 않으므로 즉시 화면 전환.
	if (payload.reason === 'opponent_left') {
		state.phase = 'ended';
		finishBattle();
	}
}

function onGameError(payload) {
	state.actionPending = false;
	ui.appendLog(`⚠ ${payload.message || '요청이 거부되었습니다.'}`);
}

function onDisconnected() {
	if (state.phase !== 'lobby') {
		ui.setLobbyError('연결이 끊어졌습니다. 새로고침 후 다시 시도해주세요.');
	}
}

// ---------- 애니메이션 큐 채우기 / 로그 ----------

function enqueueAnimStep(ev, snapshotBefore) {
	if (ev.type === 'skill_cast') {
		const side = toSide(ev.actor);
		const charId = charIdOf(ev.actor, snapshotBefore);
		anim.enqueue(animState, { kind: 'skill_cast', side, color: CHAR_META[charId].swingColor });
	} else if (ev.type === 'damage') {
		anim.enqueue(animState, { kind: 'damage', side: toSide(ev.target), amount: ev.amount, crit: !!ev.crit });
	} else if (ev.type === 'heal') {
		anim.enqueue(animState, { kind: 'heal', side: toSide(ev.target), amount: ev.amount });
	}
}

function logEvent(ev, snapshotBefore) {
	switch (ev.type) {
		case 'skill_cast': {
			const charId = charIdOf(ev.actor, snapshotBefore);
			const skill = Object.entries(CHAR_META[charId].skillIds).find(([, id]) => id === ev.skillId);
			const label = skill ? CHAR_META[charId].skillLabels[skill[0]] : ev.skillId;
			ui.appendLog(`${nicknameOf(ev.actor)}: ${label}`);
			break;
		}
		case 'damage': {
			const tag = ev.source === 'dot' ? ' [출혈]' : ev.crit ? ' (치명타)' : '';
			ui.appendLog(`  → ${nicknameOf(ev.target)}에게 ${ev.amount} 피해${tag}`);
			break;
		}
		case 'heal':
			ui.appendLog(`  → ${nicknameOf(ev.target)} 체력 ${ev.amount} 회복`);
			break;
		case 'effect_apply':
			ui.appendLog(`  → ${nicknameOf(ev.target)}에게 ${EFFECT_LABELS[ev.effectId] || ev.effectId} 부여`);
			break;
		case 'effect_expire':
			ui.appendLog(`  → ${nicknameOf(ev.target)}의 ${EFFECT_LABELS[ev.effectId] || ev.effectId} 종료`);
			break;
	}
}

// ---------- 캐릭터 선택 ----------

for (const card of ui.el.charCards) {
	card.addEventListener('click', () => {
		ui.markCharSelected(card.dataset.char);
		net.send(C2S.CHAR_SELECT, { charId: card.dataset.char });
	});
}

// ---------- 전투 조작 ----------

for (const btn of ui.el.skillButtons) {
	btn.addEventListener('click', () => {
		if (!state.snapshot || anim.isBusy(animState) || state.actionPending) return;
		const charId = charIdOf(state.youKey, state.snapshot);
		const skillId = CHAR_META[charId].skillIds[btn.dataset.slot];
		state.actionPending = true;
		ui.setSkillButtonsEnabled(false);
		net.send(C2S.BATTLE_ACTION, { skillId, turnSeq: state.snapshot.turnSeq });
	});
}

// ---------- 종료 화면 ----------

ui.el.rematchBtn.addEventListener('click', () => net.send(C2S.ROOM_REMATCH, {}));
ui.el.lobbyBtn.addEventListener('click', () => location.reload());

// ---------- 렌더 루프 ----------

function renderHud() {
	if (!state.snapshot) return;
	const me = state.snapshot.players[state.youKey];
	const opp = state.snapshot.players[otherKey(state.youKey)];
	ui.updateHud({
		meName: nicknameOf(state.youKey),
		oppName: nicknameOf(otherKey(state.youKey)),
		me,
		opponent: opp,
		turn: state.snapshot.turn,
		activeIsMe: state.snapshot.activePlayer === state.youKey,
	});
	render.draw(
		ctx,
		{ me: { charId: me.charId }, opponent: { charId: opp.charId } },
		animState,
		performance.now(),
	);
}

function frame(now) {
	anim.tick(animState, now);

	if (!anim.isBusy(animState) && state.pendingSnapshot) {
		state.snapshot = state.pendingSnapshot;
		state.pendingSnapshot = null;
	}

	// 애니메이션이 다 끝난 뒤에야 승패를 확정한다 — battle:end가 먼저 도착해도
	// 큐가 남아있으면 기다렸다가 애니메이션이 끝나는 순간 종료 화면으로 넘어간다.
	if (state.phase === 'battle' && state.snapshot?.winner && state.battleEnd && !anim.isBusy(animState)) {
		state.phase = 'ended';
		finishBattle();
	}

	if (state.phase === 'battle' && state.snapshot) {
		renderHud();
		const myTurn = state.snapshot.activePlayer === state.youKey && !state.snapshot.winner;
		ui.setSkillButtonsEnabled(myTurn && !anim.isBusy(animState) && !state.actionPending);
	}

	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function finishBattle() {
	const won = state.battleEnd.winnerKey === state.youKey;
	const myStreak = state.battleEnd.streaks[state.youKey];
	ui.showEnd(won, myStreak);
	ui.showScreen('end');
}
