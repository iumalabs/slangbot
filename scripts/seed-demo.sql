-- Demo term for local development (deno task seed). Fake image key on purpose:
-- the IllustrationSlot renders its skeleton fallback when the R2 object is missing.
INSERT OR REPLACE INTO terms (
  slug, term, date, pos, ipa, respelled_ru,
  origin_en, origin_ru,
  definition_en, definition_ru,
  example_en, example_note_en, example_note_ru,
  ok_tags_en, ok_tags_ru, not_ok_tags_en, not_ok_tags_ru,
  related_json, fake_defs_json, image_key, trend_source, suggested_by_reader, created_at
) VALUES (
  'rizz',
  'rizz',
  date('now'),
  'noun, internet',
  '/rɪz/',
  'риз',
  'Clipped from "charisma" — popularized around 2021 by streamer Kai Cenat and Twitch culture, then canonized as Oxford''s 2023 Word of the Year. Origin of the clipping itself is disputed.',
  'Усечение слова "charisma" (харизма). Слово популяризовал стример Kai Cenat около 2021 года, а в 2023-м Оксфордский словарь назвал его словом года. Точное происхождение усечения — предмет споров.',
  'Effortless charm or skill in attracting a romantic interest, especially through conversation alone.',
  'Природное обаяние или умение флиртовать и очаровывать — особенно словами, без каких-либо усилий.',
  'Bro walked up with zero game and somehow pulled — unspoken rizz.',
  'He approached without any apparent strategy and still succeeded — his charm was so natural it did not require words.',
  'Он подошёл без всякого плана и всё равно всех очаровал — «unspoken rizz» значит настолько естественное обаяние, что слова не нужны.',
  '["group chats","talking about someone''s charm","memes"]',
  '["групповые чаты","разговор о чьём-то обаянии","мемы"]',
  '["formal writing","job interviews","around people who will ask what it means"]',
  '["официальные письма","собеседования","рядом с теми, кто спросит, что это значит"]',
  '["gyat","sigma","aura","w"]',
  '{"en":["A sudden burst of secondhand embarrassment felt while scrolling social media.","The unwritten rule that the first person to speak in a group chat sets its tone for the day."],"ru":["Внезапный приступ испанского стыда при пролистывании соцсетей.","Негласное правило: кто первым напишет в чат, тот задаёт тон всему дню."]}',
  'terms/rizz.png',
  'seed',
  0,
  datetime('now')
);
