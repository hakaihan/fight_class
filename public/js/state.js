// 서버가 보낸 최신 스냅샷을 보관만 하는 저장소. 렌더 루프는 매 프레임 이걸 읽는다.
const state = {
	nickname: null,
	youKey: null, // 'p1' | 'p2' — 내 스냅샷이 어느 쪽인지
	roomId: null,
	phase: 'lobby', // lobby | select | battle | ended
	lobbyPlayers: [], // room:state의 players
	pendingSnapshot: null, // battle:turn으로 막 도착했지만 애니메이션 재생 전이라 아직 화면엔 미반영
	snapshot: null, // 화면에 실제로 반영된 battle 상태
	battleEnd: null, // { winnerKey, reason, streaks }
	actionPending: false, // 서버 응답을 기다리는 중 — 응답 전까지 버튼 재입력 잠금
};

export function otherKey(key) {
	return key === 'p1' ? 'p2' : 'p1';
}

export default state;
