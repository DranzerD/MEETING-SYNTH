import { NextResponse } from "next/server";
import dbConnect from "@/app/lib/mongodb";
import User from "@/app/models/user";
import { hashPassword } from "@/app/lib/password";
import { createSessionToken, setSessionCookie } from "@/app/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const role = typeof body?.role === "string" ? body.role : "";
    const domain = typeof body?.domain === "string" ? body.domain : "";

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { success: false, error: "Name, email, password, and role are required." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    await dbConnect();

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    let team_id = "";
    const normalizedRole = role.toLowerCase();
    if (normalizedRole === "vice president") team_id = "vp";
    else if (normalizedRole === "team lead") team_id = "lead";
    else if (normalizedRole === "teammate" || normalizedRole === "employee") {
      team_id = `team_${domain?.toLowerCase() || "general"}`;
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email,
      phone_number: phone,
      passwordHash,
      role,
      team_id,
    });

    const token = await createSessionToken({ sub: user.email, name: user.name, role: user.role });
    const response = NextResponse.json({
      success: true,
      user: { name: user.name, email: user.email, role: user.role },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err: unknown) {
    // Mongo's unique-index violation surfaces as a driver error, not a
    // validation error -- translate it to the same 409 the pre-check above
    // returns, in case of a race between two concurrent registrations.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000) {
      return NextResponse.json(
        { success: false, error: "An account with that email already exists." },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("/api/register error", message);
    return NextResponse.json(
      { success: false, error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
