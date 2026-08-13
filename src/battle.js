// 전투 상태 머신 — 소켓/Durable Object와 완전히 분리된 순수 함수 모음.
// (server/room.js가 입출력을 담당하고, 여기서는 상태만 다룬다 → Node로 바로 테스트 가능)

// JSON import 속성(with { type: 'json' })을 붙여서 Wrangler(esbuild)뿐 아니라
// 순수 Node(`node --test`)에서도 그대로 import할 수 있게 한다.
import characters from './data/characters.json' with { type: 'json' };
import skills from './data/skills.json' with { type: 'json' };
import { applyEffect, currentAtk, damageTakenMult, isBlocked, tickEffects } from './effects.js';

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

function cloneEffect(effect) {
	return { ...effect, payload: { ...effect.payload } };
}

// 공격자 atk 기준으로 한 방(hit) 데미지를 굴린다. 방어 태세 등 'def' 배율은
// ignoreDef가 아닌 한 대상 쪽에서 적용된다.
function rollHit(atk, skill, target) {
	const raw = rollVariance(atk * skill.multiplier, skill.variance || 0);
	const crit = Math.random() < 0.1;
	let amount = Math.max(1, Math.round(raw * (crit ? 1.5 : 1)));
	if (!skill.ignoreDef) {
		amount = Math.max(1, Math.round(amount * damageTakenMult(target)));
	}
	return { amount, crit };
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
		const hits = skill.hits || 1;
		for (let i = 0; i < hits; i++) {
			const { amount, crit } = rollHit(atk, skill, nextTarget);
			nextTarget.hp = Math.max(0, nextTarget.hp - amount);
			events.push({ type: 'damage', target: targetKey, amount, crit });
		}

		if (skill.appliesEffect) {
			const effect = cloneEffect(skill.appliesEffect);
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
	} else if (skill.kind === 'buff') {
		// 자기 자신에게 거는 상태 효과 (데미지/회복 없음) — 전사의 방어 태세/투지 등
		const effect = cloneEffect(skill.appliesEffect);
		applyEffect(nextActor, effect);
		events.push({ type: 'effect_apply', target: actorKey, effectId: effect.id, duration: effect.duration });
	} else if (skill.kind === 'drain') {
		// 소량의 피해 + 상대 MP를 직접 깎는다 (마법사의 마나 번) — 자신 MP가 늘지는 않는다.
		const atk = currentAtk(nextActor);
		const { amount, crit } = rollHit(atk, skill, nextTarget);
		nextTarget.hp = Math.max(0, nextTarget.hp - amount);
		events.push({ type: 'damage', target: targetKey, amount, crit });

		const drained = Math.min(nextTarget.mp, Math.round(atk * (skill.mpDrainRatio || 0)));
		nextTarget.mp -= drained;
		if (drained > 0) {
			events.push({ type: 'mp_drain', target: targetKey, amount: drained });
		}
	} else if (skill.kind === 'restore_mp') {
		// 자신 MP를 회복 — 침묵(mpRegen 봉인) 상태면 이 회복도 막힌다.
		const blocked = isBlocked(nextActor, 'mpRegen');
		const amount = blocked ? 0 : Math.round(nextActor.maxMp * skill.restoreRatio);
		nextActor.mp = Math.min(nextActor.maxMp, nextActor.mp + amount);
		events.push({ type: 'mp_restore', target: actorKey, amount, blocked });
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
