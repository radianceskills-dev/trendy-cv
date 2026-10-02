import { validateDraft } from "./target-plan.mjs";
export type SavedCV = {
	id: string;
	name: string;
	updatedAt: string;
	template: string;
	paper: "a4" | "letter";
	draft: ReturnType<typeof validateDraft>;
};
function open() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const r = indexedDB.open("trendy-cv-library", 1);
		r.onupgradeneeded = () => r.result.createObjectStore("cvs", { keyPath: "id" });
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}
export async function library(action: "list" | "save" | "delete", value?: SavedCV | string): Promise<SavedCV[]> {
	const db = await open();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction("cvs", action === "list" ? "readonly" : "readwrite");
			const store = tx.objectStore("cvs");
			if (action === "save") {
				const record = value as SavedCV;
				if (!record.name.trim()) throw Error("Enter a CV name.");
				store.put({ ...record, draft: validateDraft(record.draft) });
			}
			if (action === "delete") store.delete(value as string);
			const request = store.getAll();
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error || Error("Local save aborted"));
		});
	} finally {
		db.close();
	}
}
