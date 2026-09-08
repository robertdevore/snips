const net = require('net');
const http = require('http');
const { randomUUID } = require('crypto');
const { authorized, validEvent, PROTOCOL_VERSION, MAX_EVENT_BYTES, MAX_COMMAND_BYTES } = require('./helper-protocol');

class HelperBridge {
	/**
	 * @param {object} options
	 * @param {Function} options.onEvent - Callback for helper events
	 */
	constructor({ onEvent, token }) {
		this.onEvent = onEvent;
		this.token = token;
		this.revision = 0;
		this.config = null;
		this.syncChain = Promise.resolve();
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
		if (host && host !== '127.0.0.1') throw new Error('HELPER_LOOPBACK_REQUIRED');
		this.host = '127.0.0.1';
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
			if (!authorized(req.headers.authorization, `Bearer ${this.token}`)) {
				res.writeHead(401).end();
				req.resume();
				return;
			}
			if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
				res.writeHead(415).end();
				req.resume();
				return;
			}
			let size = 0;
			const chunks = [];
			let rejected = false;
			req.on('error', () => {
				res.destroy();
			});
			req.on('data', (chunk) => {
				size += chunk.length;
				if (size > MAX_EVENT_BYTES) {
					rejected = true;
					res.writeHead(413).end();
					req.destroy();
				} else chunks.push(chunk);
			});
			req.on('end', () => {
				if (rejected) return;
				let event;
				try {
					event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
				} catch {
					res.writeHead(400).end();
					return;
				}
				if (!validEvent(event)) {
					res.writeHead(400).end();
					return;
				}
				try {
					this.onEvent(event);
					res.writeHead(200).end('ok');
				} catch {
					res.writeHead(500).end();
				}
			});
		});
		this.server.requestTimeout = 5000;
		this.server.headersTimeout = 5000;
		this.server.setTimeout(5000, (socket) => socket.destroy());
		this.server.maxConnections = 32;
		this.server.on('error', (error) => {
			this.lastError = error.message;
		});
		this.server.listen(this.appEventPort, '127.0.0.1');
	}

	/**
	 * Sends a JSON command to the helper over TCP.
	 * @param {object} command
	 * @returns {Promise<object>}
	 */
	sendCommand(command) {
		const envelope = { ...command, protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), token: this.token };
		const encoded = JSON.stringify(envelope) + '\n';
		if (Buffer.byteLength(encoded) > MAX_COMMAND_BYTES) return Promise.reject(new Error('COMMAND_TOO_LARGE'));
		return new Promise((resolve, reject) => {
			const socket = new net.Socket();
			let response = '';
			// Large snippet libraries can produce config payloads >100KB and take longer
			// than 1.2s end-to-end on some machines. A short timeout leaves the helper
			// running but unsynced (e.g. "Snippet not found" on insert_by_id).
			socket.setTimeout(5000);
			socket.connect(this.port, this.host, () => {
				socket.write(encoded);
			});
			socket.on('data', (data) => {
				response += data.toString('utf8');
				if (Buffer.byteLength(response) > MAX_EVENT_BYTES) {
					socket.destroy();
					reject(new Error('RESPONSE_TOO_LARGE'));
					return;
				}
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
					const result = JSON.parse(line);
					if (result.protocolVersion !== PROTOCOL_VERSION)
						throw new Error('HELPER_PROTOCOL_MISMATCH: use Upgrade helper');
					if (!result.ok) throw new Error(result.message || 'HELPER_REJECTED');
					resolve(result);
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
		const command = {
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
		};
		const sync = async () => {
			const next = command.payload;
			let payload = next;
			let type = 'config_update';
			if (this.config) {
				const previous = new Map(this.config.snippets.map((s) => [s.id, JSON.stringify(s)]));
				const ids = new Set(snippets.map((s) => s.id));
				payload = {
					upserts: snippets.filter((s) => previous.get(s.id) !== JSON.stringify(s)),
					deletes: [...previous.keys()].filter((id) => !ids.has(id)),
					settings: next.settings,
					baseRevision: this.revision
				};
				type = 'config_patch';
			}
			let revision = this.revision + 1;
			try {
				let result;
				if (Buffer.byteLength(JSON.stringify(payload)) > MAX_COMMAND_BYTES - 1024) {
					// Large recovery syncs stay disabled until every bounded chunk arrives.
					result = await this.sendCommand({
						type: 'config_update',
						payload: { snippets: [], settings: { ...next.settings, enabled: false }, revision }
					});
					let batch = [],
						bytes = 0;
					const flush = async () => {
						if (!batch.length) return;
						const baseRevision = revision++;
						result = await this.sendCommand({
							type: 'config_patch',
							payload: {
								upserts: batch,
								deletes: [],
								settings: { ...next.settings, enabled: false },
								baseRevision,
								revision
							}
						});
						batch = [];
						bytes = 0;
					};
					for (const snippet of snippets) {
						const size = Buffer.byteLength(JSON.stringify(snippet));
						if (bytes + size > 2 * 1024 * 1024) await flush();
						batch.push(snippet);
						bytes += size;
					}
					await flush();
					const baseRevision = revision++;
					result = await this.sendCommand({
						type: 'config_patch',
						payload: { upserts: [], deletes: [], settings: next.settings, baseRevision, revision }
					});
				} else result = await this.sendCommand({ type, payload: { ...payload, revision } });
				this.config = next;
				this.revision = revision;
				return result;
			} catch (error) {
				this.config = null;
				this.revision = 0;
				throw error;
			}
		};
		const pending = this.syncChain.then(sync, sync);
		this.syncChain = pending.catch(() => {});
		return pending;
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
