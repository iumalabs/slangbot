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
import { checkGameBalance, parseEntryJson } from "../src/pipeline/generate.ts";
import { parseIllustrationVerdict } from "../src/pipeline/illustrate.ts";
import {
  buildSuggestionNotice,
  buildTelegramPosts,
  parseSuggestionCallback,
  sendPhotoBytes,
  suggestionCallbackData,
  telegramHeader,
} from "../src/pipeline/telegram.ts";
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
    shareString(
      "slangbot",
      142,
      results,
      "2026-07-07",
      "slangbot.maksimyugai.com",
    ),
    "slangbot day 142 — my week: 🟩🟥 slangbot.maksimyugai.com",
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

// --- game balance guard ---

function balancedEntry() {
  const real =
    "Describes a person so deeply immersed in online discourse that offline norms stop applying to them.";
  const fake1 =
    "Describes the habit of resurfacing years-old posts to win a current argument in a comment thread.";
  const fake2 =
    "Describes an account that only posts during platform outages to farm engagement from confusion.";
  return parseEntryJson(JSON.stringify({
    ...JSON.parse(GOOD_ENTRY),
    term: "chronically online",
    definition_en: real,
    definition_ru: real,
    fake_definitions_en: [fake1, fake2],
    fake_definitions_ru: [fake1, fake2],
  }));
}

Deno.test("checkGameBalance passes a balanced entry", () => {
  assertEquals(checkGameBalance(balancedEntry()), null);
});

Deno.test("checkGameBalance flags length imbalance", () => {
  const entry = balancedEntry();
  entry.fake_definitions_en = ["Too short.", entry.fake_definitions_en[1]];
  const problem = checkGameBalance(entry);
  assert(problem !== null && problem.includes("same length"));
});

Deno.test("checkGameBalance flags the term leaking into an option", () => {
  const entry = balancedEntry();
  entry.definition_ru =
    "Термин chronically online описывает человека, который слишком много времени проводит в интернете.";
  const problem = checkGameBalance(entry);
  assert(problem !== null && problem.includes("contains the term"));
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
  locale: "en" as const,
  term: "bussin",
  ipa: "/ˈbʌsɪn/",
  pos: "adj., internet",
  choices: ["REAL definition", "FAKE one", "FAKE two"] as const,
  correctIndex: 0,
  permalink: "https://slangbot.maksimyugai.com/term/bussin",
  hasImage: true,
};

Deno.test("telegram posts: message + quiz poll (photo is sent separately as bytes)", () => {
  const posts = buildTelegramPosts(TG_INPUT);
  assertEquals(posts.map((p) => p.method), ["sendMessage", "sendPoll"]);

  const message = posts[0].payload.text as string;
  assert(message.includes("A) REAL definition"));
  assert(message.includes("B) FAKE one"));
  assert(message.includes("C) FAKE two"));
  assert(message.includes(TG_INPUT.permalink));
  // The message itself must not reveal which option is real.
  assert(!message.toLowerCase().includes("correct"));
  // With an image, the header (term/ipa/pos) lives in the photo caption, not here.
  assert(!message.includes(TG_INPUT.ipa));

  const poll = posts[1].payload;
  assertEquals(poll.type, "quiz");
  assertEquals(poll.options, ["A", "B", "C"]);
  assertEquals(poll.correct_option_id, 0);
  assertEquals(poll.is_anonymous, true);
  assert((poll.question as string).length <= 300);
  assert((poll.explanation as string).length <= 200);
});

Deno.test("telegram posts: header moves into the message when there is no image", () => {
  const posts = buildTelegramPosts({ ...TG_INPUT, hasImage: false });
  assertEquals(posts.map((p) => p.method), ["sendMessage", "sendPoll"]);
  assert((posts[0].payload.text as string).includes("/ˈbʌsɪn/"));
});

Deno.test("telegram posts: ru locale localizes the scaffolding", () => {
  const posts = buildTelegramPosts({ ...TG_INPUT, locale: "ru" });
  const message = posts[0].payload.text as string;
  assert(message.includes("одно из этих определений настоящее"));
  assert(message.includes("голосуйте ниже"));
  const poll = posts[1].payload;
  assertEquals(poll.question, "bussin — какое определение настоящее?");
  assert((poll.explanation as string).startsWith("полный разбор →"));
});

Deno.test("telegramHeader: day number and ru locale", () => {
  const header = telegramHeader(
    "ru",
    "slangbot",
    7,
    "bussin",
    "/ˈbʌsɪn/",
    "adj.",
  );
  assert(header.includes("день 7"));
  assert(header.includes("bussin"));
});

Deno.test("sendPhotoBytes: uploads a multipart photo, not a URL", async () => {
  const realFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: unknown;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedBody = init?.body;
    return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await sendPhotoBytes(
      "tok",
      "@daily_slangbot",
      new Uint8Array([1, 2, 3]),
      "bussin.png",
      "caption text",
    );
    assertEquals(result, "200");
    assert(capturedUrl.endsWith("/bottok/sendPhoto"));
    assert(
      capturedBody instanceof FormData,
      "body must be multipart form data",
    );
    const form = capturedBody as FormData;
    const photo = form.get("photo");
    assert(
      photo instanceof Blob,
      "photo field must be raw bytes, not a URL string",
    );
    assertEquals(form.get("chat_id"), "@daily_slangbot");
    assertEquals(form.get("caption"), "caption text");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("sendPhotoBytes: surfaces the Telegram error on failure", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('{"ok":false,"description":"bad"}', { status: 400 }),
    )) as typeof fetch;
  try {
    const result = await sendPhotoBytes(
      "tok",
      "@daily_slangbot",
      new Uint8Array([1]),
      "x.png",
      "cap",
    );
    assert(result.startsWith("400"));
    assert(result.includes("bad"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

// --- suggestion moderation callbacks ---

Deno.test("suggestion callback data round-trips", () => {
  assertEquals(parseSuggestionCallback(suggestionCallbackData("approve", 42)), {
    action: "approve",
    id: 42,
  });
  assertEquals(parseSuggestionCallback(suggestionCallbackData("reject", 7)), {
    action: "reject",
    id: 7,
  });
});

Deno.test("suggestion callback parser rejects foreign data", () => {
  assertEquals(parseSuggestionCallback("sug:delete:1"), null);
  assertEquals(parseSuggestionCallback("sug:approve:not-a-number"), null);
  assertEquals(parseSuggestionCallback("something else"), null);
  assertEquals(parseSuggestionCallback(undefined), null);
});

Deno.test("suggestion notice carries both buttons and the term", () => {
  const post = buildSuggestionNotice("12345", "skibidi", 9);
  assertEquals(post.method, "sendMessage");
  assert((post.payload.text as string).includes("skibidi"));
  const markup = post.payload.reply_markup as {
    inline_keyboard: { text: string; callback_data: string }[][];
  };
  assertEquals(markup.inline_keyboard[0].map((b) => b.callback_data), [
    "sug:approve:9",
    "sug:reject:9",
  ]);
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
