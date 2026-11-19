import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import "./styles.css";

export const meta = () => [
  { title: "Souvenir Made | Estudio de personalización" },
  {
    name: "description",
    content: "Crea, revisa y prepara tus productos personalizados.",
  },
];
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  return <Outlet />;
}
export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? String(error.data || error.statusText)
    : "No se pudo completar la operación. Vuelve a intentarlo.";
  return (
    <main className="error-page">
      <div className="brand-mark">sm</div>
      <h1>No pudimos abrir esta página</h1>
      <p role="alert">{message}</p>
      <a className="button primary" href="/app">
        Volver al estudio
      </a>
    </main>
  );
}
