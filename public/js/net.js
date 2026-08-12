// 네이티브 WebSocket 래퍼. 서버가 보내는 { type, payload } 메시지를 type별로
// 등록된 핸들러에 그대로 전달한다.
export class Net {
	constructor() {
		this.ws = null;
		this.handlers = new Map();
	}

	on(type, handler) {
		this.handlers.set(type, handler);
	}

	connect({ action, nickname, roomId }) {
		return new Promise((resolve, reject) => {
			const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
			const params = new URLSearchParams({ action, nickname });
			if (roomId) params.set('roomId', roomId);
			const ws = new WebSocket(`${proto}//${location.host}/ws?${params.toString()}`);
			let opened = false;

			ws.addEventListener('open', () => {
				opened = true;
				this.ws = ws;
				resolve(ws);
			});
			ws.addEventListener('error', () => {
				if (!opened) reject(new Error('connect_failed'));
			});
			ws.addEventListener('close', () => {
				const handler = this.handlers.get('_close');
				if (handler) handler();
			});
			ws.addEventListener('message', (event) => {
				let msg;
				try {
					msg = JSON.parse(event.data);
				} catch {
					return;
				}
				const handler = this.handlers.get(msg.type);
				if (handler) handler(msg.payload);
			});
		});
	}

	send(type, payload = {}) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ type, payload }));
	}

	close() {
		if (this.ws) this.ws.close();
	}
}
