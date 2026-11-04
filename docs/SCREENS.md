# Screens

Designed from the reference mockups. Principles: one action per screen, icons first, every screen speaks (text on screen is only an aid), no punishment on errors, no flags for languages.

```
start -> language -> audience -> home
home  -> lesson (Learn: next unfinished lesson)
      -> lesson practice (mixed review of finished lessons)
      -> progress (winding path with module flags)
tabs  : home | courses | profile | settings        (bottom bar, icons + label)
courses  -> lesson (module's next unfinished lesson; later modules stay locked)
profile  -> progress, language
settings -> language, photo, server
lesson -> success (star; certificate + "next module" when the lesson closes a module)
```

| Screen | File | Notes |
|---|---|---|
| Welcome | `screens/start.js` | one big touch button; it also unlocks sound |
| Language | `screens/language.js` | one card per language pack, spoken in its own language |
| Audience | `screens/audience.js` | adult or child, skipped when only one exists |
| Home | `screens/home.js` | Learn, Practice, My progress |
| Courses | `screens/courses.js` | modules on a rail: done (check), current, locked |
| Progress | `screens/path.js` | winding path, one dot per lesson, flag per module |
| Profile | `screens/profile.js` | avatar, optional name, level bar |
| Settings | `screens/settings.js` | language, photo lesson, server |
| Lesson | `screens/lesson.js` | close button, progress bar, server status, then the steps |
| Success | `screens/success.js` | star, certificate when a module is finished |

Steps used by lessons: `meet_sound` (guided lesson), `listen_tap`, `match_pairs`, `say_word`, `watch_write`, `trace_letter`. See `LESSON_FORMAT.md`.

Module locking is sequential: a module opens when the previous one is finished. Finished lessons can always be replayed.
