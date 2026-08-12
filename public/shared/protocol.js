// 서버(src/*.js)와 클라이언트(public/js/*.js)가 함께 import하는 순수 ES module.
// 빌드 도구가 없으므로 값이 아니라 "상수"만 담는다 — 브라우저는
// <script type="module">에서 상대 경로로, Worker/Durable Object도 상대 경로로 그대로 import한다.

// 클라이언트 → 서버
export const C2S = {
	ROOM_CREATE: 'room:create',
	ROOM_JOIN: 'room:join',
	CHAR_SELECT: 'char:select',
	BATTLE_ACTION: 'battle:action',
	ROOM_REMATCH: 'room:rematch',
};

// 서버 → 클라이언트
export const S2C = {
	ROOM_STATE: 'room:state',
	BATTLE_START: 'battle:start',
	BATTLE_TURN: 'battle:turn',
	BATTLE_END: 'battle:end',
	GAME_ERROR: 'game:error',
};

export const CHAR_IDS = ['warrior', 'archer', 'mage'];

export const ROOM_CODE_LENGTH = 6;

export function isValidRoomCode(code) {
	return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}
