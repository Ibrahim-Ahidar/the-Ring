// Hermes ships only part of ECMA-402: no Intl.Locale, Intl.PluralRules or
// Intl.RelativeTimeFormat. use-intl needs PluralRules for every plural
// message, and formatLastActive needs RelativeTimeFormat. Each polyfill
// checks first and is a no-op where the engine already has the API.
// Order matters: each one depends on the ones above it.
// Locale data must cover every entry in LOCALES from @pulse/i18n.
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-locale/polyfill.js";

import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/ar.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/fr.js";

import "@formatjs/intl-relativetimeformat/polyfill.js";
import "@formatjs/intl-relativetimeformat/locale-data/ar.js";
import "@formatjs/intl-relativetimeformat/locale-data/en.js";
import "@formatjs/intl-relativetimeformat/locale-data/fr.js";
