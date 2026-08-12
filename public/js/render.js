import { CHAR_META } from './charMeta.js';
import { DURATION } from './anim.js';

const CANVAS_W = 800;
const CANVAS_H = 360;
const GROUND_Y = 280;
const POS = { me: 220, opponent: 580 };
const FACING = { me: 1, opponent: -1 };

function easeInOut(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// viewState: { me: {charId}, opponent: {charId} } — fx: anim.js가 관리하는 타이밍 정보
export function draw(ctx, viewState, animState, now) {
	ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
	ctx.fillStyle = '#111827';
	ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	ctx.strokeStyle = '#1f2937';
	ctx.beginPath();
	ctx.moveTo(0, GROUND_Y + 36);
	ctx.lineTo(CANVAS_W, GROUND_Y + 36);
	ctx.stroke();

	if (!viewState) return;

	for (const side of ['me', 'opponent']) {
		if (viewState[side]) drawFighter(ctx, side, viewState[side], animState.fx[side], now);
	}
	drawFloatingTexts(ctx, animState.floatingTexts, now);
}

function drawFighter(ctx, side, fighter, fx, now) {
	const meta = CHAR_META[fighter.charId] || CHAR_META.warrior;
	const facing = FACING[side];
	const x0 = POS[side];

	const hitT = fx.hitStart != null ? (now - fx.hitStart) / DURATION.shake : 1;
	const shaking = hitT < 1;
	const shakeX = shaking ? (Math.floor(hitT * 8) % 2 === 0 ? 6 : -6) : 0;
	const flashAlpha = shaking ? 1 - hitT : 0;

	const swingT = fx.swingStart != null ? (now - fx.swingStart) / DURATION.swing : 1;
	const swinging = swingT < 1;
	const swingAngle = swinging ? -50 + 120 * easeInOut(swingT) : -50;
	const swingTrailAlpha = swinging ? 1 - swingT : 0;

	const healT = fx.healStart != null ? (now - fx.healStart) / DURATION.heal : 1;
	const healing = healT < 1;
	const healAlpha = healing ? 1 - healT : 0;
	const healScale = healing ? 1 + healT * 0.8 : 1;

	ctx.save();
	ctx.translate(x0 + shakeX, GROUND_Y);

	// 몸통 + 머리
	ctx.fillStyle = flashAlpha > 0 ? mix('#f87171', meta.color, flashAlpha) : meta.color;
	ctx.fillRect(-16, -70, 32, 60);
	ctx.beginPath();
	ctx.arc(0, -85, 16, 0, Math.PI * 2);
	ctx.fill();

	// 팔다리
	ctx.strokeStyle = meta.color;
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(-16, -55); ctx.lineTo(-28, -20);
	ctx.moveTo(16, -55); ctx.lineTo(28, -20);
	ctx.moveTo(-10, -10); ctx.lineTo(-14, 24);
	ctx.moveTo(10, -10); ctx.lineTo(14, 24);
	ctx.stroke();

	// 무기 (칼 휘두르기 각도 반영)
	ctx.save();
	ctx.translate(16 * facing, -55);
	ctx.rotate((facing * swingAngle * Math.PI) / 180);
	drawWeapon(ctx, meta.weapon, meta.color);
	ctx.restore();

	// 스윙 궤적
	if (swingTrailAlpha > 0) {
		ctx.globalAlpha = swingTrailAlpha;
		ctx.strokeStyle = meta.swingColor;
		ctx.lineWidth = 8;
		ctx.beginPath();
		ctx.arc(16 * facing, -55, 46, ((-50 * facing) * Math.PI) / 180, ((70 * facing) * Math.PI) / 180, facing < 0);
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	// 회복 이펙트
	if (healAlpha > 0) {
		ctx.globalAlpha = healAlpha;
		ctx.strokeStyle = '#22c55e';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(0, -45, 40 * healScale, 0, Math.PI * 2);
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	ctx.restore();
}

function drawWeapon(ctx, weapon, color) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 5;
	ctx.beginPath();
	if (weapon === 'sword') {
		ctx.moveTo(0, 6);
		ctx.lineTo(0, -46);
	} else if (weapon === 'bow') {
		ctx.arc(0, -20, 24, -Math.PI / 2.4, Math.PI / 2.4);
	} else {
		ctx.moveTo(0, 10);
		ctx.lineTo(0, -50);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, -56, 6, 0, Math.PI * 2);
	}
	ctx.stroke();
}

function drawFloatingTexts(ctx, texts, now) {
	for (const t of texts) {
		const p = (now - t.start) / DURATION.float;
		const x = POS[t.side];
		const y = GROUND_Y - 100 - 40 * p;
		ctx.globalAlpha = Math.max(0, 1 - p);
		ctx.fillStyle = t.color;
		ctx.font = 'bold 22px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(t.text, x, y);
	}
	ctx.globalAlpha = 1;
}

function mix(hexA, hexB, t) {
	const a = hexToRgb(hexA);
	const b = hexToRgb(hexB);
	const r = Math.round(a.r + (b.r - a.r) * (1 - t));
	const g = Math.round(a.g + (b.g - a.g) * (1 - t));
	const bl = Math.round(a.b + (b.b - a.b) * (1 - t));
	return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex) {
	const n = parseInt(hex.replace('#', ''), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const CANVAS_SIZE = { width: CANVAS_W, height: CANVAS_H };
