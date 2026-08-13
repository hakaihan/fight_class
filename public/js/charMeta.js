// 서버(src/data/characters.json, skills.json)와 같은 값을 쓰지만, 여기서는 오직
// "무엇을 그리고 어떤 글자를 보여줄지"에만 쓴다. 전투 수치(HP/MP/데미지)는
// 절대 클라이언트가 계산하지 않고 서버 스냅샷을 그대로 반영한다.
// skills.json의 label/id/순서가 바뀌면 이 파일도 같이 맞춰줘야 한다.
// skills 배열의 순서 = 스킬 버튼이 표시되는 순서 (기본 공격이 항상 첫 번째, 회복이 항상 마지막).
export const CHAR_META = {
	warrior: {
		name: '전사', color: '#e5e7eb', swingColor: '#ffffff', weapon: 'sword',
		skills: [
			{ id: 'warrior_slash', label: '베기' },
			{ id: 'warrior_smash', label: '강타' },
			{ id: 'warrior_guard', label: '방어 태세' },
			{ id: 'warrior_war_cry', label: '투지' },
			{ id: 'heal_common', label: '회복' },
		],
	},
	archer: {
		name: '궁수', color: '#86efac', swingColor: '#86efac', weapon: 'bow',
		skills: [
			{ id: 'archer_shot', label: '사격' },
			{ id: 'archer_pierce', label: '관통 사격' },
			{ id: 'archer_rapid_shot', label: '속사' },
			{ id: 'archer_aimed_shot', label: '조준 사격' },
			{ id: 'heal_common', label: '회복' },
		],
	},
	mage: {
		name: '마법사', color: '#c4b5fd', swingColor: '#a78bfa', weapon: 'staff',
		skills: [
			{ id: 'mage_bolt', label: '마력탄' },
			{ id: 'mage_burst', label: '파열 마법' },
			{ id: 'mage_mana_burn', label: '마나 번' },
			{ id: 'mage_focus', label: '집중' },
			{ id: 'heal_common', label: '회복' },
		],
	},
};

export const EFFECT_LABELS = {
	atk_down: '공격력 감소',
	bleed: '출혈',
	silence: '침묵',
	guard: '방어 태세',
	war_cry: '투지',
};
