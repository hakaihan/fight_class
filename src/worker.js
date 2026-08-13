import { BattleRoom } from './room.js';

export { BattleRoom };

// 0/O, 1/I처럼 혼동되는 문자를 뺀 32자 알파벳의 6자리 코드
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
	}
	return code;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === '/ws') {
			return handleWebSocketUpgrade(request, env, url);
		}

		// 정적 자산과 매칭되지 않는 그 외 경로 — public/의 404-page 처리로 넘긴다.
		return env.ASSETS.fetch(request);
	},
};

async function handleWebSocketUpgrade(request, env, url) {
	if (request.headers.get('Upgrade') !== 'websocket') {
		return new Response('Expected websocket', { status: 426 });
	}

	const action = url.searchParams.get('action');
	const nickname = (url.searchParams.get('nickname') || '').trim().slice(0, 20);
	if (!nickname) {
		return new Response('닉네임이 필요합니다.', { status: 400 });
	}

	let roomId;
	if (action === 'create' || action === 'ai') {
		roomId = generateRoomCode();
	} else if (action === 'join') {
		roomId = (url.searchParams.get('roomId') || '').trim().toUpperCase();
		if (!/^[A-Z0-9]{6}$/.test(roomId)) {
			return new Response('올바르지 않은 방 코드입니다.', { status: 400 });
		}
	} else {
		return new Response('알 수 없는 요청입니다.', { status: 400 });
	}

	// 방 코드 하나 = Durable Object 인스턴스 하나. 같은 이름은 항상 같은 인스턴스로 간다.
	const stub = env.BATTLE_ROOM.getByName(roomId);

	const forwardUrl = new URL(request.url);
	forwardUrl.searchParams.set('roomId', roomId);
	const forwardRequest = new Request(forwardUrl, request);
	return stub.fetch(forwardRequest);
}
