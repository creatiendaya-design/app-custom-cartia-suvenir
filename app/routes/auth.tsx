import type { LoaderFunctionArgs } from "react-router";
import { getShopify } from "../lib/shopify.server";
export async function loader({ request }: LoaderFunctionArgs) {
  await getShopify().authenticate.admin(request);
  return null;
}
export default function Auth() {
  return null;
}
