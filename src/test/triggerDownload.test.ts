/**
 * Download delivery — object-URL lifetime and multi-file sequencing.
 *
 * A 93-play export produced only the manifest. Both causes were in
 * triggerDownload and its call site:
 *
 *   1. URL.revokeObjectURL fired synchronously after a.click(), racing the
 *      browser's asynchronous read of the blob. The 214-byte manifest survived;
 *      the ~6KB plays CSV did not.
 *   2. All three files were requested in one tick. Browsers treat that as a
 *      single action — Safari honours roughly one download per user gesture —
 *      so only the last call (the manifest) reached disk.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerDownload, triggerDownloadSequence } from "@/engine/hudlExport";

let created: string[];
let revoked: string[];
let clicks: string[];

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom keeps one document across tests; anchors would otherwise accumulate.
  document.body.innerHTML = "";
  created = [];
  revoked = [];
  clicks = [];

  let n = 0;
  // jsdom implements neither of these.
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
    const url = `blob:mock/${n++}`;
    created.push(url);
    return url;
  };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u) => {
    revoked.push(u);
  };

  // jsdom refuses navigation on anchor click; record instead.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.download);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("triggerDownload", () => {
  it("does not revoke the object URL in the same tick as the click", () => {
    triggerDownload("a,b,c", "plays.csv", "text/csv");

    expect(clicks).toEqual(["plays.csv"]);
    expect(created).toHaveLength(1);
    // The regression: revoking here killed the download before the browser
    // had read the blob.
    expect(revoked).toEqual([]);
  });

  it("revokes eventually, so object URLs are not leaked", () => {
    triggerDownload("a,b,c", "plays.csv", "text/csv");
    vi.advanceTimersByTime(60_000);
    expect(revoked).toEqual(created);
  });

  it("removes the anchor only after the URL is released", () => {
    triggerDownload("a,b,c", "plays.csv", "text/csv");
    expect(document.querySelectorAll("a[download]")).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });
});

describe("triggerDownloadSequence", () => {
  const files = [
    { content: "p", filename: "plays.csv", mimeType: "text/csv" },
    { content: "n", filename: "notes.csv", mimeType: "text/csv" },
    { content: "{}", filename: "manifest.json", mimeType: "application/json" },
  ];

  it("does not fire every download in one tick", async () => {
    const done = triggerDownloadSequence(files, 800);

    // Only the first has gone out; the others are still waiting their turn.
    expect(clicks).toEqual(["plays.csv"]);

    await vi.advanceTimersByTimeAsync(800);
    expect(clicks).toEqual(["plays.csv", "notes.csv"]);

    await vi.advanceTimersByTimeAsync(800);
    expect(clicks).toEqual(["plays.csv", "notes.csv", "manifest.json"]);

    await done;
  });

  it("sends the plays CSV first, so a single permitted download is the useful one", async () => {
    const done = triggerDownloadSequence(files, 800);
    expect(clicks[0]).toBe("plays.csv");
    await vi.advanceTimersByTimeAsync(1600);
    await done;
  });
});
