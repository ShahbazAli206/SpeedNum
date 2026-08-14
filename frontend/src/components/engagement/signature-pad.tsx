"use client";

/**
 * Signature capture: type / draw / upload, always normalised to a PNG data
 * URL (`canvas.toDataURL("image/png")`) — the exact contract the backend
 * validates on both `POST /engagements/{id}/sign` (firm) and
 * `POST /portal/{token}/sign` (client). One component, used on both sides.
 */

import { Check, Pencil, RotateCcw, Type as TypeIcon, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Tab, Tabs } from "@/components/ui";

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 160;

const SCRIPT_FONTS = [
  { label: "Script", family: '"Segoe Script", "Bradley Hand", cursive' },
  { label: "Elegant", family: '"Lucida Handwriting", "Snell Roundhand", cursive' },
  { label: "Classic", family: '"Brush Script MT", cursive' },
];

function blankCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  return canvas;
}

type Mode = "type" | "draw" | "upload";

export function SignaturePad({
  value,
  onChange,
  label = "Signature",
}: {
  value: string | null;
  onChange: (dataUrl: string) => void;
  label?: string;
}) {
  const [editing, setEditing] = useState(!value);
  const [mode, setMode] = useState<Mode>("type");

  if (!editing && value) {
    return (
      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-success">
            <Check className="size-3.5" /> {label} captured
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[12.5px] font-medium text-brand hover:underline"
          >
            Change
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt={label}
          className="mt-2 h-16 max-w-full rounded border border-line bg-white object-contain object-left"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <Tabs value={mode} onChange={(next) => setMode(next as Mode)} className="px-2">
        <Tab id="type">
          <TypeIcon className="size-3.5" /> Type
        </Tab>
        <Tab id="draw">
          <Pencil className="size-3.5" /> Draw
        </Tab>
        <Tab id="upload">
          <Upload className="size-3.5" /> Upload PNG
        </Tab>
      </Tabs>

      <div className="p-3">
        {mode === "type" ? (
          <TypeSignature
            onConfirm={(dataUrl) => {
              onChange(dataUrl);
              setEditing(false);
            }}
          />
        ) : null}
        {mode === "draw" ? (
          <DrawSignature
            onConfirm={(dataUrl) => {
              onChange(dataUrl);
              setEditing(false);
            }}
          />
        ) : null}
        {mode === "upload" ? (
          <UploadSignature
            onConfirm={(dataUrl) => {
              onChange(dataUrl);
              setEditing(false);
            }}
          />
        ) : null}

        {value ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-2 text-[12.5px] font-medium text-muted hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TypeSignature({ onConfirm }: { onConfirm: (dataUrl: string) => void }) {
  const [text, setText] = useState("");
  const [fontIndex, setFontIndex] = useState(0);
  const font = SCRIPT_FONTS[fontIndex];

  const confirm = () => {
    if (!text.trim()) return;
    const canvas = blankCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `48px ${font.family}`;
    ctx.fillText(text.trim(), canvas.width / 2, canvas.height / 2, canvas.width - 32);
    onConfirm(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type your full name"
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
      />
      <div
        className="flex h-24 items-center justify-center rounded-lg border border-line bg-white px-4"
        style={{ fontFamily: font.family, fontSize: "28px", color: "#0f172a" }}
      >
        {text.trim() || <span className="text-[13px] text-muted">Preview</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SCRIPT_FONTS.map((option, index) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setFontIndex(index)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[12.5px] transition",
              index === fontIndex
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-muted hover:bg-surface-2",
            )}
            style={{ fontFamily: option.family }}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!text.trim()}
          onClick={confirm}
          className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use this signature
        </button>
      </div>
    </div>
  );
}

function DrawSignature({ onConfirm }: { onConfirm: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const posFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastRef.current = posFromEvent(event);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastRef.current) return;
    const point = posFromEvent(event);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastRef.current = point;
    setHasInk(true);
  };

  const end = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onConfirm(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-lg border border-line bg-white"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <RotateCcw className="size-3.5" /> Clear
        </button>
        <button
          type="button"
          disabled={!hasInk}
          onClick={confirm}
          className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use this signature
        </button>
      </div>
    </div>
  );
}

function UploadSignature({ onConfirm }: { onConfirm: (dataUrl: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = blankCanvas();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1) * 0.9;
        const width = img.width * scale;
        const height = img.height * scale;
        ctx.drawImage(
          img,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height,
        );
        setPreview(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-line-strong bg-white">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Signature preview" className="h-full max-w-full object-contain" />
        ) : (
          <p className="text-[13px] text-muted">No file selected</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <Upload className="size-3.5" /> Choose PNG / JPG
        </button>
        <button
          type="button"
          disabled={!preview}
          onClick={() => preview && onConfirm(preview)}
          className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use this signature
        </button>
      </div>
    </div>
  );
}
