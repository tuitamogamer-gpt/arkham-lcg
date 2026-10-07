import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyEpicArtworkEvidence,
  externalCardImage,
  replaceEpicArtworkIndexes,
} from "../scripts/epic-browser-artwork.mjs";

const url = "https://arkhamdb.com/bundles/cards/01019.png";
const original = () => ({
  errors: [
    {
      gameId: "past",
      engine: "chromium",
      documentId: 2,
      kind: "console",
      message:
        "Failed to load resource: the server responded with a status of 503 ()",
      location: { url },
    },
  ],
  resourceFailures: [
    {
      gameId: "past",
      engine: "chromium",
      documentId: 2,
      url,
      status: 503,
      resourceType: "image",
    },
  ],
  gameId: "past",
  engine: "chromium",
  documentId: 2,
  expectedNames: { "01019": "First Aid" },
  snapshot: {
    documentNonce: "actual-document-nonce",
    imageErrors: [
      {
        url,
        alt: "First Aid card",
        code: "01019",
        entityId: "native-card",
        cardId: "physical-card",
        caption: "First Aid",
        front: true,
      },
    ],
    faces: [
      {
        code: "01019",
        entityId: "native-card",
        cardId: "physical-card",
        caption: "First Aid",
        front: true,
        figureVisible: true,
        captionVisible: true,
        heading: "First Aid",
        headingVisible: true,
        textVisible: true,
        bounds: { width: 100, height: 140 },
        images: [] as any[],
      },
    ],
  },
});
test("optional image503 classification requires same-document native-card readable fallback and retains originals", () => {
  const input = original(),
    before = structuredClone(input),
    result = classifyEpicArtworkEvidence(input);
  assert.deepEqual(result.classifiedErrorIndexes, [0]);
  assert.deepEqual(result.classifiedFailureIndexes, [0]);
  assert.equal(
    result.evidence[0].occurrences[0].fallback.kind,
    "readable-card-face",
  );
  assert.equal(result.documentNonce, "actual-document-nonce");
  assert.deepEqual(input, before);
});
test("an exact decoded published scan can replace that printing, while another code or face cannot", () => {
  const input = original(),
    face = input.snapshot.faces[0];
  face.headingVisible = false;
  face.images.push({
    url: "https://assets.arkhamhorror.app/img/arkham/cards/01019.avif",
    alt: "First Aid card",
    complete: true,
    naturalWidth: 300,
    visible: true,
  });
  assert.deepEqual(
    classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
    [0],
  );
  for (const change of [
    { url: "https://assets.arkhamhorror.app/img/arkham/cards/01019b.avif" },
    { url: "https://assets.arkhamhorror.app/img/arkham/cards/01020.avif" },
    { url },
    { naturalWidth: 0 },
    { visible: false },
    { complete: false },
  ]) {
    const invalid = structuredClone(input);
    Object.assign(invalid.snapshot.faces[0].images[0], change);
    assert.deepEqual(
      classifyEpicArtworkEvidence(invalid).classifiedErrorIndexes,
      [],
    );
  }
});
test("portraits sharing the failed image URL remain fatal even with a valid card-face fallback", () => {
  const input = original();
  assert.deepEqual(
    classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
    [0],
  );
  input.snapshot.imageErrors.push({
    ...input.snapshot.imageErrors[0],
    front: false,
    code: "",
    entityId: "",
    cardId: "",
    caption: "",
  });
  assert.deepEqual(
    classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
    [],
  );
});

test("a later same-document portrait revokes cached card-art indexes while prior attested documents remain", () => {
  const input = original();
  input.errors.unshift({ ...input.errors[0], documentId: 1 });
  input.resourceFailures.unshift({
    ...input.resourceFailures[0],
    documentId: 1,
  });
  const classifiedErrors = new Set([0]),
    classifiedFailures = new Set([0]);
  const scoped = { ...input, classifiedErrors, classifiedFailures };
  replaceEpicArtworkIndexes({
    ...scoped,
    result: classifyEpicArtworkEvidence(input),
  });
  assert.deepEqual([...classifiedErrors], [0, 1]);
  assert.deepEqual([...classifiedFailures], [0, 1]);
  // The cached HTTP and console entries do not change. A second occurrence
  // of that failed image is now a portrait, invalidating only this document.
  input.snapshot.imageErrors.push({
    ...input.snapshot.imageErrors[0],
    front: false,
    code: "",
    entityId: "",
    cardId: "",
    caption: "",
  });
  replaceEpicArtworkIndexes({
    ...scoped,
    result: classifyEpicArtworkEvidence(input),
  });
  assert.deepEqual([...classifiedErrors], [0]);
  assert.deepEqual([...classifiedFailures], [0]);
});

function portrait() {
  const input: any = original(),
    portraitUrl = "https://arkhamdb.com/bundles/cards/01001.png";
  input.errors[0].location.url = portraitUrl;
  input.resourceFailures[0].url = portraitUrl;
  input.cardDefinitions = [
    {
      cardCode: "c01001",
      art: "01001",
      name: { title: "Roland Banks" },
      cardType: "InvestigatorType",
    },
  ];
  input.nativeSnapshot = {
    game: {
      id: "past",
      investigators: { c01001: { id: "c01001", cardCode: "c01001" } },
    },
  };
  input.snapshot.imageErrors = [
    {
      url: portraitUrl,
      kind: "portrait",
      alt: "Roland Banks portrait",
      code: "01001",
      entityId: "c01001",
      cardId: "",
      caption: "Roland Banks",
      label: "Roland Banks",
      front: false,
    },
  ];
  input.snapshot.faces = [];
  input.snapshot.portraits = [
    {
      code: "01001",
      entityId: "c01001",
      label: "Roland Banks",
      caption: "Roland Banks",
      visible: true,
      captionVisible: true,
      fallbackVisible: true,
      fallbackLabel: "Roland Banks, portrait unavailable",
      initials: "RB",
      images: [],
    },
  ];
  return input;
}
test("typed portrait recovery requires the same native investigator, accessible name and correct initials or decoded exact print", () => {
  const input = portrait(),
    result = classifyEpicArtworkEvidence(input);
  assert.deepEqual(result.classifiedErrorIndexes, [0]);
  assert.equal(
    result.evidence[0].occurrences[0].fallback.kind,
    "accessible-portrait-name",
  );
  input.snapshot.portraits[0].fallbackVisible = false;
  input.snapshot.portraits[0].images = [
    {
      url: "https://assets.arkhamhorror.app/img/arkham/cards/01001.avif",
      alt: "Roland Banks portrait",
      complete: true,
      naturalWidth: 418,
      visible: true,
    },
  ];
  assert.equal(
    classifyEpicArtworkEvidence(input).evidence[0].occurrences[0].fallback.kind,
    "decoded-portrait-alternate",
  );
});
test("untyped portraits, wrong native game/investigator/printing, incorrect visible initials or names stay fatal", () => {
  for (const mutate of [
    (input: any) => {
      input.snapshot.imageErrors[0].kind = "unknown";
    },
    (input: any) => {
      input.nativeSnapshot.game.id = "another-game";
    },
    (input: any) => {
      input.nativeSnapshot.game.investigators = {};
    },
    (input: any) => {
      input.cardDefinitions[0].art = "01002";
    },
    (input: any) => {
      input.cardDefinitions[0].cardType = "AssetType";
    },
    (input: any) => {
      input.snapshot.portraits[0].entityId = "another-investigator";
    },
    (input: any) => {
      input.snapshot.portraits[0].initials = "XX";
    },
    (input: any) => {
      input.snapshot.portraits[0].fallbackLabel =
        "Someone else, portrait unavailable";
    },
    (input: any) => {
      input.snapshot.portraits[0].captionVisible = false;
    },
    (input: any) => {
      input.snapshot.portraits[0].caption = "Someone else";
    },
  ]) {
    const input = portrait();
    mutate(input);
    assert.deepEqual(
      classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
      [],
    );
  }
});
function unrevealed() {
  const input: any = original(),
    backUrl = "https://arkhamdb.com/bundles/cards/70024b.png";
  input.errors[0].location.url = backUrl;
  input.resourceFailures[0].url = backUrl;
  input.cardDefinitions = [
    {
      cardCode: "c70024",
      art: "70024",
      name: { title: "Chamber of Regret" },
      cardType: "LocationType",
      doubleSided: true,
    },
  ];
  input.nativeSnapshot = {
    game: {
      id: "past",
      locations: {
        location: {
          id: "location",
          cardId: "physical-location",
          cardCode: "c70024",
          revealed: false,
        },
      },
    },
  };
  input.snapshot.imageErrors = [
    {
      url: backUrl,
      kind: "unrevealed",
      alt: "Unrevealed location",
      code: "",
      entityId: "location",
      cardId: "physical-location",
      caption: "Unrevealed location",
      label: "Unrevealed location",
      source: backUrl,
      front: false,
    },
  ];
  input.snapshot.faces = [
    {
      kind: "unrevealed",
      code: "",
      entityId: "location",
      cardId: "physical-location",
      front: false,
      source: backUrl,
      label: "Unrevealed location",
      caption: "Unrevealed location",
      figureVisible: true,
      captionVisible: true,
      reverseFallbackVisible: true,
      reverseFallback: "Unrevealed location",
      images: [],
    },
  ];
  return input;
}
test("physical unrevealed locations qualify only through their actual back printing and safe generic label", () => {
  const result = classifyEpicArtworkEvidence(unrevealed());
  assert.deepEqual(result.classifiedErrorIndexes, [0]);
  assert.equal(result.evidence[0].occurrences[0].visibleFace, "unrevealed");
  assert.equal(
    result.evidence[0].occurrences[0].fallback.label,
    "Unrevealed location",
  );
  assert.ok(
    !JSON.stringify(result.evidence).includes("Chamber of Regret"),
    "The witness does not expose the hidden front name.",
  );
});
test("the verified Tindalos opposite printing is bound to the actual native variant without exposing its hidden face", () => {
  const input = unrevealed(),
    backUrl = "https://assets.arkhamhorror.app/img/arkham/cards/87005.avif";
  input.errors[0].location.url = backUrl;
  input.resourceFailures[0].url = backUrl;
  Object.assign(input.cardDefinitions[0], {
    cardCode: "c87005b",
    art: "87005b",
    name: { title: "Tindalos", subtitle: "Maze of Infinite Depths" },
  });
  input.nativeSnapshot.game.locations.location.cardCode = "c87005b";
  input.snapshot.imageErrors[0].url = backUrl;
  input.snapshot.imageErrors[0].source = backUrl;
  input.snapshot.faces[0].source = backUrl;
  const result = classifyEpicArtworkEvidence(input);
  assert.deepEqual(result.classifiedErrorIndexes, [0]);
  assert.equal(
    result.evidence[0].occurrences[0].fallback.label,
    "Unrevealed location",
  );
  assert.ok(!JSON.stringify(result.evidence).includes("Tindalos"));
  assert.ok(
    !JSON.stringify(result.evidence).includes("Maze of Infinite Depths"),
  );
  for (const mutate of [
    (invalid: any) => {
      invalid.cardDefinitions[0].cardType = "ActType";
    },
    (invalid: any) => {
      invalid.nativeSnapshot.game.locations.location.revealed = true;
    },
    (invalid: any) => {
      const malformed =
        "https://assets.arkhamhorror.app/img/arkham/cards/87005bb.avif";
      invalid.errors[0].location.url = malformed;
      invalid.resourceFailures[0].url = malformed;
      invalid.snapshot.imageErrors[0].url = malformed;
      invalid.snapshot.imageErrors[0].source = malformed;
      invalid.snapshot.faces[0].source = malformed;
    },
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.deepEqual(
      classifyEpicArtworkEvidence(invalid).classifiedErrorIndexes,
      [],
    );
  }
});
test("wrong back printing, physical card, revealed state, face marker or exposed front label cannot qualify", () => {
  for (const mutate of [
    (input: any) => {
      input.nativeSnapshot.game.locations.location.revealed = true;
    },
    (input: any) => {
      input.nativeSnapshot.game.locations.location.cardId =
        "another-physical-card";
    },
    (input: any) => {
      input.nativeSnapshot.game.locations.location.cardCode = "c70025";
    },
    (input: any) => {
      input.cardDefinitions[0].doubleSided = false;
    },
    (input: any) => {
      input.snapshot.imageErrors[0].source =
        "https://arkhamdb.com/bundles/cards/70024.png";
    },
    (input: any) => {
      input.snapshot.faces[0].reverseFallback = "Chamber of Regret";
    },
    (input: any) => {
      input.snapshot.faces[0].kind = "reverse";
    },
    (input: any) => {
      input.snapshot.faces[0].reverseFallbackVisible = false;
    },
  ]) {
    const input = unrevealed();
    mutate(input);
    assert.deepEqual(
      classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
      [],
    );
  }
});
test("a printed reverse label requires a flipped native card and its independently defined reverse name", () => {
  const input = unrevealed();
  input.nativeSnapshot.game.locations.location = {
    ...input.nativeSnapshot.game.locations.location,
    revealed: true,
    flipped: true,
  };
  input.cardDefinitions[0].revealedName = { title: "The Reverse Face" };
  Object.assign(input.snapshot.imageErrors[0], {
    kind: "reverse",
    label: "The Reverse Face",
    caption: "The Reverse Face",
    alt: "Chamber of Regret, reverse face",
  });
  Object.assign(input.snapshot.faces[0], {
    kind: "reverse",
    label: "The Reverse Face",
    caption: "The Reverse Face",
    reverseFallback: "The Reverse Face",
  });
  assert.deepEqual(
    classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
    [0],
  );
  input.nativeSnapshot.game.locations.location.flipped = false;
  assert.deepEqual(
    classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
    [],
  );
  input.nativeSnapshot.game.locations.location.flipped = true;
  input.cardDefinitions[0].revealedName.title = "Another Reverse Face";
  assert.deepEqual(
    classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
    [],
  );
});
test("HTTP or console URL, resource type, scope and document mismatches cannot be ignored", () => {
  for (const change of [
    { status: 404 },
    { url: "https://arkhamdb.com/bundles/cards/01020.png" },
    { resourceType: "fetch" },
    { documentId: 1 },
    { gameId: "present" },
    { engine: "webkit" },
  ]) {
    const input = original();
    Object.assign(input.resourceFailures[0], change);
    assert.deepEqual(
      classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
      [],
    );
  }
  const stale = original();
  stale.errors[0].documentId = 1;
  assert.deepEqual(
    classifyEpicArtworkEvidence(stale).classifiedErrorIndexes,
    [],
  );
});
test("wrong names, missing or hidden fallback, replacement physical cards and back faces remain fatal", () => {
  for (const change of [
    { heading: "Guts" },
    { caption: "Guts" },
    { code: "01020" },
    { entityId: "another-card" },
    { cardId: "another-physical-card" },
    { front: false },
    { headingVisible: false },
    { captionVisible: false },
    { figureVisible: false },
    { textVisible: false },
  ]) {
    const input = original();
    Object.assign(input.snapshot.faces[0], change);
    assert.deepEqual(
      classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
      [],
    );
  }
  const noCapture = original();
  noCapture.snapshot.imageErrors = [];
  assert.deepEqual(
    classifyEpicArtworkEvidence(noCapture).classifiedErrorIndexes,
    [],
  );
});
test("unmatched page or native/local errors and unsupported image origins are never artwork evidence", () => {
  for (const bad of [
    "http://127.0.0.1:5494/chronicle/play/games/past/answer",
    "http://127.0.0.1:5498/art/cards/01019.webp",
    "https://other.example/01019.png",
    "https://arkhamdb.com/bundles/cards/01019.png?retry=1",
    "https://arkhamdb.com:444/bundles/cards/01019.png",
  ])
    assert.equal(externalCardImage(bad), null);
  for (const change of [
    { kind: "pageerror" },
    { message: "503 native answer failed" },
    { location: { url: "http://127.0.0.1:5494/api/v1/games/past" } },
  ]) {
    const input = original();
    Object.assign(input.errors[0], change);
    assert.deepEqual(
      classifyEpicArtworkEvidence(input).classifiedErrorIndexes,
      [],
    );
  }
});
