import { showToast } from './toast.js';

/**
 * Derives a group name from a CSV filename (strips .csv extension).
 * @param {string} filename
 * @returns {string}
 */
export function groupNameFromFilename(filename) {
	const base = String(filename || '')
		.replace(/\.csv$/i, '')
		.trim();
	return base || 'Imported';
}

function readFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(new Error('Failed to read file.'));
		reader.readAsText(file);
	});
}

export async function importCsvFiles(files, options) {
	const fileList = Array.from(files || []).filter(Boolean);
	if (!fileList.length) {
		showToast('No CSV files found to import.', 'warning', 2600);
		return;
	}

	let totalCreated = 0;
	let totalUpdated = 0;
	let totalSkipped = 0;
	let failed = 0;

	for (const file of fileList) {
		try {
			const groupName =
				options && options.groupName ? String(options.groupName).trim() : groupNameFromFilename(file.name);
			const csvText = await readFileAsText(file);
			const result = await window.snipsApi.importCsv({ groupName, csvText });
			if (!result || !result.ok) {
				failed++;
				continue;
			}
			totalCreated += Number(result.created || 0);
			totalUpdated += Number(result.updated || 0);
			totalSkipped += Number(result.skipped || 0);
		} catch (_err) {
			failed++;
		}
	}

	if (failed) {
		showToast(
			`Imported: ${totalCreated} new, ${totalUpdated} updated, ${totalSkipped} skipped. (${failed} failed)`,
			'warning',
			5200
		);
	} else if (totalSkipped) {
		showToast(`Imported: ${totalCreated} new, ${totalUpdated} updated, ${totalSkipped} skipped.`, 'success', 4200);
	} else {
		showToast(`Imported: ${totalCreated} new, ${totalUpdated} updated.`, 'success', 4200);
	}
}
