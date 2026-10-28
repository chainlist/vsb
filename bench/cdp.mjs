// A small Chrome DevTools Protocol client, enough to run code in a page and wait for its answer.
// Works with WebView2 (the desktop app) and Edge or Chrome (the web build) started with
// --remote-debugging-port.

export async function connect(port) {
	const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
	const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
	if (!page) throw new Error(`no page on port ${port}`);
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', reject, { once: true });
	});
	let last = 0;
	const pending = new Map();
	ws.addEventListener('message', (e) => {
		const m = JSON.parse(e.data);
		pending.get(m.id)?.(m);
		pending.delete(m.id);
	});
	const send = (method, params = {}) =>
		new Promise((resolve) => {
			const id = ++last;
			pending.set(id, resolve);
			ws.send(JSON.stringify({ id, method, params }));
		});
	/** Runs `expression` in the page, waits for its promise, and returns its value. */
	async function evaluate(expression) {
		const { result, error } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
		if (error) throw new Error(error.message);
		if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
		return result.result.value;
	}
	return { send, evaluate, url: page.url, close: () => ws.close() };
}
