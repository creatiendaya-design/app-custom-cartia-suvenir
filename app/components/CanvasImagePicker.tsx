import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, RotateCcw } from "lucide-react";
import type { Product } from "../lib/domain";

export function CanvasImagePicker({
  value,
  disabled,
  onChange,
  onBusyChange,
}: {
  value: Product["canvas"];
  disabled: boolean;
  onChange: (canvas: Product["canvas"]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8000000
    ) {
      setError("Elige una imagen PNG, JPG o WebP de hasta 8 MB.");
      if (input.current) input.current.value = "";
      return;
    }
    setUploading(true);
    onBusyChange(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/canvas-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, name: file.name.slice(0, 120) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.canvas)
        throw new Error(
          result.error || "No se pudo subir la imagen. Vuelve a intentarlo.",
        );
      if (mounted.current) onChange(result.canvas);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "No se pudo subir la imagen.",
        );
    } finally {
      if (mounted.current) {
        setUploading(false);
        onBusyChange(false);
        if (input.current) input.current.value = "";
      }
    }
  }

  return (
    <div
      className="canvas-image-picker"
      aria-label="Imagen base del lienzo"
      aria-busy={uploading}
    >
      <strong>Imagen del lienzo</strong>
      <span>
        Usa una foto de tu producto como base para la personalización.
      </span>
      <input
        ref={input}
        type="file"
        aria-label="Imagen del lienzo"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <button
        type="button"
        className="secondary full"
        disabled={disabled || uploading}
        onClick={() => input.current?.click()}
      >
        {uploading ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <ImagePlus size={17} />
        )}
        {uploading
          ? "Subiendo imagen…"
          : value
            ? "Cambiar imagen del lienzo"
            : "Subir imagen del lienzo"}
      </button>
      {value && (
        <>
          <small className="canvas-image-name">{value.name}</small>
          <label>
            Ajuste de la imagen
            <select
              value={value.fit}
              disabled={disabled || uploading}
              onChange={(event) =>
                onChange({
                  ...value,
                  fit: event.target.value as "contain" | "cover",
                })
              }
            >
              <option value="contain">Encajar imagen completa</option>
              <option value="cover">Cubrir todo el lienzo</option>
            </select>
          </label>
          <button
            type="button"
            className="quiet compact"
            disabled={disabled || uploading}
            onClick={() => {
              setError("");
              onChange(null);
            }}
          >
            <RotateCcw size={15} />
            Restaurar imagen de plantilla
          </button>
        </>
      )}
      <small>
        PNG, JPG o WebP · hasta 8 MB. Ajusta el área sobre la imagen y confirma
        sus medidas reales antes de guardar.
      </small>
      {error && (
        <p className="canvas-image-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
