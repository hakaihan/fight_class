import { DurableObject } from 'cloudflare:workers';
import { C2S, S2C, CHAR_IDS } from '../public/shared/protocol.js';
import { createInitialBattleState, applyAction } from './battle.js';

// 방 하나 = 이 Durable Object 인스턴스 하나. 최대 2명, 메모리(this.ctx.storage)에만
// 상태를 두고 프로세스가 정리되면 사라진다 — 계획서의 "영속화 불필요" 범위 그대로.
//
// room:create / room:join은 계획서에서는 소켓 이벤트였지만, 여기서는 네이티브
// WebSocket이라 연결을 맺는 시점(쿼리스트링)에 이미 결정되어 있다. 그래서 이 DO는
// C2S.ROOM_CREATE / C2S.ROOM_JOIN을 메시지로 받지 않고, fetch()에서 바로 좌석을 배정한다.
export class BattleRoom extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.room = null;
		this.loaded = false;
	}

	async ensureLoaded() {
		if (this.loaded) return;
		const stored = await this.ctx.storage.get('room');
		this.room = stored || { players: [], phase: 'lobby', battle: null, rematchRequests: [] };
		this.loaded = true;
	}

	async persist() {
		await this.ctx.storage.put('room', this.room);
	}

	async fetch(request) {
		await this.ensureLoaded();

		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected websocket', { status: 426 });
		}

		const url = new URL(request.url);
		const roomId = url.searchParams.get('roomId');
		const action = url.searchParams.get('action');
		const nickname = (url.searchParams.get('nickname') || '').trim().slice(0, 20);

		if (action === 'join' && this.room.players.length === 0) {
			return new Response('존재하지 않는 방입니다.', { status: 404 });
		}
		if (this.room.players.length >= 2) {
			return new Response('방이 가득 찼습니다.', { status: 409 });
		}

		const playerId = crypto.randomUUID();
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server, [roomId]);
		server.serializeAttachment({ playerId, roomId, nickname });

		this.room.players.push({ id: playerId, nickname, charId: null, streak: 0, connected: true });
		await this.persist();
		this.broadcastRoomState();

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws, raw) {
		await this.ensureLoaded();

		let msg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		const { playerId } = ws.deserializeAttachment();
		const seatIndex = this.room.players.findIndex((p) => p.id === playerId);
		if (seatIndex === -1) return;
		const seatKey = seatIndex === 0 ? 'p1' : 'p2';

		switch (msg.type) {
			case C2S.CHAR_SELECT:
				await this.handleCharSelect(seatIndex, msg.payload);
				break;
			case C2S.BATTLE_ACTION:
				await this.handleBattleAction(ws, seatKey, msg.payload);
				break;
			case C2S.ROOM_REMATCH:
				await this.handleRematch(playerId);
				break;
			default:
				this.send(ws, S2C.GAME_ERROR, { code: 'unknown_message', message: '알 수 없는 요청입니다.' });
		}
	}

	async webSocketClose(ws, code, reason, wasClean) {
		await this.ensureLoaded();
		const { playerId } = ws.deserializeAttachment();
		const leavingIndex = this.room.players.findIndex((p) => p.id === playerId);
		if (leavingIndex === -1) return;

		const wasInBattle = this.room.phase === 'battle';
		const remainingSeatKey = leavingIndex === 0 ? 'p2' : 'p1';
		this.room.players.splice(leavingIndex, 1);

		if (this.room.players.length === 0) {
			// 방에 아무도 없음 — 다음 접속이 완전히 새 방으로 시작하도록 정리
			this.room = { players: [], phase: 'lobby', battle: null, rematchRequests: [] };
			await this.persist();
			return;
		}

		if (wasInBattle) {
			const remaining = this.room.players[0];
			remaining.streak += 1;
			this.send(this.findSocket(remaining.id), S2C.BATTLE_END, {
				winnerKey: remainingSeatKey,
				reason: 'opponent_left',
				streaks: this.streakMap(),
			});
		}

		this.room.phase = 'lobby';
		this.room.battle = null;
		this.room.rematchRequests = [];
		await this.persist();
		this.broadcastRoomState();
	}

	async webSocketError(ws, error) {
		console.error('WebSocket error:', error);
	}

	async handleCharSelect(seatIndex, payload) {
		const charId = payload && payload.charId;
		if (!CHAR_IDS.includes(charId)) return;

		this.room.players[seatIndex].charId = charId;
		this.room.phase = 'select';
		await this.persist();
		this.broadcastRoomState();

		if (this.room.players.length === 2 && this.room.players.every((p) => p.charId)) {
			await this.startBattle();
		}
	}

	async startBattle() {
		const [p1, p2] = this.room.players;
		this.room.phase = 'battle';
		this.room.battle = createInitialBattleState(
			{ id: p1.id, charId: p1.charId },
			{ id: p2.id, charId: p2.charId },
		);
		await this.persist();

		for (const [key, player] of [['p1', p1], ['p2', p2]]) {
			this.send(this.findSocket(player.id), S2C.BATTLE_START, {
				snapshot: this.room.battle,
				youKey: key,
			});
		}
	}

	async handleBattleAction(ws, seatKey, payload) {
		if (this.room.phase !== 'battle' || !this.room.battle) {
			this.send(ws, S2C.GAME_ERROR, { code: 'not_in_battle', message: '전투 중이 아닙니다.' });
			return;
		}
		const { skillId, turnSeq } = payload || {};
		const { state, events, error } = applyAction(this.room.battle, seatKey, skillId, turnSeq);

		if (error) {
			this.send(ws, S2C.GAME_ERROR, error);
			return;
		}

		this.room.battle = state;
		await this.persist();
		this.broadcastAll(S2C.BATTLE_TURN, { events, snapshot: state });

		if (state.winner) {
			const winnerPlayer = this.room.players[state.winner === 'p1' ? 0 : 1];
			const loserPlayer = this.room.players[state.winner === 'p1' ? 1 : 0];
			winnerPlayer.streak += 1;
			loserPlayer.streak = 0;
			this.room.phase = 'ended';
			await this.persist();
			this.broadcastAll(S2C.BATTLE_END, {
				winnerKey: state.winner,
				reason: state.reason,
				streaks: this.streakMap(),
			});
		}
	}

	async handleRematch(playerId) {
		if (this.room.phase !== 'ended') return;
		if (!this.room.rematchRequests.includes(playerId)) {
			this.room.rematchRequests.push(playerId);
		}
		if (this.room.rematchRequests.length < 2) {
			await this.persist();
			return;
		}

		for (const p of this.room.players) p.charId = null;
		this.room.phase = 'select';
		this.room.battle = null;
		this.room.rematchRequests = [];
		await this.persist();
		this.broadcastRoomState();
	}

	// 클라이언트는 자기 playerId를 모르므로(서버 내부 식별자), 항상 p1/p2 seat key로 돌려준다 —
	// 다른 모든 메시지와 동일하게 클라는 자신의 youKey로 조회하면 된다.
	streakMap() {
		return {
			p1: this.room.players[0]?.streak ?? 0,
			p2: this.room.players[1]?.streak ?? 0,
		};
	}

	findSocket(playerId) {
		return this.ctx.getWebSockets().find((s) => s.deserializeAttachment()?.playerId === playerId);
	}

	send(ws, type, payload) {
		if (!ws) return;
		ws.send(JSON.stringify({ type, payload }));
	}

	broadcastAll(type, payload) {
		for (const ws of this.ctx.getWebSockets()) {
			this.send(ws, type, payload);
		}
	}

	broadcastRoomState() {
		this.broadcastAll(S2C.ROOM_STATE, {
			roomId: this.ctx.id.name,
			phase: this.room.phase,
			players: this.room.players.map((p) => ({
				nickname: p.nickname,
				charId: p.charId,
				streak: p.streak,
			})),
		});
	}
}
