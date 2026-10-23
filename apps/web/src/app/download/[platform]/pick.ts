export type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
};

const PLATFORMS: Record<string, { tagPrefix: string; extension: string }> = {
  desktop: { tagPrefix: "desktop-v", extension: ".exe" },
  mac: { tagPrefix: "desktop-v", extension: ".dmg" },
  android: { tagPrefix: "mobile-v", extension: ".apk" },
};

/** The file URL of the newest published build for a platform; GitHub lists releases newest first. */
export function pickDownload(releases: Release[], platform: string): string | null {
  const target = PLATFORMS[platform];
  if (!target) return null;

  for (const release of releases) {
    if (release.draft || release.prerelease || !release.tag_name.startsWith(target.tagPrefix)) continue;
    const asset = release.assets.find((a) => a.name.toLowerCase().endsWith(target.extension));
    if (asset) return asset.browser_download_url;
  }
  return null;
}
