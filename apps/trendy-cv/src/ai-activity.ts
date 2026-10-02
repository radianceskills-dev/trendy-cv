export type Activity = {
	id: number;
	label: string;
	text: string;
	status: "generating" | "complete" | "failed" | "cancelled";
	error?: string;
};
let counter = 0;
let snapshot: Activity[] = [];
const listeners = new Set<() => void>();
function publish() {
	for (const listener of listeners) listener();
}
export const subscribeActivity = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
export const getActivity = () => snapshot;
export function startActivity(label: string) {
	const id = ++counter;
	snapshot = [
		...snapshot.filter((item) => item.status === "generating" || item.id > counter - 8),
		{ id, label, text: "", status: "generating" },
	];
	publish();
	return id;
}
export function appendActivity(id: number, text: string) {
	snapshot = snapshot.map((item) =>
		item.id === id && item.status === "generating" ? { ...item, text: (item.text + text).slice(0, 100000) } : item,
	);
	publish();
}
export function finishActivity(id: number, status: Activity["status"], error?: string) {
	snapshot = snapshot.map((item) =>
		item.id === id && item.status === "generating" ? { ...item, status, error } : item,
	);
	publish();
}
