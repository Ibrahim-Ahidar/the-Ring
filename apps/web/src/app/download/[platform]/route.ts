import { NextResponse } from "next/server";

import { pickDownload, type Release } from "./pick";

const RELEASES_API = "https://api.github.com/repos/Ibrahim-Ahidar/the-Ring/releases?per_page=30";

/** Sends the browser straight to the newest installer file, so the download starts on the page. */
export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;

  let releases: Release[] = [];
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 600 },
    });
    if (response.ok) releases = (await response.json()) as Release[];
  } catch {
    // Falls through to "not available" below.
  }

  const url = pickDownload(releases, platform);
  if (!url) {
    return new NextResponse("This download is not available yet.", { status: 404 });
  }
  return NextResponse.redirect(url, 302);
}
