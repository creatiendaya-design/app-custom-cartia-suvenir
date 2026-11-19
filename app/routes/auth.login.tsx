import {
  Form,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { getShopify } from "../lib/shopify.server";
export async function loader({ request }: LoaderFunctionArgs) {
  if (new URL(request.url).searchParams.has("shop"))
    return getShopify().login(request);
  return null;
}
export async function action({ request }: ActionFunctionArgs) {
  return getShopify().login(request);
}
export default function Login() {
  const result = useActionData<typeof action>();
  return (
    <main className="error-page">
      <div className="brand-mark">sm</div>
      <h1>Abre tu estudio en Shopify</h1>
      <p>Conecta la app con tu tienda para administrar productos y diseños.</p>
      <Form method="post">
        <label>
          Dominio de Shopify
          <input
            name="shop"
            defaultValue="souvenir-made-xbc1wrvr.myshopify.com"
            required
          />
        </label>
        <button className="primary">Conectar tienda</button>
      </Form>
      {result && (
        <p role="alert">Revisa el dominio y la configuración de la app.</p>
      )}
    </main>
  );
}
