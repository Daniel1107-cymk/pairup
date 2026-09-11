import { NextResponse, type NextRequest } from "next/server";
import { token } from "@/lib/auth";

export function proxy(req: NextRequest) {
  if (!process.env.PASSPHRASE) return NextResponse.next(); // ponytail: no PASSPHRASE = no gate (local dev)
  if (req.nextUrl.pathname === "/login" || req.cookies.get("pairup")?.value === token()) return NextResponse.next();
  return NextResponse.rewrite(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
