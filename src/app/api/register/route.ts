import { NextResponse } from "next/server";
import dbConnect from "@/app/lib/mongodb";
import User from "@/app/models/user";

export async function POST(req: Request) {
  try {
    await dbConnect();

    const body = await req.json();
    const { name, email, phone, password, role, domain, reports_to } = body;

    if (!name || !email || !phone || !password || !role) {
      return NextResponse.json(
        { success: false, error: "Missing fields" },
        { status: 400 }
      );
    }

    // Map team_id
    let team_id = "";
    if (role.toLowerCase() === "vice president") team_id = "vp";
    else if (role.toLowerCase() === "team lead") team_id = "lead";
    else if (
      role.toLowerCase() === "teammate" ||
      role.toLowerCase() === "employee"
    ) {
      team_id = `team_${domain?.toLowerCase() || "general"}`;
    }

    const newUser = new User({
      name,
      email,
      phone_number: phone,
      password, // saved directly
      role,
      team_id,
      reports_to: reports_to || null,
    });

    await newUser.save();

    return NextResponse.json({ success: true, user: newUser });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
