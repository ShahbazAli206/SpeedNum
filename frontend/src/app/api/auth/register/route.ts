import { proxyAuthAndSetCookies } from "@/lib/session-server";

export async function POST(request: Request) {
  return proxyAuthAndSetCookies("/auth/register", await request.text());
}
