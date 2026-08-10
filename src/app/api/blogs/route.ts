import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { createBlog, listBlogs } from "@/modules/blogs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ blogs: await listBlogs() });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const blog = await createBlog(await request.json());
    return NextResponse.json({ blog }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
