import { CHAR_META } from './charMeta.js';

export const el = {
	screens: {
		lobby: document.getElementById('screen-lobby'),
		select: document.getElementById('screen-select'),
		battle: document.getElementById('screen-battle'),
		end: document.getElementById('screen-end'),
	},
	nicknameInput: document.getElementById('nickname-input'),
	createRoomBtn: document.getElementById('create-room-btn'),
	roomCodeInput: document.getElementById('room-code-input'),
	joinRoomBtn: document.getElementById('join-room-btn'),
	lobbyError: document.getElementById('lobby-error'),

	roomCodeDisplay: document.getElementById('room-code-display'),
	playerList: document.getElementById('player-list'),
	charCards: Array.from(document.querySelectorAll('.char-card')),
	selectStatus: document.getElementById('select-status'),

	hudMe: document.getElementById('hud-me'),
	hudOpponent: document.getElementById('hud-opponent'),
	turnIndicator: document.getElementById('turn-indicator'),
	canvas: document.getElementById('battle-canvas'),
	skillButtons: Array.from(document.querySelectorAll('.skill-btn')),
	battleLog: document.getElementById('battle-log'),

	endTitle: document.getElementById('end-title'),
	endStreak: document.getElementById('end-streak'),
	rematchBtn: document.getElementById('rematch-btn'),
	lobbyBtn: document.getElementById('lobby-btn'),
};

export function showScreen(name) {
	for (const [key, node] of Object.entries(el.screens)) {
		node.classList.toggle('active', key === name);
	}
}

export function setLobbyError(msg) {
	el.lobbyError.textContent = msg || '';
}

export function renderSelectScreen(roomId, players) {
	el.roomCodeDisplay.textContent = roomId;
	el.playerList.innerHTML = '';
	for (const p of players) {
		const li = document.createElement('li');
		const charName = p.charId ? CHAR_META[p.charId].name : '선택 중…';
		li.textContent = `${p.nickname} — ${charName} (연승 ${p.streak})`;
		el.playerList.appendChild(li);
	}
	el.selectStatus.textContent = players.length < 2 ? '상대를 기다리는 중…' : '';
}

export function markCharSelected(charId) {
	for (const card of el.charCards) {
		card.classList.toggle('selected', card.dataset.char === charId);
	}
}

export function setSkillLabels(charId) {
	const meta = CHAR_META[charId];
	for (const btn of el.skillButtons) {
		btn.textContent = meta.skillLabels[btn.dataset.slot];
	}
}

export function setSkillButtonsEnabled(enabled) {
	for (const btn of el.skillButtons) btn.disabled = !enabled;
}

export function updateHud({ meName, oppName, me, opponent, turn, activeIsMe }) {
	fillPanel(el.hudMe, meName, me);
	fillPanel(el.hudOpponent, oppName, opponent);
	el.turnIndicator.textContent = `턴 ${turn} — ${activeIsMe ? '내 턴' : '상대 턴'}`;
}

function fillPanel(panel, name, data) {
	panel.querySelector('.hud-name').textContent = name;
	const hpFill = panel.querySelector('.bar.hp .bar-fill');
	const hpLabel = panel.querySelector('.bar.hp .bar-label');
	const mpFill = panel.querySelector('.bar.mp .bar-fill');
	const mpLabel = panel.querySelector('.bar.mp .bar-label');
	hpFill.style.width = `${Math.max(0, (data.hp / data.maxHp) * 100)}%`;
	hpLabel.textContent = `HP ${Math.max(0, data.hp)}/${data.maxHp}`;
	mpFill.style.width = `${Math.max(0, (data.mp / data.maxMp) * 100)}%`;
	mpLabel.textContent = `MP ${data.mp}/${data.maxMp}`;
}

export function clearLog() {
	el.battleLog.innerHTML = '';
}

export function appendLog(text) {
	const p = document.createElement('p');
	p.textContent = text;
	el.battleLog.appendChild(p);
	el.battleLog.scrollTop = el.battleLog.scrollHeight;
}

export function showEnd(won, streak) {
	el.endTitle.textContent = won ? '승리!' : '패배';
	el.endTitle.style.color = won ? '#4ade80' : '#f87171';
	el.endStreak.textContent = `현재 연승: ${streak}`;
}
