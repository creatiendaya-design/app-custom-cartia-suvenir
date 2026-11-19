import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopify } from "../lib/shopify.server";
export async function loader({ request }: LoaderFunctionArgs) {
  await getShopify().authenticate.admin(request);
  return null;
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
export default function Auth() {
  return null;
}
