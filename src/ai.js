// AI 대전용 규칙 기반 상대. battle.js와 마찬가지로 소켓과 분리된 순수 함수라
// node --test로 바로 검증할 수 있다.
//
// 규칙(단순하지만 무의미하지 않게):
//   1) 체력이 40% 이하이고 회복을 쓸 수 있으면(MP 충분 + 쿨다운 없음) 회복한다.
//   2) 공격 스킬을 쓸 수 있으면(MP 충분 + 쿨다운 없음) 그걸 쓴다.
//   3) 아니면 MP가 안 드는 기본 공격.
import characters from './data/characters.json' with { type: 'json' };
import skills from './data/skills.json' with { type: 'json' };

const CHAR_IDS = Object.keys(characters);

export function chooseAiCharId() {
	return CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)];
}

export function chooseAiSkill(state, aiSeatKey) {
	const me = state.players[aiSeatKey];
	const mySkills = characters[me.charId].skills; // { basic, attack, heal }

	if (canUse(me, mySkills.heal) && me.hp / me.maxHp <= 0.4) {
		return mySkills.heal;
	}
	if (canUse(me, mySkills.attack)) {
		return mySkills.attack;
	}
	return mySkills.basic;
}

function canUse(player, skillId) {
	const skill = skills[skillId];
	const cooldown = player.cooldowns[skillId] || 0;
	return player.mp >= skill.mpCost && cooldown <= 0;
}
