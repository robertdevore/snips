let items = [];
let selected = 0;

const searchEl = document.getElementById('paletteSearch');
const listEl = document.getElementById('paletteList');

async function fetchItems() {
	items = await window.snipsApi.listSnippets({ query: searchEl.value || '', limit: 30, metadata: true });
	selected = 0;
	render();
}

function render() {
	listEl.innerHTML = '';
	items.slice(0, 30).forEach((item, index) => {
		const row = document.createElement('div');
		row.className = `item${index === selected ? ' active' : ''}`;
		const title = document.createElement('div');
		const strong = document.createElement('strong');
		strong.textContent = item.name || '';
		title.appendChild(strong);
		const meta = document.createElement('div');
		meta.className = 'meta';
		meta.textContent = item.abbreviation || '';
		row.append(title, meta);
		row.onclick = () => {
			selected = index;
			insertSelected();
		};
		listEl.appendChild(row);
	});
}

async function insertSelected() {
	if (!items[selected]) {
		return;
	}
	await window.snipsApi.insertByPalette(items[selected].id);
	window.close();
}

searchEl.addEventListener('input', () => {
	fetchItems();
});

window.addEventListener('keydown', (event) => {
	if ('ArrowDown' === event.key) {
		event.preventDefault();
		selected = Math.min(selected + 1, Math.max(0, items.length - 1));
		render();
	}
	if ('ArrowUp' === event.key) {
		event.preventDefault();
		selected = Math.max(selected - 1, 0);
		render();
	}
	if ('Enter' === event.key) {
		event.preventDefault();
		insertSelected();
	}
	if ('Escape' === event.key) {
		window.close();
	}
});

window.snipsApi.onPaletteShow(() => {
	searchEl.value = '';
	searchEl.focus();
	fetchItems();
});

fetchItems();
