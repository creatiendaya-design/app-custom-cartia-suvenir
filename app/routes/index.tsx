import { redirect, type LoaderFunctionArgs } from "react-router";
import { isLocalDemo } from "../lib/access.server";
export function loader({ request }: LoaderFunctionArgs) {
  return redirect(
    isLocalDemo(request) ? "/app" : `/auth/login${new URL(request.url).search}`,
  );
}
export default function Index() {
  return null;
}
