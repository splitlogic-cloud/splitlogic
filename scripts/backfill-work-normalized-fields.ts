import { config } from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeArtist,
  normalizeIsrc,
  normalizeText,
  buildNormalizedTitleArtist,
} from "../src/features/matching/normalize";

config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL exists:", !!supabaseUrl);
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY exists:",
    !!supabaseServiceRoleKey
  );
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

type WorkRow = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
};

async function main() {
  const { data: works, error } = await supabase
    .from("works")
    .select("id, title, artist, isrc")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load works: ${error.message}`);
  }

  const rows = (works ?? []) as WorkRow[];

  console.log(`Loaded ${rows.length} works`);

  for (const work of rows) {
    const normalized_title = normalizeText(work.title);
    const normalized_artist = normalizeArtist(work.artist);
    const normalized_isrc = normalizeIsrc(work.isrc);
    const normalized_title_artist = buildNormalizedTitleArtist(
      work.title,
      work.artist
    );

    const { error: updateError } = await supabase
      .from("works")
      .update({
        normalized_title,
        normalized_artist,
        normalized_isrc,
        normalized_title_artist,
      })
      .eq("id", work.id);

    if (updateError) {
      throw new Error(
        `Failed to update work ${work.id}: ${updateError.message}`
      );
    }
  }

  console.log("Done backfilling normalized work fields");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});