function extractFillFields(template) {
	const pattern = /\[\[fill:([^\]|]+)(?:\|([^\]]*))?\]\]/g;
	const fields = [];
	let match;
	while ((match = pattern.exec(template)) !== null) {
		fields.push({
			label: match[1].trim(),
			defaultValue: (match[2] || '').trim()
		});
	}
	return fields;
}

function renderTemplate(template, context = {}) {
	return template.replace(
		/\[\[(date:([^\]]+)|clipboard|fill:([^\]|]+)(?:\|([^\]]*))?|cursor)\]\]/g,
		(_match, token, format, label, defaultValue) => {
			if (token === 'cursor') return '';
			if (token === 'clipboard') return context.clipboard || '';
			if (format) {
				const date = new Date();
				return format.toLowerCase() === 'iso' ? date.toISOString() : date.toLocaleDateString();
			}
			return Object.hasOwn(context.fillValues || {}, label.trim())
				? context.fillValues[label.trim()]
				: defaultValue || '';
		}
	);
}

module.exports = {
	extractFillFields,
	renderTemplate
};
