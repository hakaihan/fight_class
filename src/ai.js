// AI 대전용 규칙 기반 상대. battle.js와 마찬가지로 소켓과 분리된 순수 함수라
// node --test로 바로 검증할 수 있다.
//
// 규칙(단순하지만 무의미하지 않게):
//   1) 체력이 40% 이하이고 회복을 쓸 수 있으면(MP 충분 + 쿨다운 없음) 회복한다.
//   2) 그 외엔 기본 공격을 뺀 나머지 중 "지금 쓸 수 있는" 스킬을 위력이 큰 순서로 고른다
//      (위력 = multiplier * hits, 버프/자원계열은 낮은 고정 우선순위로 취급).
//   3) 아무것도 못 쓰면 MP가 안 드는 기본 공격.
import characters from './data/characters.json' with { type: 'json' };
import skills from './data/skills.json' with { type: 'json' };

const CHAR_IDS = Object.keys(characters);

export function chooseAiCharId() {
	return CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)];
}

export function chooseAiSkill(state, aiSeatKey) {
	const me = state.players[aiSeatKey];
	const mySkillIds = characters[me.charId].skills; // [기본공격, ..., 회복] 순서의 배열
	const basicId = mySkillIds[0];
	const healId = mySkillIds.find((id) => skills[id].kind === 'heal');

	if (healId && canUse(me, healId) && me.hp / me.maxHp <= 0.4) {
		return healId;
	}

	const candidates = mySkillIds
		.filter((id) => id !== basicId && id !== healId)
		.filter((id) => canUse(me, id))
		.sort((a, b) => skillPower(skills[b]) - skillPower(skills[a]));

	if (candidates.length > 0) return candidates[0];
	return basicId;
}

function canUse(player, skillId) {
	const skill = skills[skillId];
	const cooldown = player.cooldowns[skillId] || 0;
	return player.mp >= skill.mpCost && cooldown <= 0;
}

function skillPower(skill) {
	if (skill.kind === 'buff') return 0.5; // 즉발 피해가 없는 버프는 데미지 스킬보다 낮은 우선순위
	return (skill.multiplier || 0) * (skill.hits || 1);
}
