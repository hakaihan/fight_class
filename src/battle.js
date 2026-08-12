// 전투 상태 머신 — 소켓/Durable Object와 완전히 분리된 순수 함수 모음.
// (server/room.js가 입출력을 담당하고, 여기서는 상태만 다룬다 → Node로 바로 테스트 가능)

// JSON import 속성(with { type: 'json' })을 붙여서 Wrangler(esbuild)뿐 아니라
// 순수 Node(`node --test`)에서도 그대로 import할 수 있게 한다.
import characters from './data/characters.json' with { type: 'json' };
import skills from './data/skills.json' with { type: 'json' };
import { applyEffect, currentAtk, isBlocked, tickEffects } from './effects.js';

export function createInitialBattleState(p1, p2) {
	return {
		turn: 1,
		turnSeq: 0,
		activePlayer: 'p1',
		players: {
			p1: makePlayerState(p1),
			p2: makePlayerState(p2),
		},
		winner: null,
		reason: null,
	};
}

function makePlayerState({ id, charId }) {
	const base = characters[charId];
	return {
		id,
		charId,
		hp: base.maxHp,
		maxHp: base.maxHp,
		mp: base.maxMp,
		maxMp: base.maxMp,
		baseAtk: base.atk,
		mpRegen: base.mpRegen,
		effects: [],
		cooldowns: {},
	};
}

function otherKey(key) {
	return key === 'p1' ? 'p2' : 'p1';
}

function rollVariance(base, variance) {
	if (!variance) return base;
	const delta = base * variance;
	return base + (Math.random() * 2 - 1) * delta;
}

// 단 하나의 battle:action을 처리한다. state는 변경하지 않고 새 state를 반환한다.
// 실패 시 { state: 입력받은 그대로, events: [], error } 를 반환 — 호출자는 game:error만 보내면 된다.
export function applyAction(state, actorKey, skillId, turnSeq) {
	const noop = { state, events: [], error: null };

	if (state.winner) {
		return { ...noop, error: { code: 'battle_over', message: '전투가 이미 종료되었습니다.' } };
	}
	if (state.activePlayer !== actorKey) {
		return { ...noop, error: { code: 'not_your_turn', message: '상대의 턴입니다.' } };
	}
	if (turnSeq !== state.turnSeq) {
		return { ...noop, error: { code: 'stale_action', message: '이미 처리된 턴입니다.' } };
	}
	const skill = skills[skillId];
	if (!skill || typeof skill !== 'object' || skillId === '_comment') {
		return { ...noop, error: { code: 'unknown_skill', message: '알 수 없는 스킬입니다.' } };
	}
	const actor = state.players[actorKey];
	if (skill.charId && skill.charId !== actor.charId) {
		return { ...noop, error: { code: 'wrong_character', message: '해당 캐릭터의 스킬이 아닙니다.' } };
	}
	if (actor.mp < skill.mpCost) {
		return { ...noop, error: { code: 'not_enough_mp', message: 'MP가 부족합니다.' } };
	}
	if ((actor.cooldowns[skillId] || 0) > 0) {
		return { ...noop, error: { code: 'skill_on_cooldown', message: '스킬 재사용 대기 중입니다.' } };
	}

	const targetKey = otherKey(actorKey);
	const next = structuredClone(state);
	const nextActor = next.players[actorKey];
	const nextTarget = next.players[targetKey];
	const events = [];

	nextActor.mp -= skill.mpCost;
	events.push({ type: 'skill_cast', actor: actorKey, skillId });

	if (skill.kind === 'damage') {
		const atk = currentAtk(nextActor);
		const raw = rollVariance(atk * skill.multiplier, skill.variance || 0);
		const crit = Math.random() < 0.1;
		const amount = Math.max(1, Math.round(raw * (crit ? 1.5 : 1)));
		nextTarget.hp = Math.max(0, nextTarget.hp - amount);
		events.push({ type: 'damage', target: targetKey, amount, crit });

		if (skill.appliesEffect) {
			const effect = { ...skill.appliesEffect, payload: { ...skill.appliesEffect.payload } };
			if (effect.kind === 'dot') {
				effect.payload.amount = Math.max(1, Math.round(atk * effect.payload.tickRatio));
			}
			applyEffect(nextTarget, effect);
			events.push({ type: 'effect_apply', target: targetKey, effectId: effect.id, duration: effect.duration });
		}
	} else if (skill.kind === 'heal') {
		const amount = Math.round(nextActor.maxHp * skill.healRatio);
		nextActor.hp = Math.min(nextActor.maxHp, nextActor.hp + amount);
		events.push({ type: 'heal', target: actorKey, amount });
	}

	if (skill.cooldown > 0) {
		nextActor.cooldowns[skillId] = skill.cooldown;
	}

	// 턴 종료 처리: 양쪽 dot 틱 → duration 감소/만료 → 쿨다운 감소 → MP 자동 회복
	for (const key of ['p1', 'p2']) {
		const player = next.players[key];
		events.push(...tickEffects(player, key));

		for (const sId of Object.keys(player.cooldowns)) {
			player.cooldowns[sId] = Math.max(0, player.cooldowns[sId] - 1);
		}

		if (!isBlocked(player, 'mpRegen')) {
			const before = player.mp;
			player.mp = Math.min(player.maxMp, player.mp + player.mpRegen);
			if (player.mp !== before) {
				events.push({ type: 'mp_regen', target: key, amount: player.mp - before });
			}
		}
	}

	// 승패 판정 — 동시 사망(도트 등으로 양쪽 다 0 이하) 시 "행동한 쪽"이 패배
	const p1Dead = next.players.p1.hp <= 0;
	const p2Dead = next.players.p2.hp <= 0;
	if (p1Dead && p2Dead) {
		next.winner = otherKey(actorKey);
		next.reason = 'simultaneous_ko';
	} else if (p1Dead) {
		next.winner = 'p2';
		next.reason = 'ko';
	} else if (p2Dead) {
		next.winner = 'p1';
		next.reason = 'ko';
	}

	next.turnSeq += 1;
	if (!next.winner) {
		next.activePlayer = targetKey;
		next.turn += 1;
	}

	return { state: next, events, error: null };
}
