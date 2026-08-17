import { proxyAuthAndSetCookies } from "@/lib/session-server";

export async function POST(request: Request) {
  return proxyAuthAndSetCookies("/auth/oauth/google/callback", await request.text());
}
