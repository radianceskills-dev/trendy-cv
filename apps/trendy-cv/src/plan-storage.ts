import { migrateLegacy, newDraft, validateDraft } from "./target-plan.mjs";

function database(name: string, store: string) {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(name, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(store);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(Error("Close other CV tabs to open local storage."));
	});
}
async function transact(name: string, store: string, value?: unknown) {
	const db = await database(name, store);
	try {
		return await new Promise<unknown>((resolve, reject) => {
			const tx = db.transaction(store, value === undefined ? "readonly" : "readwrite");
			const request =
				value === undefined ? tx.objectStore(store).get("current") : tx.objectStore(store).put(value, "current");
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error || Error("Local save aborted."));
		});
	} finally {
		db.close();
	}
}
export async function loadPlanDraft() {
	const current = await transact("trendy-cv-planner", "drafts");
	if (current !== undefined) return validateDraft(current);
	const legacy = await transact("trendy-cv-wizard", "drafts");
	return legacy === undefined ? newDraft() : migrateLegacy(legacy);
}
// Serialize writes so a slow earlier autosave cannot replace accepted state.
let writes = Promise.resolve();
export function savePlanDraft(draft: ReturnType<typeof newDraft>) {
	const snapshot = validateDraft(structuredClone(draft));
	const next = writes
		.catch(() => {})
		.then(async () => {
			await transact("trendy-cv-planner", "drafts", snapshot);
		});
	writes = next;
	return next;
}
