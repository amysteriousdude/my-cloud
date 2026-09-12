import { json } from "@sveltejs/kit";
import telegramStorage from "$lib/telegramStorage";
import { purgeByMetaFileId } from '$lib/cfPurge';

export const PATCH = async ({ request }) => {
  const apiKey = request.headers.get("X-Api-Key");
  const metaFileId = request.headers.get("X-Meta-File-Id");
  const encodedNewName = request.headers.get("X-New-Name");

  if (!apiKey || !metaFileId || !encodedNewName) {
    return json({ success: false, error: "missing_headers" }, { status: 400 });
  }

  const newName = decodeURIComponent(encodedNewName);

  try {
    // Purge old URL BEFORE rename (fire-and-forget)
    purgeByMetaFileId(metaFileId).catch(() => {});

    const success = await telegramStorage.renameFile(metaFileId, newName);
    
    if (success) {
      return json({ success: true }, { status: 200 });
    } else {
      return json({ success: false, error: "file_not_found" }, { status: 404 });
    }
  } catch (err: any) {
    console.error("Rename Error:", err);
    return json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
};
