const xml = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const plain = (value = "") =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\[([^\]]+)\]/g, (_, icon) => `[${icon.replaceAll("_", " ")}]`);
function wrap(value, width) {
  return plain(value)
    .split("\n")
    .flatMap((paragraph) => {
      const lines = [];
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (line && line.length + word.length + 1 > width) {
          lines.push(line);
          line = "";
        }
        line += `${line ? " " : ""}${word}`;
      }
      lines.push(line);
      return lines;
    });
}

/** A readable text face where a scan is unavailable; never reveals a location. */
export function barkhamCardFace(card, back = false) {
  const landscape = ["act", "agenda", "investigator"].includes(card.type_code);
  const width = landscape ? 1000 : 713;
  const height = landscape ? 713 : 1000;
  const unrevealed = back && card.type_code === "location";
  const title = back ? card.back_name || card.name : card.name;
  const body = unrevealed
    ? "Unrevealed location"
    : back
      ? card.back_text || ""
      : card.text || "";
  const stats =
    unrevealed || back
      ? []
      : [
          card.cost !== undefined && card.cost !== null
            ? `Cost ${card.cost}`
            : "",
          card.shroud !== undefined ? `Shroud ${card.shroud}` : "",
          card.clues !== undefined && card.clues !== null
            ? `Clues ${card.clues}${card.clues_per_investigator ? " / investigator" : ""}`
            : "",
          card.enemy_fight !== undefined ? `Fight ${card.enemy_fight}` : "",
          card.enemy_evade !== undefined ? `Evade ${card.enemy_evade}` : "",
          card.health !== undefined
            ? `Health ${card.health}${card.health_per_investigator ? " / investigator" : ""}`
            : "",
          card.sanity !== undefined ? `Sanity ${card.sanity}` : "",
          card.doom !== undefined ? `Doom ${card.doom}` : "",
        ].filter(Boolean);
  const lines = wrap(body, landscape ? 85 : 55);
  const fontSize = Math.min(
    landscape ? 21 : 23,
    Math.max(landscape ? 13 : 16, (landscape ? 415 : 650) / Math.max(lines.length, 1) - 6),
  );
  const heading = wrap(title, landscape ? 44 : 30);
  const headingEnd = 93 + heading.length * 43;
  const statsLines = wrap(stats.join(" · "), landscape ? 90 : 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(title)}${unrevealed ? " — unrevealed" : ""}">
<rect width="${width}" height="${height}" rx="32" fill="#171b20"/><rect x="19" y="19" width="${width - 38}" height="${height - 38}" rx="24" fill="#eee4ce" stroke="#73634a" stroke-width="4"/>
<text x="44" y="63" fill="#655442" font-family="Georgia,serif" font-size="19">${xml(card.type_code.toUpperCase())}${unrevealed ? " · UNREVEALED" : back ? " · REVERSE" : ""}</text>
<text x="44" y="110" fill="#252728" font-family="Georgia,serif" font-size="35" font-weight="bold">${heading.map((line, i) => `<tspan x="44" dy="${i ? 43 : 0}">${xml(line)}</tspan>`).join("")}</text>
<text x="44" y="${headingEnd + 15}" fill="#655442" font-family="Georgia,serif" font-size="20" font-style="italic">${xml(unrevealed ? "Barkham." : card.traits || "")}</text>
<text x="44" y="${headingEnd + 58}" fill="#252728" font-family="Georgia,serif" font-size="19">${statsLines.map((line, i) => `<tspan x="44" dy="${i ? 26 : 0}">${xml(line)}</tspan>`).join("")}</text>
<path d="M44 ${headingEnd + 85 + statsLines.length * 26} H${width - 44}" stroke="#998b70"/>
<text x="44" y="${headingEnd + 125 + statsLines.length * 26}" fill="#252728" font-family="Georgia,serif" font-size="${fontSize}">${lines.map((line, i) => `<tspan x="44" dy="${i ? fontSize + 6 : 0}">${xml(line)}</tspan>`).join("")}</text>
<text x="44" y="${height - 63}" fill="#655442" font-family="Georgia,serif" font-size="17">Text reference · Barkham Horror · ${xml(card.code)}</text>
<text x="44" y="${height - 40}" fill="#655442" font-family="Georgia,serif" font-size="13">Card content © Fantasy Flight Games · Illustration unavailable</text></svg>`;
}
