import { NextResponse } from "next/server";
import dbConnect from "@/app/lib/mongodb";
import User from "@/app/models/user";
import { spendPasswordCheckTime, verifyPassword } from "@/app/lib/password";
import { badRequest, readJsonBody } from "@/app/lib/http";
import { createSessionToken, setSessionCookie } from "@/app/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req) as Record<string, unknown> | undefined | null;
    if (body === undefined || body === null || typeof body !== "object") {
      return badRequest("Request body must be a JSON object.");
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    await dbConnect();
    const user = await User.findOne({ email });

    // Same error for "no such user" and "wrong password" -- distinguishing
    // them lets an attacker enumerate registered emails.
    const invalid = () =>
      NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });

    if (!user) {
      await spendPasswordCheckTime(password);
      return invalid();
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return invalid();

    const token = await createSessionToken({ sub: user.email, name: user.name, role: user.role });
    const response = NextResponse.json({
      success: true,
      user: { name: user.name, email: user.email, role: user.role },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err: unknown) {
    console.error("/api/login error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
