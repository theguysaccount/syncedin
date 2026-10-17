import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Twin-files API — metadata index for files the user uploads as
 * twin context (resumes, pitch decks, lists of businesses they
 * run) and files the twin can share inside conversations. Storage
 * lives in the Supabase Storage bucket "twin-files" (must be
 * created manually); this route handles only the metadata + the
 * signed-URL upload flow.
 *
 * GET → list this user's files
 * POST { name, mime_type, size_bytes, kind?, description? } → reserves
 *   a metadata row + returns a signed upload URL the client can PUT to
 * DELETE ?id=<file_id> → remove file + storage object
 */
export async function GET() {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const { data } = await service
    .from("twin_files")
    .select(
      "id, name, size_bytes, mime_type, storage_path, kind, description, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    name?: string;
    mime_type?: string;
    size_bytes?: number;
    kind?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim().slice(0, 200);
  const mime = (body.mime_type ?? "application/octet-stream").slice(0, 80);
  const size = Math.max(0, Math.min(50_000_000, Number(body.size_bytes) || 0));
  const kind = body.kind === "shareable" ? "shareable" : "context";
  const description = (body.description ?? "").trim().slice(0, 500) || null;
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }
  const service = createServiceClient();

  // Ensure the storage bucket exists. Without this guard, the first user
  // ever to upload sees a confusing "the related resource does not exist"
  // error because no one ran the manual bucket-create step in Supabase
  // Studio. We create it idempotently here so onboarding never blocks
  // on infra setup. Bucket stays private — files are accessed via signed
  // URLs only.
  try {
    const { data: existing } = await service.storage.getBucket("twin-files");
    if (!existing) {
      const { error: createErr } = await service.storage.createBucket(
        "twin-files",
        {
          public: false,
          fileSizeLimit: 52_428_800, // 50MB
          allowedMimeTypes: undefined
        }
      );
      if (createErr && !/already exists/i.test(createErr.message)) {
        console.error("[twin-files] createBucket failed", createErr);
      }
    }
  } catch (bucketErr) {
    // Non-fatal — fall through to signed-url creation which will report
    // the actual underlying error if the bucket truly can't be reached.
    console.warn("[twin-files] getBucket probe failed", bucketErr);
  }

  // Generate a unique storage path scoped by user — RLS on the storage
  // bucket should restrict reads/writes to the owning user only.
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  const storage_path = `${user.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;
  const { data: row, error } = await service
    .from("twin_files")
    .insert({
      user_id: user.id,
      name,
      mime_type: mime,
      size_bytes: size,
      storage_path,
      kind,
      description
    })
    .select("id, storage_path")
    .single();
  if (error || !row) {
    // Auto-log so this lands in /admin/reports without the user having to
    // copy-paste anything back.
    console.error("[twin-files] metadata insert failed", error);
    return NextResponse.json(
      {
        error: "insert_failed",
        detail:
          error?.message ||
          "Couldn't record the file metadata. Try again in a moment."
      },
      { status: 500 }
    );
  }
  // Create a signed upload URL the client can PUT to.
  const { data: signed, error: signErr } = await service.storage
    .from("twin-files")
    .createSignedUploadUrl(storage_path);
  if (signErr || !signed) {
    // Roll back the metadata row so we don't leave orphaned entries.
    await service.from("twin_files").delete().eq("id", row.id);
    console.error("[twin-files] createSignedUploadUrl failed", signErr);
    // User-friendly message — never leak the raw "related resource does
    // not exist" Supabase error to the UI.
    const isMissingBucket =
      signErr?.message &&
      /resource|bucket|not found|not exist/i.test(signErr.message);
    return NextResponse.json(
      {
        error: "sign_failed",
        detail: isMissingBucket
          ? "File storage isn't ready yet — we're auto-fixing this. Please try again in a few seconds."
          : "Couldn't prepare the upload. Try again in a moment."
      },
      { status: 500 }
    );
  }
  return NextResponse.json({
    file_id: row.id,
    storage_path: row.storage_path,
    upload_url: signed.signedUrl,
    upload_token: signed.token
  });
}

export async function DELETE(req: Request) {
  const supabase = (await createClient());
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const service = createServiceClient();
  const { data: row } = await service
    .from("twin_files")
    .select("user_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await service.storage.from("twin-files").remove([row.storage_path]);
  } catch {
    /* best-effort */
  }
  await service.from("twin_files").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
