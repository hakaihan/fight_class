// 서버(src/data/characters.json, skills.json)와 같은 값을 쓰지만, 여기서는 오직
// "무엇을 그리고 어떤 글자를 보여줄지"에만 쓴다. 전투 수치(HP/MP/데미지)는
// 절대 클라이언트가 계산하지 않고 서버 스냅샷을 그대로 반영한다.
// skills.json의 label/id가 바뀌면 이 파일도 같이 맞춰줘야 한다.
export const CHAR_META = {
	warrior: {
		name: '전사', color: '#e5e7eb', swingColor: '#ffffff', weapon: 'sword',
		skillIds: { basic: 'warrior_slash', attack: 'warrior_smash', heal: 'heal_common' },
		skillLabels: { basic: '베기', attack: '강타', heal: '회복' },
	},
	archer: {
		name: '궁수', color: '#86efac', swingColor: '#86efac', weapon: 'bow',
		skillIds: { basic: 'archer_shot', attack: 'archer_pierce', heal: 'heal_common' },
		skillLabels: { basic: '사격', attack: '관통 사격', heal: '회복' },
	},
	mage: {
		name: '마법사', color: '#c4b5fd', swingColor: '#a78bfa', weapon: 'staff',
		skillIds: { basic: 'mage_bolt', attack: 'mage_burst', heal: 'heal_common' },
		skillLabels: { basic: '마력탄', attack: '파열 마법', heal: '회복' },
	},
};

export const EFFECT_LABELS = {
	atk_down: '공격력 감소',
	bleed: '출혈',
	silence: '침묵',
};
