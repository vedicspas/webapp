import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

/** Drop cached public spa pages after a vendor changes treatments or listing details. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { slug?: unknown };
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (slug) revalidatePath(`/spas/${slug}`);
  revalidatePath("/");
  revalidatePath("/spas");
  return Response.json({ ok: true });
}
