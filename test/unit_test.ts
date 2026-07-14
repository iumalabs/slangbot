/** Pure-logic unit tests: slug, streak grid, game permutation, cookies, parsers, i18n. */
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "@std/assert";
import { slugify, uniqueSlug } from "../src/lib/slug.ts";
import {
  currentStreak,
  shareString,
  weekGrid,
  weekStart,
} from "../src/lib/streak.ts";
import { choiceOrder, correctIndex, shuffledChoices } from "../src/lib/game.ts";
import { signValue, verifyValue } from "../src/lib/cookies.ts";
import { extractJson } from "../src/ai/gateway.ts";
import { parsePickJson } from "../src/pipeline/pick.ts";
import { parseEntryJson } from "../src/pipeline/generate.ts";
import { parseIllustrationVerdict } from "../src/pipeline/illustrate.ts";
import { buildTelegramPosts } from "../src/pipeline/telegram.ts";
import { imagePrompt } from "../src/ai/prompts.ts";
import {
  extractTermsFromTitles,
  parseFeedTitles,
  parseUrban,
} from "../src/pipeline/harvest.ts";
import { rawDictionaries } from "../src/content/i18n.ts";
import { alternatePath, localePath } from "../src/lib/i18n.ts";
import { escapeXml } from "../src/lib/rss.ts";

// --- slug ---

Deno.test("slugify normalizes terms", () => {
  assertEquals(slugify("No Cap"), "no-cap");
  assertEquals(slugify("it's giving"), "its-giving");
  assertEquals(slugify("  gyat!!  "), "gyat");
  assertEquals(slugify("Ünïcode Térm"), "unicode-term");
});

Deno.test("uniqueSlug resolves collisions with numeric suffixes", () => {
  const taken = new Set(["rizz", "rizz-2"]);
  assertEquals(uniqueSlug("rizz", taken), "rizz-3");
  assertEquals(uniqueSlug("fresh", taken), "fresh");
});

// --- streak / emoji grid ---

Deno.test("weekStart returns the Monday of the week (UTC)", () => {
  assertEquals(weekStart("2026-07-07"), "2026-07-06"); // Tue -> Mon
  assertEquals(weekStart("2026-07-06"), "2026-07-06"); // Mon -> Mon
  assertEquals(weekStart("2026-07-12"), "2026-07-06"); // Sun -> Mon
});

Deno.test("weekGrid renders mixed results in order", () => {
  const results = {
    "2026-07-06": "g",
    "2026-07-07": "g",
    "2026-07-08": "r",
    "2026-07-09": "g",
    "2026-07-10": "y",
  } as const;
  assertEquals(weekGrid(results, "2026-07-10"), "🟩🟩🟥🟩🟨");
});

Deno.test("weekGrid skips unplayed days and truncates at today", () => {
  const results = { "2026-07-06": "g", "2026-07-08": "r" } as const;
  assertEquals(weekGrid(results, "2026-07-08"), "🟩🟥");
});

Deno.test("shareString matches the documented format", () => {
  const results = { "2026-07-06": "g", "2026-07-07": "r" } as const;
  assertEquals(
    shareString("iuma", 142, results, "2026-07-07", "iuma.dev"),
    "iuma day 142 — my week: 🟩🟥 iuma.dev",
  );
});

Deno.test("currentStreak counts consecutive played days", () => {
  const results = {
    "2026-07-05": "g",
    "2026-07-06": "r",
    "2026-07-07": "y",
  } as const;
  assertEquals(currentStreak(results, "2026-07-07"), 3);
  assertEquals(currentStreak({ "2026-07-05": "g" }, "2026-07-07"), 0);
});

// --- game permutation ---

Deno.test("choiceOrder is deterministic and secret-dependent", async () => {
  const a = await choiceOrder("rizz", "secret-a");
  const b = await choiceOrder("rizz", "secret-a");
  assertEquals(a, b);
  // A different slug or secret should (for these fixtures) shuffle differently
  // at least once across a handful of slugs.
  let differs = false;
  for (const slug of ["rizz", "gyat", "sigma", "aura", "mid", "bet"]) {
    const x = await choiceOrder(slug, "secret-a");
    const y = await choiceOrder(slug, "secret-b");
    if (x.join() !== y.join()) differs = true;
  }
  assert(differs);
});

Deno.test("correctIndex agrees with shuffledChoices", async () => {
  for (const slug of ["rizz", "gyat", "sigma", "delulu", "npc"]) {
    const defs: [string, string, string] = ["REAL", "FAKE1", "FAKE2"];
    const choices = await shuffledChoices(slug, "s3cret", defs);
    const idx = await correctIndex(slug, "s3cret");
    assertEquals(choices[idx], "REAL");
    assertEquals([...choices].sort(), ["FAKE1", "FAKE2", "REAL"]);
  }
});

// --- cookies ---

Deno.test("signed values verify and tampering is rejected", async () => {
  const signed = await signValue("uid-123", "secret");
  assertEquals(await verifyValue(signed, "secret"), "uid-123");
  assertEquals(await verifyValue(signed, "other-secret"), null);
  assertEquals(
    await verifyValue(signed.replace("uid-123", "uid-666"), "secret"),
    null,
  );
  assertEquals(await verifyValue("garbage", "secret"), null);
  assertEquals(await verifyValue(null, "secret"), null);
});

// --- AI output parsers ---

Deno.test("extractJson handles fences and prose", () => {
  assertEquals(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(extractJson('Sure! Here it is: {"a":1} hope that helps'), {
    a: 1,
  });
  assertThrows(() => extractJson("no json here"));
});

Deno.test("parsePickJson accepts good output and rejects bad", () => {
  const good = parsePickJson(
    '{"term":"rizz","reason":"trendy","source":"seed"}',
  );
  assertEquals(good.term, "rizz");
  assertThrows(() => parsePickJson('{"reason":"no term"}'));
  assertThrows(() => parsePickJson(`{"term":"${"x".repeat(80)}"}`));
});

const GOOD_ENTRY = JSON.stringify({
  term: "rizz",
  pos: "noun",
  ipa: "/rɪz/",
  respelled_ru: "риз",
  origin_en: "o",
  origin_ru: "о",
  definition_en: "d",
  definition_ru: "д",
  example_en: "e",
  example_note_en: "n",
  example_note_ru: "н",
  ok_tags_en: ["a"],
  ok_tags_ru: ["а"],
  not_ok_tags_en: ["b"],
  not_ok_tags_ru: ["б"],
  related: ["gyat"],
  fake_definitions_en: ["f1", "f2"],
  fake_definitions_ru: ["ф1", "ф2"],
});

Deno.test("parseEntryJson accepts a complete entry", () => {
  const entry = parseEntryJson("```json\n" + GOOD_ENTRY + "\n```");
  assertEquals(entry.term, "rizz");
  assertEquals(entry.fake_definitions_ru, ["ф1", "ф2"]);
});

Deno.test("parseEntryJson rejects missing fields and short fake lists", () => {
  const missing = JSON.parse(GOOD_ENTRY);
  delete missing.definition_ru;
  assertThrows(() => parseEntryJson(JSON.stringify(missing)));

  const oneFake = JSON.parse(GOOD_ENTRY);
  oneFake.fake_definitions_en = ["only one"];
  assertThrows(() => parseEntryJson(JSON.stringify(oneFake)));
});

// --- illustration validation ---

Deno.test("parseIllustrationVerdict flags text and humans", () => {
  assertEquals(
    parseIllustrationVerdict('{"has_text": true, "has_humans": false}'),
    { ok: false, reason: "vision flagged: text" },
  );
  assertEquals(
    parseIllustrationVerdict('{"has_text": false, "has_humans": true}').ok,
    false,
  );
  assertEquals(
    parseIllustrationVerdict('{"has_text": false, "has_humans": false}').ok,
    true,
  );
  // LLaVA often wraps JSON in prose — extractJson handles that.
  assertEquals(
    parseIllustrationVerdict(
      'Sure! {"has_text": true, "has_humans": true} hope that helps',
    ).ok,
    false,
  );
});

Deno.test("parseIllustrationVerdict fails open on garbage", () => {
  assertEquals(parseIllustrationVerdict("I see a cat").ok, true);
  assertEquals(parseIllustrationVerdict("").ok, true);
});

Deno.test("image prompt never contains the term and bans text/humans", () => {
  const prompt = imagePrompt("something exceptionally good or high quality");
  assert(!prompt.includes("bussin"));
  assert(prompt.includes("no text"));
  assert(prompt.includes("no humans"));
  assert(prompt.includes("no hands"));
  const retry = imagePrompt("def", 1);
  assert(retry.startsWith("IMPORTANT"));
});

// --- telegram posts ---

const TG_INPUT = {
  channelId: "@daily_slangbot",
  siteName: "slangbot",
  dayNumber: 7,
  term: "bussin",
  ipa: "/ˈbʌsɪn/",
  pos: "adj., internet",
  choices: ["REAL definition", "FAKE one", "FAKE two"] as const,
  correctIndex: 0,
  permalink: "https://iuma.dev/term/bussin",
  imageUrl: "https://iuma.dev/img/terms/bussin.png",
};

Deno.test("telegram posts: photo + labeled options + quiz poll", () => {
  const posts = buildTelegramPosts(TG_INPUT);
  assertEquals(posts.map((p) => p.method), [
    "sendPhoto",
    "sendMessage",
    "sendPoll",
  ]);

  const message = posts[1].payload.text as string;
  assert(message.includes("A) REAL definition"));
  assert(message.includes("B) FAKE one"));
  assert(message.includes("C) FAKE two"));
  assert(message.includes(TG_INPUT.permalink));
  // The message itself must not reveal which option is real.
  assert(!message.toLowerCase().includes("correct"));

  const poll = posts[2].payload;
  assertEquals(poll.type, "quiz");
  assertEquals(poll.options, ["A", "B", "C"]);
  assertEquals(poll.correct_option_id, 0);
  assertEquals(poll.is_anonymous, true);
  assert((poll.question as string).length <= 300);
  assert((poll.explanation as string).length <= 200);
});

Deno.test("telegram posts: no photo message when the image is missing", () => {
  const posts = buildTelegramPosts({ ...TG_INPUT, imageUrl: null });
  assertEquals(posts.map((p) => p.method), ["sendMessage", "sendPoll"]);
  // Without the photo, the header (term/ipa/pos) moves into the message.
  assert((posts[0].payload.text as string).includes("/ˈbʌsɪn/"));
});

// --- harvest parsers ---

Deno.test("parseUrban extracts words defensively", () => {
  assertEquals(parseUrban('{"list":[{"word":"rizz"},{"word":"gyat"}]}'), [
    "rizz",
    "gyat",
  ]);
  assertEquals(parseUrban("not json"), []);
  assertEquals(parseUrban('{"list":"nope"}'), []);
});

Deno.test("feed title extraction finds quoted terms", () => {
  const xml = `<rss><channel><title>chan</title>
    <item><title>What does "delulu" mean on TikTok?</title></item>
    <item><title>ELI5: what is rizz slang about</title></item>
  </channel></rss>`;
  const titles = parseFeedTitles(xml);
  assertEquals(titles.length, 2);
  const terms = extractTermsFromTitles(titles);
  assert(terms.includes("delulu"));
});

// --- i18n ---

Deno.test("RU dictionary covers every EN key", () => {
  const enKeys = Object.keys(rawDictionaries.en).sort();
  const ruKeys = Object.keys(rawDictionaries.ru).sort();
  assertEquals(ruKeys, enKeys);
  for (const key of enKeys) {
    const enVal = (rawDictionaries.en as Record<string, unknown>)[key];
    const ruVal = (rawDictionaries.ru as Record<string, unknown>)[key];
    assertEquals(typeof ruVal, typeof enVal, `type mismatch for ${key}`);
    if (typeof enVal === "string") {
      assert((ruVal as string).length > 0, `empty RU string for ${key}`);
      assertNotEquals(ruVal, "", key);
    }
  }
});

Deno.test("locale paths round-trip", () => {
  assertEquals(localePath("en", "/"), "/");
  assertEquals(localePath("ru", "/"), "/ru/");
  assertEquals(localePath("ru", "/term/rizz"), "/ru/term/rizz");
  assertEquals(alternatePath("en", "/term/rizz"), "/ru/term/rizz");
  assertEquals(alternatePath("ru", "/ru/term/rizz"), "/term/rizz");
  assertEquals(alternatePath("ru", "/ru/"), "/");
});

// --- xml escaping ---

Deno.test("escapeXml escapes all specials", () => {
  assertEquals(
    escapeXml(`<a href="x">&'`),
    "&lt;a href=&quot;x&quot;&gt;&amp;&apos;",
  );
});
