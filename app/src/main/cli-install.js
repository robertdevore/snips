const fs = require('fs'),
	path = require('path');
const marker = '# Snips managed CLI launcher v1';
const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
function installCli({ home, executable, entry }) {
	const target = path.join(home, '.local', 'bin', 'snips');
	fs.mkdirSync(path.dirname(target), { recursive: true });
	if (fs.existsSync(target) && (!fs.lstatSync(target).isFile() || !fs.readFileSync(target, 'utf8').includes(marker)))
		throw new Error('CLI_PATH_OCCUPIED: move the existing ~/.local/bin/snips first');
	const text = `#!/bin/sh\n${marker}\nELECTRON_RUN_AS_NODE=1 exec ${quote(executable)} ${quote(entry)} "$@"\n`;
	const temp = target + '.tmp';
	fs.writeFileSync(temp, text, { mode: 0o755, flag: 'wx' });
	fs.renameSync(temp, target);
	return {
		ok: true,
		path: target,
		message: 'CLI installed. Add ~/.local/bin to PATH if it is not already present. No shell files were changed.'
	};
}
module.exports = { installCli };
