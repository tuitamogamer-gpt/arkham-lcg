// Acceptance evidence for optional external card art only. Native/UI failures
// remain failures; no request, response, game or product DOM is changed here.
import { reverseCardPrinting } from "./card-artwork.mjs";
const normalized = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const canonical = (value) =>
  typeof value === "string" ? value.replace(/^c(?=[:\d])/, "") : "";
const values = (value) =>
  Array.isArray(value)
    ? value.map((entry) => (Array.isArray(entry) ? entry[1] : entry))
    : Object.values(value || {});

export function externalCardImage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    return null;
  const pattern =
    parsed.origin === "https://arkhamdb.com"
      ? /^\/bundles\/cards\/(\d{5}[a-z]?)\.(?:png|jpg)$/
      : parsed.origin === "https://assets.arkhamhorror.app"
        ? /^\/img\/arkham\/cards\/(\d{5}[a-z]?)\.avif$/
        : null;
  const match = pattern?.exec(parsed.pathname);
  return match ? { code: match[1], url: parsed.href } : null;
}

export async function installEpicArtworkCapture(page) {
  await page.addInitScript(() => {
    const evidence = { documentNonce: crypto.randomUUID(), imageErrors: [] };
    Object.defineProperty(window, "__chronicleEpicArtworkProof", {
      value: evidence,
      configurable: false,
    });
    document.addEventListener(
      "error",
      (event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        const portrait = image.closest(
            ".companion-portrait[data-visible-face='portrait']",
          ),
          face = image.closest("button.card-face"),
          figure = face?.closest("figure.companion-card"),
          caption =
            portrait
              ?.closest("button.seat")
              ?.querySelector(".seat-copy strong") ||
            figure?.querySelector(":scope > figcaption");
        // Capture before React removes/replaces the failed image. Non-card
        // occurrences, including a portrait sharing this URL, are retained.
        evidence.imageErrors.push({
          url: image.currentSrc || image.src,
          alt: image.alt,
          kind: portrait
            ? "portrait"
            : face?.getAttribute("data-visible-face") || "front",
          code:
            portrait?.getAttribute("data-preview-code") ||
            face?.getAttribute("data-preview-code") ||
            "",
          entityId:
            portrait?.getAttribute("data-investigator-id") ||
            figure?.getAttribute("data-entity-id") ||
            "",
          cardId: figure?.getAttribute("data-card-id") || "",
          caption: caption?.textContent || "",
          label:
            portrait?.getAttribute("data-visible-label") ||
            face?.getAttribute("data-visible-label") ||
            "",
          source: face?.getAttribute("data-art-source") || "",
          front:
            !!figure &&
            !face?.classList.contains("companion-reverse") &&
            face?.getAttribute("data-preview-face") !== "back",
        });
      },
      true,
    );
  });
}

export function classifyEpicArtworkEvidence({
  errors,
  resourceFailures,
  gameId,
  engine,
  documentId,
  expectedNames,
  snapshot,
  nativeSnapshot,
  cardDefinitions = [],
}) {
  const scoped = (entry) =>
    entry.gameId === gameId &&
    entry.documentId === documentId &&
    (engine === undefined || entry.engine === engine);
  const evidence = [],
    classifiedErrorIndexes = [],
    classifiedFailureIndexes = [];
  if (!snapshot?.documentNonce)
    return {
      documentId,
      documentNonce: null,
      evidence,
      classifiedErrorIndexes,
      classifiedFailureIndexes,
    };
  for (let errorIndex = 0; errorIndex < errors.length; errorIndex++) {
    const error = errors[errorIndex],
      url = error.location?.url,
      printing = externalCardImage(url);
    if (
      !scoped(error) ||
      error.kind !== "console" ||
      !printing ||
      !/^Failed to load resource: the server responded with a status of 503(?: \((?:Service Unavailable)?\))?$/.test(
        error.message,
      )
    )
      continue;
    const matches = resourceFailures.flatMap((failure, index) =>
      scoped(failure) &&
      failure.url === url &&
      failure.status === 503 &&
      failure.resourceType === "image"
        ? [index]
        : [],
    );
    if (!matches.length) continue;
    const occurrences = snapshot.imageErrors.filter(
        (image) => image.url === url,
      ),
      witnesses = [];
    if (!occurrences.length) continue;
    for (const image of occurrences) {
      if (
        image.kind === "portrait" ||
        image.kind === "unrevealed" ||
        image.kind === "reverse"
      ) {
        const recovered = boundSpecialFace(
          image,
          printing,
          snapshot,
          nativeSnapshot,
          cardDefinitions,
          gameId,
        );
        if (!recovered) break;
        witnesses.push(recovered);
        continue;
      }
      const expectedName = normalized(expectedNames[printing.code]);
      if (
        !expectedName ||
        !image.entityId ||
        !image.front ||
        image.code !== printing.code ||
        normalized(image.caption) !== expectedName ||
        image.alt !== `${expectedName} card`
      )
        break;
      const face = snapshot.faces.find(
        (current) =>
          current.code === image.code &&
          current.entityId === image.entityId &&
          current.cardId === image.cardId &&
          current.front &&
          current.figureVisible &&
          current.captionVisible &&
          normalized(current.caption) === expectedName,
      );
      if (!face) break;
      const text =
        face.headingVisible &&
        face.textVisible &&
        normalized(face.heading) === expectedName;
      const alternate = face.images.find(
        (candidate) =>
          candidate.complete &&
          candidate.naturalWidth > 0 &&
          candidate.visible &&
          candidate.url ===
            `https://assets.arkhamhorror.app/img/arkham/cards/${printing.code}.avif` &&
          candidate.url !== url &&
          candidate.alt === `${expectedName} card`,
      );
      if (!text && !alternate) break;
      witnesses.push({
        cardCode: image.code,
        expectedName,
        entityId: image.entityId,
        cardId: image.cardId,
        originalImage: { url: image.url, alt: image.alt, front: image.front },
        fallback: text
          ? {
              kind: "readable-card-face",
              heading: face.heading,
              caption: face.caption,
              bounds: face.bounds,
            }
          : {
              kind: "decoded-alternate-scan",
              ...alternate,
              caption: face.caption,
              bounds: face.bounds,
            },
      });
    }
    if (witnesses.length !== occurrences.length) continue;
    classifiedErrorIndexes.push(errorIndex);
    for (const index of matches)
      if (!classifiedFailureIndexes.includes(index))
        classifiedFailureIndexes.push(index);
    evidence.push({
      gameId,
      engine,
      documentId,
      documentNonce: snapshot.documentNonce,
      errorIndex,
      resourceFailureIndexes: matches,
      url,
      status: 503,
      resourceType: "image",
      occurrences: witnesses,
    });
  }
  return {
    documentId,
    documentNonce: snapshot.documentNonce,
    evidence,
    classifiedErrorIndexes,
    classifiedFailureIndexes,
  };
}

function boundSpecialFace(
  image,
  printing,
  snapshot,
  nativeSnapshot,
  definitions,
  gameId,
) {
  const game = nativeSnapshot?.game || nativeSnapshot;
  if (!game || game.id !== gameId || !image.entityId) return null;
  const groups =
    image.kind === "portrait"
      ? ["investigators"]
      : image.kind === "unrevealed"
        ? ["locations"]
        : ["locations", "acts", "agendas", "stories", "assets", "enemies"];
  const entity = groups
    .flatMap((group) => values(game[group]))
    .find((candidate) => candidate.id === image.entityId);
  if (
    !entity ||
    (image.kind !== "portrait" && (entity.cardId || "") !== image.cardId)
  )
    return null;
  const entityCode = canonical(entity.cardCode || entity.art || entity.id),
    definition = definitions.find(
      (entry) => canonical(entry.cardCode) === entityCode,
    );
  if (!definition) return null;
  const printedCode = canonical(definition.art),
    name = normalized(definition.name?.title);
  const decoded = (face, code, alt) =>
    (face.images || []).find(
      (candidate) =>
        candidate.complete &&
        candidate.naturalWidth > 0 &&
        candidate.visible &&
        candidate.alt === alt &&
        candidate.url ===
          `https://assets.arkhamhorror.app/img/arkham/cards/${code}.avif` &&
        candidate.url !== image.url,
    );
  if (image.kind === "portrait") {
    if (
      definition.cardType !== "InvestigatorType" ||
      image.code !== entityCode ||
      printing.code !== printedCode ||
      !name ||
      normalized(image.label) !== name ||
      normalized(image.caption) !== name ||
      image.alt !== `${name} portrait`
    )
      return null;
    const current = (snapshot.portraits || []).find(
      (entry) =>
        entry.entityId === image.entityId &&
        entry.code === entityCode &&
        entry.visible &&
        entry.captionVisible &&
        normalized(entry.caption) === name &&
        normalized(entry.label) === name,
    );
    if (!current) return null;
    const alternate = decoded(current, printedCode, `${name} portrait`),
      initials = name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join(""),
      text =
        current.fallbackVisible &&
        current.fallbackLabel === `${name}, portrait unavailable` &&
        normalized(current.initials) === initials;
    if (!text && !alternate) return null;
    return {
      cardCode: entityCode,
      expectedName: name,
      entityId: image.entityId,
      cardId: "",
      visibleFace: "portrait",
      originalImage: { url: image.url, alt: image.alt },
      fallback: text
        ? {
            kind: "accessible-portrait-name",
            label: current.fallbackLabel,
            initials: current.initials,
            caption: current.caption,
            bounds: current.bounds,
          }
        : {
            kind: "decoded-portrait-alternate",
            ...alternate,
            caption: current.caption,
            bounds: current.bounds,
          },
    };
  }
  if (
    !definition.doubleSided ||
    printing.code !== reverseCardPrinting(printedCode, definition.cardType) ||
    image.source !== image.url
  )
    return null;
  const label =
    image.kind === "unrevealed"
      ? "Unrevealed location"
      : normalized(definition.revealedName?.title);
  const nativeBack =
    image.kind === "unrevealed"
      ? definition.cardType === "LocationType" && entity.revealed === false
      : entity.flipped === true ||
        entity.isFlipped === true ||
        entity.sequence?.[1] === "B" ||
        entity.sequence?.agendaSequenceSide === "B";
  if (
    !nativeBack ||
    !label ||
    normalized(image.label) !== label ||
    normalized(image.caption) !== label ||
    image.alt !==
      (image.kind === "unrevealed" ? label : `${name}, reverse face`)
  )
    return null;
  const current = snapshot.faces.find(
    (entry) =>
      entry.kind === image.kind &&
      entry.entityId === image.entityId &&
      entry.cardId === image.cardId &&
      entry.source === image.source &&
      entry.figureVisible &&
      entry.captionVisible &&
      normalized(entry.caption) === label &&
      normalized(entry.label) === label,
  );
  if (!current) return null;
  const text =
      current.reverseFallbackVisible &&
      normalized(current.reverseFallback) === label,
    alternate = decoded(current, printing.code, image.alt);
  if (!text && !alternate) return null;
  return {
    entityId: image.entityId,
    cardId: image.cardId,
    visibleFace: image.kind,
    originalImage: { url: image.url, alt: image.alt },
    fallback: text
      ? {
          kind: "readable-reverse-face",
          label,
          caption: current.caption,
          bounds: current.bounds,
        }
      : {
          kind: "decoded-reverse-alternate",
          ...alternate,
          caption: current.caption,
          bounds: current.bounds,
        },
  };
}

// A later captured image occurrence can invalidate a previous witness without
// another HTTP/console event. Replace this document's accepted indexes, while
// retaining the fully attested documents that have already been closed.
export function replaceEpicArtworkIndexes({
  errors,
  resourceFailures,
  gameId,
  engine,
  documentId,
  classifiedErrors,
  classifiedFailures,
  result,
}) {
  const scoped = (entry) =>
    entry?.gameId === gameId &&
    entry.documentId === documentId &&
    (engine === undefined || entry.engine === engine);
  errors.forEach((entry, index) => {
    if (scoped(entry)) classifiedErrors.delete(index);
  });
  resourceFailures.forEach((entry, index) => {
    if (scoped(entry)) classifiedFailures.delete(index);
  });
  for (const index of result?.classifiedErrorIndexes || []) {
    if (scoped(errors[index])) classifiedErrors.add(index);
  }
  for (const index of result?.classifiedFailureIndexes || []) {
    if (scoped(resourceFailures[index])) classifiedFailures.add(index);
  }
}

async function inspectArtwork(page) {
  return page.evaluate(() => {
    const ledger = window.__chronicleEpicArtworkProof;
    if (!ledger) return null;
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const bounds = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0
      );
    };
    const faces = [
      ...document.querySelectorAll("figure.companion-card button.card-face"),
    ].map((face) => {
      const figure = face.closest("figure.companion-card"),
        caption = figure.querySelector(":scope > figcaption"),
        text = face.querySelector(".card-inner"),
        heading = text?.querySelector(".card-copy h3"),
        reverseFallback = face.querySelector(".table-card-fallback strong");
      return {
        kind: face.getAttribute("data-visible-face") || "front",
        label: face.getAttribute("data-visible-label") || "",
        source: face.getAttribute("data-art-source") || "",
        code: face.getAttribute("data-preview-code"),
        entityId: figure.getAttribute("data-entity-id") || "",
        cardId: figure.getAttribute("data-card-id") || "",
        front:
          !face.classList.contains("companion-reverse") &&
          face.getAttribute("data-preview-face") !== "back",
        figureVisible: visible(figure),
        captionVisible: visible(caption),
        caption: caption?.textContent || "",
        heading: heading?.textContent || "",
        headingVisible: visible(heading),
        textVisible: visible(text),
        reverseFallback: reverseFallback?.textContent || "",
        reverseFallbackVisible: visible(reverseFallback),
        bounds: figure.getBoundingClientRect().toJSON(),
        images: [...face.querySelectorAll("img")].map((image) => ({
          url: image.currentSrc || image.src,
          alt: image.alt,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          visible: visible(image),
        })),
      };
    });
    const portraits = [
      ...document.querySelectorAll(
        ".companion-portrait[data-visible-face='portrait']",
      ),
    ].map((portrait) => {
      const caption = portrait
          .closest("button.seat")
          ?.querySelector(".seat-copy strong"),
        fallback = portrait.querySelector(".companion-portrait-fallback");
      return {
        code: portrait.getAttribute("data-preview-code"),
        entityId: portrait.getAttribute("data-investigator-id"),
        label: portrait.getAttribute("data-visible-label"),
        caption: caption?.textContent || "",
        visible: visible(portrait),
        captionVisible: visible(caption),
        fallbackVisible: visible(fallback),
        fallbackLabel: fallback?.getAttribute("aria-label") || "",
        initials: fallback?.textContent || "",
        bounds: portrait.getBoundingClientRect().toJSON(),
        images: [...portrait.querySelectorAll("img")].map((image) => ({
          url: image.currentSrc || image.src,
          alt: image.alt,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          visible: visible(image),
        })),
      };
    });
    return {
      documentNonce: ledger.documentNonce,
      imageErrors: ledger.imageErrors,
      faces,
      portraits,
    };
  });
}

export async function verifyEpicArtwork(page, options) {
  const deadline = Date.now() + 20000;
  let result;
  do {
    const snapshot = await inspectArtwork(page);
    result = classifyEpicArtworkEvidence({ ...options, snapshot });
    // Only wait for eligible, same-document external 503s. All other errors
    // remain unclassified for the caller's strict assertion.
    const candidates = options.errors.filter(
      (error) =>
        error.gameId === options.gameId &&
        error.documentId === options.documentId &&
        (options.engine === undefined || error.engine === options.engine) &&
        error.kind === "console" &&
        externalCardImage(error.location?.url) &&
        /^Failed to load resource: the server responded with a status of 503(?: \((?:Service Unavailable)?\))?$/.test(
          error.message,
        ),
    );
    if (
      result.classifiedErrorIndexes.length === candidates.length ||
      !snapshot ||
      Date.now() >= deadline
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (true);
  return result;
}
