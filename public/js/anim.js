// 서버가 준 events[]를 순서대로 재생하는 큐. 재생 중엔 스킬 버튼을 잠그고,
// 큐가 비면 호출자가 대기 중인 snapshot을 화면에 확정 반영한다.
const DURATIONS = { swing: 260, shake: 220, heal: 550, float: 750 };

export function createAnimState() {
	return {
		fx: { me: {}, opponent: {} }, // side -> { swingStart, swingColor, hitStart, healStart }
		floatingTexts: [],
		queue: [],
		playing: false,
		stepStart: 0,
		stepDuration: 0,
	};
}

export function isBusy(animState) {
	return animState.playing || animState.queue.length > 0;
}

export function enqueue(animState, step) {
	animState.queue.push(step);
}

// 매 프레임 호출 (now = performance.now()). 한 스텝이 끝나면 다음 스텝을 자동으로 시작한다.
export function tick(animState, now) {
	if (!animState.playing && animState.queue.length > 0) {
		playNext(animState, now);
	}
	if (animState.playing && now - animState.stepStart >= animState.stepDuration) {
		animState.playing = false;
	}
	animState.floatingTexts = animState.floatingTexts.filter((t) => now - t.start < DURATIONS.float);
}

function playNext(animState, now) {
	const step = animState.queue.shift();
	const fx = animState.fx[step.side];

	if (step.kind === 'skill_cast') {
		fx.swingStart = now;
		fx.swingColor = step.color;
		animState.stepDuration = DURATIONS.swing;
	} else if (step.kind === 'damage') {
		fx.hitStart = now;
		animState.floatingTexts.push({
			start: now,
			text: `-${step.amount}${step.crit ? '!' : ''}`,
			side: step.side,
			color: step.crit ? '#facc15' : '#f87171',
		});
		animState.stepDuration = DURATIONS.shake;
	} else if (step.kind === 'heal') {
		fx.healStart = now;
		animState.floatingTexts.push({ start: now, text: `+${step.amount}`, side: step.side, color: '#4ade80' });
		animState.stepDuration = DURATIONS.heal;
	} else {
		animState.stepDuration = 0;
	}

	animState.stepStart = now;
	animState.playing = true;
}

export const DURATION = DURATIONS;
