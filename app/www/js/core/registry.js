// step type (string from the JSON) -> function (ctx) => DOM element.
// New lesson format = one file in steps/ + one line here. An unknown type is skipped by the lesson player.
import { listenTap } from "../steps/listen_tap.js";
import { sayWord } from "../steps/say_word.js";
import { traceLetter } from "../steps/trace_letter.js";
import { watchWrite } from "../steps/watch_write.js";

export const registry = {
  listen_tap: listenTap,
  say_word: sayWord,
  trace_letter: traceLetter,
  watch_write: watchWrite,
};
