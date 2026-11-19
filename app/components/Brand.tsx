export function Brand({
  small = false,
  href = "/app",
}: {
  small?: boolean;
  href?: string;
}) {
  return (
    <a
      href={href}
      className={`brand ${small ? "small" : ""}`}
      aria-label="Souvenir Made, inicio"
    >
      <span className="brand-mark">
        sm<span>.</span>
      </span>
      <span>
        <strong>Souvenir Made</strong>
        <small>Estudio de personalización</small>
      </span>
    </a>
  );
}
