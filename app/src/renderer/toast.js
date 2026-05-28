/**
 * Shows a toast notification in the toast container.
 * @param {string} message - The message to display.
 * @param {'success'|'warning'|'error'} type - Toast type (affects styling).
 * @param {number} timeoutMs - Auto-dismiss timeout in milliseconds.
 */
export function showToast(message, type = 'success', timeoutMs = 2600) {
	const container = document.getElementById('toastContainer');
	if (!container) {
		return;
	}
	const toast = document.createElement('div');
	toast.className = `toast ${type}`;
	toast.textContent = message;
	container.appendChild(toast);
	requestAnimationFrame(() => {
		toast.classList.add('show');
	});
	setTimeout(() => {
		toast.classList.remove('show');
		setTimeout(() => {
			toast.remove();
		}, 180);
	}, timeoutMs);
}
