let requestId = null;
let fields = [];

const fieldsEl = document.getElementById('fields');

function render() {
	fieldsEl.innerHTML = '';
	for (const field of fields) {
		const wrap = document.createElement('div');
		const label = document.createElement('label');
		label.textContent = field.label;
		const input = document.createElement('input');
		input.value = field.defaultValue || '';
		input.dataset.label = field.label;
		wrap.appendChild(label);
		wrap.appendChild(input);
		fieldsEl.appendChild(wrap);
	}
	const first = fieldsEl.querySelector('input');
	if (first) {
		first.focus();
		first.select();
	}
}

function collectValues() {
	const values = {};
	fieldsEl.querySelectorAll('input').forEach((input) => {
		values[input.dataset.label] = input.value;
	});
	return values;
}

async function submit(cancelled) {
	const payload = {
		requestId,
		cancelled: !!cancelled,
		values: cancelled ? {} : collectValues()
	};
	window.snipsFillApi.respond(payload);
}

document.getElementById('okBtn').onclick = () => submit(false);
document.getElementById('cancelBtn').onclick = () => submit(true);

window.addEventListener('keydown', (event) => {
	if ('Escape' === event.key) {
		submit(true);
	}
	if ('Enter' === event.key && !event.shiftKey && !event.altKey) {
		submit(false);
	}
});

window.snipsFillApi.onInit((payload) => {
	requestId = payload.requestId;
	fields = payload.fields || [];
	render();
});
