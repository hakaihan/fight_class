// 버프/디버프 해석기. kind는 세 가지만 존재하며, 새 효과 추가는 skills.json에
// appliesEffect 한 줄을 추가하는 것으로 끝난다 (이 파일을 고칠 필요 없음).
//
//   dot       — 매 턴 종료 시 payload.amount만큼 고정 피해
//   stat_mod  — payload.stat 스탯에 payload.mult 배율 적용 ('atk' = 내가 주는 피해,
//               'def' = 내가 받는 피해). 자기 자신에게도(버프), 상대에게도(디버프) 걸 수 있다.
//   control   — payload.block에 적힌 행동을 봉인 (지금은 'mpRegen'만 사용)
//
// v1에서는 stackRule을 전부 'refresh'로 취급한다: 같은 id의 효과가 다시 걸리면
// 기존 것을 새 duration으로 덮어쓴다 (중첩하지 않음). 다만 id가 다른 stat_mod 효과들은
// (예: 상대가 건 공격력 디버프 + 내가 건 공격력 버프) 서로 배율을 곱해서 함께 적용된다.

export function applyEffect(playerState, effect) {
	const idx = playerState.effects.findIndex((e) => e.id === effect.id);
	if (idx >= 0) {
		playerState.effects[idx] = effect;
	} else {
		playerState.effects.push(effect);
	}
}

export function getEffect(playerState, effectId) {
	return playerState.effects.find((e) => e.id === effectId);
}

function statMult(playerState, stat) {
	let mult = 1;
	for (const e of playerState.effects) {
		if (e.kind === 'stat_mod' && e.payload.stat === stat) mult *= e.payload.mult;
	}
	return mult;
}

export function currentAtk(playerState) {
	return Math.round(playerState.baseAtk * statMult(playerState, 'atk'));
}

// 받는 피해에 곱해지는 배율 (예: 전사의 방어 태세 0.5 = 받는 피해 절반)
export function damageTakenMult(playerState) {
	return statMult(playerState, 'def');
}

export function isBlocked(playerState, action) {
	return playerState.effects.some((e) => e.kind === 'control' && e.payload.block === action);
}

// 턴 종료 처리 중 dot 틱 → duration 감소 → 만료된 효과 제거까지 한 번에 수행하고,
// 연출용 이벤트를 반환한다. playerState는 이 함수 안에서 직접 변경된다(호출자가
// 이미 clone한 state를 넘겨준다는 전제).
export function tickEffects(playerState, targetKey) {
	const events = [];

	for (const eff of playerState.effects) {
		if (eff.kind === 'dot') {
			const amount = eff.payload.amount;
			playerState.hp = Math.max(0, playerState.hp - amount);
			events.push({ type: 'damage', target: targetKey, amount, source: 'dot', effectId: eff.id });
		}
	}

	const expired = [];
	for (const eff of playerState.effects) {
		eff.duration -= 1;
		if (eff.duration <= 0) expired.push(eff.id);
	}
	if (expired.length > 0) {
		playerState.effects = playerState.effects.filter((e) => !expired.includes(e.id));
		for (const id of expired) events.push({ type: 'effect_expire', target: targetKey, effectId: id });
	}

	return events;
}
