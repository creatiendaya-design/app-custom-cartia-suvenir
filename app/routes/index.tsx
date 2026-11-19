import { redirect, type LoaderFunctionArgs } from "react-router";
import { isLocalDemo } from "../lib/access.server";
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) return redirect(`/app${url.search}`);
  return redirect(isLocalDemo(request) ? "/app" : `/auth/login${url.search}`);
}
export default function Index() {
  return null;
}
