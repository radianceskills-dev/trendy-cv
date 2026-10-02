import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useEffect, useRef, useState } from "react";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function PdfPages({ blob }: { blob: Blob }) {
	const host = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState("Loading pages…");
	useEffect(() => {
		let cancelled = false;
		let task: ReturnType<typeof getDocument> | undefined;
		const container = host.current;
		container?.replaceChildren();
		setStatus("Loading pages…");
		async function render() {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			if (cancelled) return;
			task = getDocument({ data: bytes });
			const pdf = await task.promise;
			for (let n = 1; n <= pdf.numPages; n++) {
				if (cancelled) return;
				const page = await pdf.getPage(n);
				if (cancelled) return;
				const canvas = document.createElement("canvas");
				const viewport = page.getViewport({ scale: 1.5 });
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				canvas.setAttribute("aria-label", `CV page ${n}`);
				canvas.setAttribute("role", "img");
				await page.render({ canvas, viewport }).promise;
				const text = await page.getTextContent();
				if (cancelled) return;
				const wrapper = document.createElement("div");
				wrapper.className = "pdf-page";
				const accessible = document.createElement("details");
				const summary = document.createElement("summary");
				summary.textContent = `Page ${n} text`;
				const content = document.createElement("p");
				content.textContent = text.items.map((item) => ("str" in item ? item.str : "")).join(" ");
				accessible.append(summary, content);
				wrapper.append(canvas, accessible);
				container?.append(wrapper);
			}
			if (!cancelled) setStatus(`${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} · PDF preview`);
		}
		void render().catch((e) => {
			if (!cancelled) setStatus(`Preview failed: ${e.message}. You can still download the PDF.`);
		});
		return () => {
			cancelled = true;
			void task?.destroy();
		};
	}, [blob]);
	return (
		<div className="pdf-pages">
			<p role="status">{status}</p>
			<div ref={host} />
		</div>
	);
}
