export function Brand({
  small = false,
  href = "/app",
  target,
}: {
  small?: boolean;
  href?: string;
  target?: "_top";
}) {
  return (
    <a
      href={href}
      target={target}
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
