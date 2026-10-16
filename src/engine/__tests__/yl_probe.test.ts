import { it } from "vitest";
import { normalizeTranscriptForParse } from "../transcriptNormalize";
import { parseRawInput } from "../rawInputParser";
it("probe", () => {
  for (const s of ["ball on the -23 yard line","-23 yard line","minus 23 yard line","our 23 yard line","their 23 yard line","on our 23 yard line, first and 10","our 23","their 40","we are at our 23 yard line","the ball is at the -23 yard line","Ball on -23 yard line","negative 23 yard line","on the 23 yard line","third and 7 at our own 23"]) {
    const n = normalizeTranscriptForParse(s);
    console.log(JSON.stringify(s), "=>", JSON.stringify(n), JSON.stringify(parseRawInput(n).patch));
  }
});
