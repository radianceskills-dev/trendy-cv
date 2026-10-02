import { useEffect, useRef, useState } from "react";

type Props = { photo: Blob | null; onChange: (photo: Blob | null) => Promise<void> };
export function PhotoEditor({ photo, onChange }: Props) {
	const [source, setSource] = useState<HTMLImageElement | null>(null);
	const [preview, setPreview] = useState("");
	const [zoom, setZoom] = useState(1);
	const [x, setX] = useState(50);
	const [y, setY] = useState(50);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("");
	const canvas = useRef<HTMLCanvasElement>(null);
	const revision = useRef(0);
	useEffect(
		() => () => {
			revision.current++;
		},
		[],
	);
	useEffect(() => {
		if (!photo) {
			setPreview("");
			return;
		}
		const url = URL.createObjectURL(photo);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [photo]);
	useEffect(() => {
		const context = canvas.current?.getContext("2d");
		if (!source || !context) return;
		const side = Math.min(source.naturalWidth, source.naturalHeight) / zoom;
		context.fillStyle = "white";
		context.fillRect(0, 0, 600, 600);
		context.drawImage(
			source,
			((source.naturalWidth - side) * x) / 100,
			((source.naturalHeight - side) * y) / 100,
			side,
			side,
			0,
			0,
			600,
			600,
		);
	}, [source, zoom, x, y]);
	async function upload(file?: File) {
		if (!file) return;
		const id = ++revision.current;
		setError("");
		setStatus("");
		setBusy(true);
		let url = "";
		try {
			if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
				throw Error("Choose a JPEG, PNG or WebP image.");
			if (file.size > 10 * 1024 * 1024) throw Error("Photo must be 10 MB or smaller.");
			url = URL.createObjectURL(file);
			const image = new Image();
			image.src = url;
			await image.decode();
			if (id !== revision.current) return;
			if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24000000)
				throw Error("Photo must contain at most 24 million pixels.");
			setSource(image);
			setZoom(1);
			setX(50);
			setY(50);
		} catch (e) {
			if (id === revision.current) setError(e instanceof Error ? e.message : "Image could not be decoded.");
		} finally {
			if (url) URL.revokeObjectURL(url);
			if (id === revision.current) setBusy(false);
		}
	}
	async function save(remove = false) {
		setBusy(true);
		setError("");
		try {
			const blob = remove
				? null
				: await new Promise<Blob>((resolve, reject) => {
						if (!canvas.current) {
							reject(Error("Select a photo first."));
							return;
						}
						canvas.current.toBlob(
							(result) => (result ? resolve(result) : reject(Error("Could not crop photo."))),
							"image/jpeg",
							0.9,
						);
					});
			await onChange(blob);
			setSource(null);
			setStatus(remove ? "Photo removed from your draft." : "Photo saved locally.");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save photo.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<section style={{ marginTop: 24 }}>
			<h2>Optional profile photo</h2>
			<p>
				JPEG, PNG or WebP · up to 10 MB and 24 megapixels. Crop to a square; templates can apply their own frame. Saved
				as a 600 × 600 JPEG in this browser. Never sent to AI.
			</p>
			{error && <p role="alert">{error}</p>}
			<p role="status">{status}</p>
			{preview && (
				<img
					src={preview}
					alt="Saved CV portrait"
					width={150}
					height={150}
					style={{ objectFit: "cover", borderRadius: 8 }}
				/>
			)}
			<label>
				Upload or replace photo
				<input
					aria-label="Upload or replace photo"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					disabled={busy}
					onChange={(e) => {
						void upload(e.target.files?.[0]);
						e.target.value = "";
					}}
				/>
			</label>
			{source && (
				<div>
					<canvas
						ref={canvas}
						width={600}
						height={600}
						aria-label="Photo crop preview"
						role="img"
						style={{ width: "min(100%, 300px)", height: "auto" }}
					/>
					{(
						[
							["Zoom", zoom, setZoom, 1, 3, 0.05],
							["Horizontal position", x, setX, 0, 100, 1],
							["Vertical position", y, setY, 0, 100, 1],
						] as const
					).map(([label, value, setter, min, max, step]) => (
						<label key={label}>
							{label}
							<input
								aria-label={label}
								disabled={busy}
								type="range"
								min={min}
								max={max}
								step={step}
								value={value}
								onChange={(e) => setter(Number(e.target.value))}
							/>
						</label>
					))}
					<button type="button" disabled={busy} onClick={() => save()}>
						Save cropped photo
					</button>
					<button type="button" disabled={busy} onClick={() => setSource(null)}>
						Cancel photo edit
					</button>
				</div>
			)}
			{photo && (
				<button type="button" disabled={busy} onClick={() => save(true)}>
					Remove photo
				</button>
			)}
			{!photo && !source && <p>No photo selected. Your CV will use a no-photo template variant.</p>}
		</section>
	);
}
