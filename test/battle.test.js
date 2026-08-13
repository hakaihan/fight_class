// server/battle.js는 소켓과 분리된 순수 함수라 `node --test`로 바로 검증할 수 있다.
// Math.random()을 고정해서 분산(variance)·치명타를 없애고 데미지를 손으로 계산 가능하게 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBattleState, applyAction } from '../src/battle.js';

function withFixedRandom(value, fn) {
	const original = Math.random;
	Math.random = () => value;
	try {
		return fn();
	} finally {
		Math.random = original;
	}
}

test('기본 공격 → 스킬(디버프) → 회복 순서로 진행되며 MP/HP/쿨다운/효과 만료가 정확하다', () => {
	withFixedRandom(0.5, () => {
		// Math.random()=0.5 → 분산항이 정확히 0, 치명타(10% 미만) 없음 → 데미지가 정확히 결정된다.
		let state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'mage' });

		// turn1: p1 기본 공격(베기, dmg = atk 12 * 1.0)
		let r = applyAction(state, 'p1', 'warrior_slash', 0);
		assert.equal(r.error, null);
		state = r.state;
		assert.equal(state.players.p2.hp, 80 - 12);
		assert.equal(state.activePlayer, 'p2');
		assert.equal(state.turnSeq, 1);

		// turn2: p2 기본 공격(마력탄, dmg = atk 9 * 0.8 = 7.2 → round 7)
		r = applyAction(state, 'p2', 'mage_bolt', 1);
		state = r.state;
		assert.equal(state.players.p1.hp, 100 - 7);

		// turn3: p1 강타(dmg = atk 12 * 2.2 = 26.4 → round 26) + 상대 공격력 30% 감소(3턴)
		r = applyAction(state, 'p1', 'warrior_smash', 2);
		state = r.state;
		assert.equal(state.players.p2.hp, 68 - 26);
		assert.equal(state.players.p1.mp, 50 - 20 + 8); // 강타 MP소모 후 턴종료 MP회복
		const atkDown = state.players.p2.effects.find((e) => e.id === 'atk_down');
		assert.equal(atkDown.duration, 2);

		// turn4: p2 파열 마법 — 디버프가 걸린 p2 본인의 공격력이 30% 깎인 채로 계산된다
		// atk = round(9 * 0.7) = 6, dmg = 6 * 3.0 = 18. 대상(p1)에게 침묵(2턴) 부여.
		r = applyAction(state, 'p2', 'mage_burst', 3);
		state = r.state;
		assert.equal(state.players.p1.hp, 93 - 18);
		assert.equal(state.players.p1.mp, 38); // 침묵으로 이번 턴 MP 회복이 막힘
		assert.ok(state.players.p1.effects.some((e) => e.id === 'silence'));

		// turn5: p1 회복 (healRatio 0.22 * maxHp 100 = 22), 쿨다운 3 설정
		// 이 턴에 p2의 atk_down과 p1의 silence가 모두 만료된다 → 만료 직후라 MP 회복도 다시 걸림
		r = applyAction(state, 'p1', 'heal_common', 4);
		state = r.state;
		assert.equal(state.players.p1.hp, 75 + 22);
		assert.equal(state.players.p1.mp, 38 - 22 + 8); // 회복 소모 후, 침묵 만료 → 회복틱 적용
		assert.equal(state.players.p1.cooldowns.heal_common, 2);
		assert.equal(state.players.p2.effects.length, 0);
		assert.equal(state.players.p1.effects.length, 0);
	});
});

test('회복은 쿨다운이 남아있는 동안 재사용이 거부된다', () => {
	withFixedRandom(0.5, () => {
		let state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'archer' });
		let r = applyAction(state, 'p1', 'heal_common', 0); // cooldown → 3, 턴종료에 3→2
		state = r.state;
		assert.equal(state.players.p1.cooldowns.heal_common, 2);

		r = applyAction(state, 'p2', 'archer_shot', 1); // p1 쿨다운 2→1
		state = r.state;

		r = applyAction(state, 'p1', 'heal_common', 2); // 아직 쿨다운(1) 남음 → 거부
		assert.equal(r.error.code, 'skill_on_cooldown');
		assert.equal(r.state, state); // 상태 불변(참조까지 동일)
	});
});

test('MP가 부족하면 상태를 바꾸지 않고 game:error를 반환한다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'mage' }, { id: 'p2', charId: 'warrior' });
	const poor = structuredClone(state);
	poor.players.p1.mp = 5; // mage_burst의 mpCost(28)보다 적게 만들어서 거부를 확인한다

	const rejected = applyAction(poor, 'p1', 'mage_burst', 0);
	assert.equal(rejected.error.code, 'not_enough_mp');
	assert.equal(rejected.state, poor); // 상태 불변(참조까지 동일)
});

test('내 턴이 아니면 거부되고, 오래된 turnSeq도 거부된다', () => {
	let state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'archer' });

	const notYourTurn = applyAction(state, 'p2', 'archer_shot', 0);
	assert.equal(notYourTurn.error.code, 'not_your_turn');

	const staleSeq = applyAction(state, 'p1', 'warrior_slash', 99);
	assert.equal(staleSeq.error.code, 'stale_action');
});

test('출혈은 걸린 턴 수만큼만 피해를 주고 정확히 만료된다', () => {
	withFixedRandom(0.5, () => {
		// 효과 부여(step2)와 턴 종료 tick(step3)은 같은 applyAction 호출 안에서 함께 처리되므로,
		// 출혈을 "건" 그 턴에 이미 첫 틱이 들어간다 — duration은 3에서 시작해 그 즉시 2로 줄어든다.
		let state = createInitialBattleState({ id: 'p1', charId: 'archer' }, { id: 'p2', charId: 'warrior' });

		// archer_pierce: 시전 dmg = atk 10 * 1.3 = 13, bleed tick = round(10 * 0.5) = 5
		let p2Hp = 100;
		let r = applyAction(state, 'p1', 'archer_pierce', 0);
		state = r.state;
		p2Hp -= 13 + 5; // 시전 데미지 + 같은 턴의 첫 틱
		assert.equal(state.players.p2.hp, p2Hp);
		assert.equal(state.players.p2.effects.find((e) => e.id === 'bleed').duration, 2);

		// p2 자신의 턴(기본 공격, p2 → p1)에도 p2 자신의 출혈 틱은 그대로 들어간다
		r = applyAction(state, 'p2', 'warrior_slash', 1);
		state = r.state;
		p2Hp -= 5;
		assert.equal(state.players.p2.hp, p2Hp);
		assert.equal(state.players.p2.effects.find((e) => e.id === 'bleed').duration, 1);

		// p1의 기본 공격(archer_shot, dmg = atk 10 * 1.0 = 10)이 직접 때리고, 같은 턴에 출혈 마지막 틱도 들어가 만료된다
		r = applyAction(state, 'p1', 'archer_shot', 2);
		state = r.state;
		p2Hp -= 10 + 5;
		assert.equal(state.players.p2.hp, p2Hp);
		assert.equal(state.players.p2.effects.find((e) => e.id === 'bleed'), undefined); // 만료

		r = applyAction(state, 'p2', 'warrior_slash', 3); // 만료 이후 — 더 이상 틱 없음(p2는 이번 턴 피해도 안 받음)
		state = r.state;
		assert.equal(state.players.p2.hp, p2Hp);
	});
});

test('방어 태세(자기 버프)는 받는 피해를 배율만큼 줄인다', () => {
	withFixedRandom(0.5, () => {
		let state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'warrior' });

		// turn1: p1이 방어 태세(자신에게 def 0.5, 2턴) — 데미지/효과부여 대상이 상대가 아니라 자기 자신이다
		let r = applyAction(state, 'p1', 'warrior_guard', 0);
		state = r.state;
		assert.equal(state.players.p1.hp, 100); // 데미지 없음
		const guard = state.players.p1.effects.find((e) => e.id === 'guard');
		assert.ok(guard, '자기 자신에게 걸려야 한다');
		assert.equal(guard.duration, 1); // 부여 즉시 이번 턴 tick으로 2→1

		// turn2: p2가 강타(정상 데미지 round(12*2.2)=26)로 공격 — 방어 태세로 절반만 들어가야 한다
		r = applyAction(state, 'p2', 'warrior_smash', 1);
		state = r.state;
		assert.equal(state.players.p1.hp, 100 - Math.round(26 * 0.5));
	});
});

test('조준 사격(ignoreDef)은 방어 태세를 무시하고 그대로 들어간다', () => {
	withFixedRandom(0.5, () => {
		let state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'archer' });

		let r = applyAction(state, 'p1', 'warrior_guard', 0); // p1: def 0.5, 2턴 → 이번 턴 tick으로 1턴 남음
		state = r.state;

		r = applyAction(state, 'p2', 'archer_aimed_shot', 1); // dmg = round(10*1.6) = 16, ignoreDef
		state = r.state;
		assert.equal(state.players.p1.hp, 100 - 16); // 방어 태세로 줄어들지 않아야 한다
	});
});

test('속사는 두 번 타격한다', () => {
	withFixedRandom(0.5, () => {
		const state = createInitialBattleState({ id: 'p1', charId: 'archer' }, { id: 'p2', charId: 'warrior' });
		const r = applyAction(state, 'p1', 'archer_rapid_shot', 0); // 한 번당 round(10*0.7)=7, 2회
		const damageEvents = r.events.filter((e) => e.type === 'damage');
		assert.equal(damageEvents.length, 2);
		assert.equal(r.state.players.p2.hp, 100 - 7 - 7);
	});
});

test('마나 번은 소량의 피해와 함께 상대 MP를 직접 깎는다', () => {
	withFixedRandom(0.5, () => {
		const state = createInitialBattleState({ id: 'p1', charId: 'mage' }, { id: 'p2', charId: 'mage' });
		const r = applyAction(state, 'p1', 'mage_mana_burn', 0); // dmg round(9*0.4)=4, drain round(9*1.8)=16
		assert.equal(r.state.players.p2.hp, 80 - 4);
		// 드레인(16) 후 턴종료 자동회복(+12)이 적용되어도, 시전 전 MP(70)보단 낮게 남아야 한다
		assert.equal(r.state.players.p2.mp, 70 - 16 + 12);
		assert.ok(r.events.some((e) => e.type === 'mp_drain' && e.amount === 16));
	});
});

test('집중은 자기 MP를 회복하고, 침묵 상태면 회복되지 않는다', () => {
	withFixedRandom(0.5, () => {
		const base = createInitialBattleState({ id: 'p1', charId: 'mage' }, { id: 'p2', charId: 'mage' });

		const normal = structuredClone(base);
		normal.players.p1.mp = 10;
		let r = applyAction(normal, 'p1', 'mage_focus', 0); // restoreRatio 0.25 * maxMp 70 = round(17.5) = 18
		assert.equal(r.state.players.p1.mp, 10 + 18 + 12); // 회복 + 턴종료 MP 자동회복(마법사 mpRegen 12)
		assert.ok(r.events.some((e) => e.type === 'mp_restore' && e.amount === 18 && !e.blocked));

		const silenced = structuredClone(base);
		silenced.players.p1.mp = 10;
		silenced.players.p1.effects = [
			{ id: 'silence', kind: 'control', duration: 2, stackRule: 'refresh', payload: { block: 'mpRegen' } },
		];
		r = applyAction(silenced, 'p1', 'mage_focus', 0);
		assert.equal(r.state.players.p1.mp, 10); // 회복도 자동회복도 둘 다 막힘
		assert.ok(r.events.some((e) => e.type === 'mp_restore' && e.amount === 0 && e.blocked));
	});
});

test('같은 턴에 양쪽 다 HP 0 이하가 되면 행동한 쪽이 패배한다', () => {
	let state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'warrior' });
	state = structuredClone(state);
	// 양쪽 모두 이번 턴 종료 틱에서 죽을 만큼만 체력을 남겨두고, 서로에게 출혈을 걸어둔다.
	state.players.p1.hp = 3;
	state.players.p2.hp = 3;
	state.players.p1.effects = [{ id: 'bleed', kind: 'dot', duration: 2, stackRule: 'refresh', payload: { amount: 5 } }];
	state.players.p2.effects = [{ id: 'bleed', kind: 'dot', duration: 2, stackRule: 'refresh', payload: { amount: 5 } }];

	const r = withFixedRandom(0.5, () => applyAction(state, 'p1', 'warrior_slash', 0));
	assert.equal(r.state.players.p1.hp, 0);
	assert.equal(r.state.players.p2.hp, 0);
	assert.equal(r.state.reason, 'simultaneous_ko');
	assert.equal(r.state.winner, 'p2'); // 행동한 쪽(p1)이 패배 → 승자는 p2
});
