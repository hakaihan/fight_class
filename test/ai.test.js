import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBattleState } from '../src/battle.js';
import { chooseAiCharId, chooseAiSkill } from '../src/ai.js';

test('AI는 항상 유효한 캐릭터를 고른다', () => {
	for (let i = 0; i < 20; i++) {
		assert.ok(['warrior', 'archer', 'mage'].includes(chooseAiCharId()));
	}
});

test('HP가 충분할 땐(공격 스킬 사용 가능) 공격 스킬을 쓴다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'warrior' });
	// 전사 강타(mpCost 20) — 초기 MP 50이면 충분, 쿨다운도 없음
	assert.equal(chooseAiSkill(state, 'p2'), 'warrior_smash');
});

test('MP가 부족하면 공격 스킬 대신 기본 공격을 쓴다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'warrior' });
	state.players.p2.mp = 5; // warrior_smash의 mpCost(20) 미달
	assert.equal(chooseAiSkill(state, 'p2'), 'warrior_slash');
});

test('여러 공격 스킬 중 쓸 수 있는 것 중 위력이 가장 큰 걸 고른다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'archer' }, { id: 'p2', charId: 'archer' });
	// archer_aimed_shot(위력 1.6) > archer_rapid_shot(0.7*2=1.4) > archer_pierce(1.3) 순
	assert.equal(chooseAiSkill(state, 'p2'), 'archer_aimed_shot');
});

test('가장 위력이 큰 스킬이 쿨다운 중이면 다음으로 위력이 큰 걸 고른다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'archer' }, { id: 'p2', charId: 'archer' });
	state.players.p2.cooldowns.archer_aimed_shot = 1;
	assert.equal(chooseAiSkill(state, 'p2'), 'archer_rapid_shot');
});

test('쓸 수 있는 스킬이 하나도 없으면 MP가 안 드는 기본 공격을 쓴다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'archer' }, { id: 'p2', charId: 'archer' });
	state.players.p2.mp = 0; // 기본 공격 말고는 전부 MP 부족
	assert.equal(chooseAiSkill(state, 'p2'), 'archer_shot');
});

test('버프 스킬은 다른 공격 스킬을 못 쓸 때만 보조로 사용한다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'warrior' }, { id: 'p2', charId: 'warrior' });
	state.players.p2.mp = 12; // warrior_smash(20)는 못 쓰지만 warrior_guard(10)는 쓸 수 있음
	assert.equal(chooseAiSkill(state, 'p2'), 'warrior_guard');
});

test('체력이 40% 이하이고 회복을 쓸 수 있으면 회복을 우선한다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'mage' }, { id: 'p2', charId: 'mage' });
	state.players.p2.hp = Math.round(state.players.p2.maxHp * 0.3); // 30% — 회복 조건 충족
	assert.equal(chooseAiSkill(state, 'p2'), 'heal_common');
});

test('체력이 낮아도 회복 MP가 부족하거나 쿨다운 중이면 회복 대신 다른 스킬을 쓴다', () => {
	const state = createInitialBattleState({ id: 'p1', charId: 'mage' }, { id: 'p2', charId: 'mage' });
	state.players.p2.hp = Math.round(state.players.p2.maxHp * 0.3);
	state.players.p2.cooldowns.heal_common = 1; // 회복 쿨다운 중
	assert.equal(chooseAiSkill(state, 'p2'), 'mage_burst'); // 공격 스킬은 여전히 가능하므로 그걸 씀
});
