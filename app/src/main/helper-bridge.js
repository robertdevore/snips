const net = require('net');
const http = require('http');

class HelperBridge {
	/**
	 * @param {object} options
	 * @param {Function} options.onEvent - Callback for helper events
	 */
	constructor({ onEvent }) {
		this.onEvent = onEvent;
		this.host = '127.0.0.1';
		this.port = 50555;
		this.appEventPort = 50556;
		this.server = null;
	}

	/**
	 * Updates the host/port configuration for the helper connection.
	 * @param {object} opts
	 * @param {string} [opts.host]
	 * @param {number|string} [opts.port]
	 * @param {number|string} [opts.appEventPort]
	 */
	updatePorts({ host, port, appEventPort }) {
		this.host = host || '127.0.0.1';
		this.port = Number(port || 50555);
		this.appEventPort = Number(appEventPort || 50556);
	}

	/**
	 * Starts the HTTP server that receives events from the helper.
	 */
	startEventServer() {
		if (this.server) {
			return;
		}
		this.server = http.createServer((req, res) => {
			if ('POST' !== req.method || '/helper-event' !== req.url) {
				res.statusCode = 404;
				res.end('Not found');
				return;
			}
			let body = '';
			req.on('data', (chunk) => {
				body += chunk;
			});
			req.on('end', () => {
				try {
					const event = JSON.parse(body || '{}');
					this.onEvent(event);
					res.statusCode = 200;
					res.end('ok');
				} catch (_error) {
					res.statusCode = 400;
					res.end('bad json');
				}
			});
		});
		this.server.listen(this.appEventPort, '127.0.0.1');
	}

	/**
	 * Sends a JSON command to the helper over TCP.
	 * @param {object} command
	 * @returns {Promise<object>}
	 */
	sendCommand(command) {
		return new Promise((resolve, reject) => {
			const socket = new net.Socket();
			let response = '';
			// Large snippet libraries can produce config payloads >100KB and take longer
			// than 1.2s end-to-end on some machines. A short timeout leaves the helper
			// running but unsynced (e.g. "Snippet not found" on insert_by_id).
			socket.setTimeout(5000);
			socket.connect(this.port, this.host, () => {
				socket.write(`${JSON.stringify(command)}\n`);
			});
			socket.on('data', (data) => {
				response += data.toString('utf8');
				if (response.includes('\n')) {
					socket.end();
				}
			});
			socket.on('timeout', () => {
				socket.destroy();
				reject(new Error('helper timeout'));
			});
			socket.on('error', (error) => {
				reject(error);
			});
			socket.on('close', () => {
				if (!response.trim()) {
					resolve({ ok: false, message: 'No response' });
					return;
				}
				try {
					const line = response.trim().split('\n')[0];
					resolve(JSON.parse(line));
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	/**
	 * Sends the full snippet/configuration payload to the helper.
	 * @param {object} opts
	 * @param {Array} opts.snippets
	 * @param {Settings} opts.settings
	 * @returns {Promise<object>}
	 */
	sendConfig({ snippets, settings }) {
		let excludedApps = [];
		try {
			excludedApps = JSON.parse(settings.excludedApps || '[]');
		} catch (_error) {
			excludedApps = [];
		}
		return this.sendCommand({
			type: 'config_update',
			payload: {
				snippets,
				settings: {
					enabled: 'true' === settings.enabled,
					expandOn: settings.expandOn || 'whitespace',
					maxBufferLength: Number(settings.maxBufferLength || 200),
					excludedApps,
					secureInputBehavior: settings.secureInputBehavior || 'disable',
					pauseExpansions: 'true' === settings.pauseExpansions,
					eventCallbackUrl: `http://127.0.0.1:${this.appEventPort}/helper-event`,
					wpm: Number(settings.wpm || 220),
					charsPerWord: Number(settings.charsPerWord || 6)
				}
			}
		});
	}

	/**
	 * Requests the helper to insert a snippet by its ID.
	 * @param {string} snippetId
	 * @returns {Promise<object>}
	 */
	insertById(snippetId) {
		return this.sendCommand({
			type: 'insert_by_id',
			payload: { snippetId }
		});
	}
}

module.exports = { HelperBridge };
