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

function renderTemplate(template, context) {
	let text = template;
	text = text.replace(/\[\[date:([^\]]+)\]\]/g, (_, format) => {
		const date = new Date();
		if ('iso' === format.toLowerCase()) {
			return date.toISOString();
		}
		if ('short' === format.toLowerCase()) {
			return date.toLocaleDateString();
		}
		return new Intl.DateTimeFormat(undefined, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	});
	text = text.replace(/\[\[clipboard\]\]/g, context.clipboard || '');
	text = text.replace(/\[\[fill:([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, label, defaultValue) => {
		const key = label.trim();
		if (Object.prototype.hasOwnProperty.call(context.fillValues || {}, key)) {
			return context.fillValues[key];
		}
		return (defaultValue || '').trim();
	});
	return text;
}

module.exports = {
	extractFillFields,
	renderTemplate
};
