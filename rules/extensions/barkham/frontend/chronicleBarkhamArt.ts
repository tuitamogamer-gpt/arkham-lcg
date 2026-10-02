import art from "./art.json";

export function chronicleBarkhamImage(path: string): string | null {
  const match = path.match(
    /^(?:homebrew\/barkham\/cards\/|portraits\/:barkham:)(\d{3})(b)?\.(?:avif|jpg)$/,
  );
  if (!match) return null;
  const key = `${match[1]}${match[2] || ""}`;
  const images: Record<string, string> = art;
  return images[key] || `/chronicle/barkham/card/${key}.svg`;
}
