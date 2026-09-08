const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
function helperToken(directory) {
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const filename = path.join(directory, 'helper-token');
	try {
		fs.writeFileSync(filename, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
	} catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	const stat = fs.lstatSync(filename);
	if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid())
		throw new Error('Unsafe helper token permissions');
	const token = fs.readFileSync(filename, 'utf8');
	if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid helper token');
	return token;
}
module.exports = { helperToken };
