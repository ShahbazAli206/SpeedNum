import { proxyAuthAndSetCookies } from "@/lib/session-server";

export async function POST(request: Request) {
  return proxyAuthAndSetCookies("/auth/magic-login", await request.text());
}
