/**
 * EN/RU UI strings. This is the only file in the codebase that contains
 * Russian text (the generated entries in D1 are content, not code).
 */

import type { Locale } from "../lib/i18n.ts";

const en = {
  tagline: "the Internet's Unofficial Manual of Argot",
  tickerPicked: "word picked automatically on",
  tickerSources: "sources",
  tickerDay: "day",
  gameTitle: "what does it mean?",
  gameHint: "one of these is the real definition. choose wisely.",
  gameRevealNoJs: "no JS? no judgement —",
  gameRevealLink: "reveal the answer",
  gameCorrect: "correct. you are chronically online.",
  gameWrong: "wrong. the internet moves fast, huh.",
  gameStat: (n: number) => `only ${n}% got this one today`,
  gameStatHigh: (n: number) => `${n}% got this one today`,
  guessSubmitting: "checking…",
  pronunciation: "pronunciation",
  partOfSpeech: "part of speech",
  origin: "where it came from",
  definition: "what it actually means",
  example: "in the wild",
  exampleNote: "translation to plain English",
  okTags: "ok to use",
  notOkTags: "not ok",
  related: "related terms",
  comingSoon: "coming someday",
  archive: "archive",
  archiveTitle: "every word so far",
  archiveSearch: "search the archive…",
  archiveEmpty: "nothing found. suggest it below?",
  suggestTitle: "request a word",
  suggestHint:
    "know a term we should decode? drop it here. a robot will consider it.",
  suggestPlaceholder: "e.g. rizz",
  suggestSubmit: "suggest",
  suggestThanks: "noted. the machine will consider it.",
  suggestError: "that did not work. try again later.",
  suggestRateLimited: "easy there — 3 suggestions a day is the limit.",
  requestedByReader: "requested by a reader",
  share: "share",
  shareWeek: "share my results",
  shareFriend: "send it to a friend who talks like this",
  shareFriendText: (url: string) => `you say this constantly → ${url}`,
  copied: "copied",
  streak: "streak",
  days: "days",
  today: "today",
  todaysWord: "today's word",
  footerDisclaimer:
    "fully automated: a robot picks a word, writes the entry, and draws the picture. no humans were involved (or harmed).",
  footerRss: "rss",
  notFound: "404 — this word does not exist. yet.",
  backHome: "back to today's word",
  langToggle: "RU",
  skipToContent: "skip to content",
  illustrationAlt: (term: string) =>
    `ironic AI illustration for the term "${term}"`,
  noEntryYet:
    "the robot has not published anything yet. check back after midnight UTC.",
  // Telegram channel post scaffolding
  tgIntro: "one of these is the real definition:",
  tgVote: "vote below 👇 then read the full entry:",
  tgWhichReal: (term: string) => `${term} — which definition is real?`,
  tgFullEntry: "full entry →",
} as const;

const ru: Record<keyof typeof en, unknown> = {
  tagline: "неофициальный справочник американского интернет-сленга",
  tickerPicked: "слово выбрано автоматически",
  tickerSources: "источники",
  tickerDay: "день",
  gameTitle: "что это значит?",
  gameHint: "одно из определений настоящее. выбирайте с умом.",
  gameRevealNoJs: "без JS? бывает —",
  gameRevealLink: "показать ответ",
  gameCorrect: "верно. вы хронически онлайн.",
  gameWrong: "мимо. интернет быстрее вас.",
  gameStat: (n: number) => `только ${n}% угадали сегодня`,
  gameStatHigh: (n: number) => `${n}% угадали сегодня`,
  guessSubmitting: "проверяем…",
  pronunciation: "произношение",
  partOfSpeech: "часть речи",
  origin: "откуда это взялось",
  definition: "что это на самом деле значит",
  example: "в естественной среде",
  exampleNote: "перевод и пояснение",
  okTags: "когда уместно",
  notOkTags: "когда не стоит",
  related: "связанные термины",
  comingSoon: "когда-нибудь будет",
  archive: "архив",
  archiveTitle: "все слова",
  archiveSearch: "поиск по архиву…",
  archiveEmpty: "ничего не нашлось. предложите слово ниже?",
  suggestTitle: "предложить слово",
  suggestHint:
    "знаете термин, который стоит разобрать? оставьте его здесь. робот подумает.",
  suggestPlaceholder: "например, rizz",
  suggestSubmit: "предложить",
  suggestThanks: "принято. машина подумает.",
  suggestError: "не сработало. попробуйте позже.",
  suggestRateLimited: "не так быстро — лимит 3 предложения в день.",
  requestedByReader: "по запросу читателя",
  share: "поделиться",
  shareWeek: "поделиться результатами",
  shareFriend: "отправить тому, кто так разговаривает",
  shareFriendText: (url: string) => `ты постоянно это говоришь → ${url}`,
  copied: "скопировано",
  streak: "серия",
  days: "дней",
  today: "сегодня",
  todaysWord: "слово дня",
  footerDisclaimer:
    "полная автоматика: робот выбирает слово, пишет статью и рисует картинку. люди не участвовали (и не пострадали).",
  footerRss: "rss",
  notFound: "404 — такого слова нет. пока.",
  backHome: "к слову дня",
  langToggle: "EN",
  skipToContent: "к содержанию",
  illustrationAlt: (term: string) =>
    `ироничная ИИ-иллюстрация к термину «${term}»`,
  noEntryYet: "робот ещё ничего не опубликовал. загляните после полуночи UTC.",
  tgIntro: "одно из этих определений настоящее:",
  tgVote: "голосуйте ниже 👇 а потом читайте полный разбор:",
  tgWhichReal: (term: string) => `${term} — какое определение настоящее?`,
  tgFullEntry: "полный разбор →",
};

export type UIStrings = typeof en;

const dictionaries: Record<Locale, UIStrings> = {
  en,
  ru: ru as UIStrings,
};

export function t(locale: Locale): UIStrings {
  return dictionaries[locale];
}

/** Exported for the i18n-completeness test. */
export const rawDictionaries = { en, ru };
