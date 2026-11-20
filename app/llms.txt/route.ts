import { NextResponse } from "next/server";
import { PRODUCT_REFERENCE_SHORT } from "@/lib/product-reference";

// Existing optional reference, not a search-engine ranking requirement.
export const dynamic = "force-static";
export const revalidate = 86400;

export function GET() {
  return new NextResponse(PRODUCT_REFERENCE_SHORT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
