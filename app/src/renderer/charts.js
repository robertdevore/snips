/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param {number} durationMs
 * @returns {string}
 */
export function formatDurationMs(durationMs) {
	const totalSeconds = Math.max(0, Math.round((durationMs || 0) / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const parts = [];
	if (days) parts.push(`${days}d`);
	if (hours || parts.length) parts.push(`${hours}h`);
	if (minutes || parts.length) parts.push(`${minutes}m`);
	parts.push(`${seconds}s`);
	return parts.join(' ');
}

function getCssVarValue(name, fallback) {
	try {
		const value = getComputedStyle(document.documentElement).getPropertyValue(name);
		return (value || '').trim() || fallback;
	} catch (_e) {
		return fallback;
	}
}

function hexToRgb(hex) {
	const raw = String(hex || '')
		.trim()
		.replace('#', '');
	if (3 === raw.length) {
		const r = parseInt(raw.charAt(0) + raw.charAt(0), 16);
		const g = parseInt(raw.charAt(1) + raw.charAt(1), 16);
		const b = parseInt(raw.charAt(2) + raw.charAt(2), 16);
		return { r, g, b };
	}
	if (6 !== raw.length) return null;
	const r = parseInt(raw.slice(0, 2), 16);
	const g = parseInt(raw.slice(2, 4), 16);
	const b = parseInt(raw.slice(4, 6), 16);
	if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
	return { r, g, b };
}

function rgbaFromHex(hex, alpha) {
	const rgb = hexToRgb(hex);
	if (!rgb) return `rgba(0,0,0,${alpha})`;
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function prepareCanvas(canvasEl) {
	if (!canvasEl) return null;
	const rect = canvasEl.getBoundingClientRect();
	const cssWidth = Math.max(10, Math.floor(rect.width));
	const cssHeight = Math.max(10, Math.floor(rect.height));
	const dpr = window.devicePixelRatio || 1;
	const width = Math.floor(cssWidth * dpr);
	const height = Math.floor(cssHeight * dpr);
	if (canvasEl.width !== width) canvasEl.width = width;
	if (canvasEl.height !== height) canvasEl.height = height;
	const ctx = canvasEl.getContext('2d');
	if (!ctx) return null;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return { ctx, width: cssWidth, height: cssHeight };
}

function drawEmptyChart(canvasEl, message) {
	const prepared = prepareCanvas(canvasEl);
	if (!prepared) return;
	const { ctx, width, height } = prepared;
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = getCssVarValue('--muted', '#64748b');
	ctx.font = '12px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(message || 'No data', Math.floor(width / 2), Math.floor(height / 2));
}

function truncateLabel(label, maxLen) {
	const text = String(label || '');
	if (text.length <= maxLen) return text;
	return text.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function renderBarChart(canvasEl, rows) {
	if (!canvasEl) return;
	const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
	if (!items.length) {
		drawEmptyChart(canvasEl, 'No snippet usage yet');
		return;
	}
	const prepared = prepareCanvas(canvasEl);
	if (!prepared) return;
	const { ctx, width, height } = prepared;
	ctx.clearRect(0, 0, width, height);

	const accent = getCssVarValue('--accent', '#f97316');
	const border = getCssVarValue('--border', '#e5e7ef');
	const text = getCssVarValue('--text', '#0f172a');
	const muted = getCssVarValue('--muted', '#64748b');

	const paddingTop = 10;
	const paddingRight = 10;
	const paddingBottom = 28;
	const paddingLeft = 34;
	const plotW = Math.max(10, width - paddingLeft - paddingRight);
	const plotH = Math.max(10, height - paddingTop - paddingBottom);
	const maxValue = Math.max.apply(
		null,
		items.map((row) => Number(row.expansionCount || 0))
	);
	const safeMax = Math.max(1, maxValue);

	ctx.strokeStyle = border;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(paddingLeft, paddingTop);
	ctx.lineTo(paddingLeft, paddingTop + plotH);
	ctx.lineTo(paddingLeft + plotW, paddingTop + plotH);
	ctx.stroke();

	ctx.fillStyle = muted;
	ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	const ticks = 4;
	for (let i = 0; i <= ticks; i++) {
		const t = i / ticks;
		const y = paddingTop + plotH - t * plotH;
		const v = Math.round(t * safeMax);
		ctx.fillText(String(v), paddingLeft - 6, y);
		ctx.strokeStyle = rgbaFromHex(border, 0.55);
		ctx.beginPath();
		ctx.moveTo(paddingLeft, y);
		ctx.lineTo(paddingLeft + plotW, y);
		ctx.stroke();
	}

	const barCount = items.length;
	const gap = 8;
	const barW = Math.max(10, Math.floor((plotW - gap * (barCount - 1)) / barCount));
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillStyle = text;
	ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

	for (let i = 0; i < barCount; i++) {
		const row = items[i];
		const value = Number(row.expansionCount || 0);
		const h = Math.round((value / safeMax) * plotH);
		const x = paddingLeft + i * (barW + gap);
		const y = paddingTop + plotH - h;
		ctx.fillStyle = rgbaFromHex(accent, 0.85);
		ctx.fillRect(x, y, barW, h);
		ctx.fillStyle = text;
		const label = truncateLabel(row.abbreviation || row.name || '', 10);
		ctx.fillText(label, x + barW / 2, paddingTop + plotH + 6);
	}
}

function renderPieLegend(legendEl, slices) {
	if (!legendEl) return;
	const items = Array.isArray(slices) ? slices.filter(Boolean) : [];
	if (!items.length) {
		legendEl.innerHTML = '';
		return;
	}
	legendEl.innerHTML = items
		.map((slice) => {
			const label = String(slice.label || '')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `
			<div class="legend-row">
				<span class="swatch" style="background:${slice.color}"></span>
				<span class="legend-label">${label}</span>
				<span class="legend-value">${slice.percent}%</span>
			</div>
		`;
		})
		.join('');
}

function renderPieChart(canvasEl, perSnippet, legendEl) {
	if (!canvasEl) return;
	const rows = Array.isArray(perSnippet) ? perSnippet.filter(Boolean) : [];
	const total = rows.reduce((acc, r) => acc + Number(r.expansionCount || 0), 0);
	if (!total) {
		drawEmptyChart(canvasEl, 'No usage to chart');
		if (legendEl) legendEl.innerHTML = '';
		return;
	}

	const top = rows
		.slice()
		.sort((a, b) => Number(b.expansionCount || 0) - Number(a.expansionCount || 0))
		.slice(0, 5);
	const topTotal = top.reduce((acc, r) => acc + Number(r.expansionCount || 0), 0);
	const rest = Math.max(0, total - topTotal);

	const accent = getCssVarValue('--accent', '#f97316');
	const muted = getCssVarValue('--muted', '#64748b');
	const border = getCssVarValue('--border', '#e5e7ef');
	const colors = [
		rgbaFromHex(accent, 0.9),
		rgbaFromHex(accent, 0.72),
		rgbaFromHex(accent, 0.58),
		rgbaFromHex(accent, 0.46),
		rgbaFromHex(accent, 0.34),
		rgbaFromHex(muted, 0.35)
	];

	const slices = [];
	for (let i = 0; i < top.length; i++) {
		const value = Number(top[i].expansionCount || 0);
		const percent = Math.round((value / total) * 100);
		slices.push({
			label: top[i].abbreviation || top[i].name || 'Snippet',
			value,
			percent,
			color: colors[i] || rgbaFromHex(accent, 0.5)
		});
	}
	if (rest) {
		slices.push({
			label: 'Other',
			value: rest,
			percent: Math.max(1, 100 - slices.reduce((acc, s) => acc + Number(s.percent || 0), 0)),
			color: colors[colors.length - 1]
		});
	}

	const prepared = prepareCanvas(canvasEl);
	if (!prepared) return;
	const { ctx, width, height } = prepared;
	ctx.clearRect(0, 0, width, height);

	const centerX = Math.floor(width / 2);
	const centerY = Math.floor(height / 2);
	const radius = Math.max(10, Math.floor(Math.min(width, height) / 2) - 12);
	let start = -Math.PI / 2;
	for (const slice of slices) {
		const angle = (slice.value / total) * (Math.PI * 2);
		ctx.beginPath();
		ctx.moveTo(centerX, centerY);
		ctx.arc(centerX, centerY, radius, start, start + angle);
		ctx.closePath();
		ctx.fillStyle = slice.color;
		ctx.fill();
		start += angle;
	}
	ctx.strokeStyle = rgbaFromHex(border, 0.6);
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
	ctx.stroke();

	renderPieLegend(legendEl, slices);
}

/**
 * Renders stats charts from a stats payload.
 * @param {Object} statsPayload - Stats data from the API.
 */
export function renderStatsCharts(canvasEls, statsPayload) {
	if (!statsPayload) return;
	const per = Array.isArray(statsPayload.perSnippet) ? statsPayload.perSnippet : [];
	renderBarChart(canvasEls.bar, per.slice(0, 8));
	renderPieChart(canvasEls.pie, per, canvasEls.legend);
}
