# Age rating (proposed questionnaire answers)

Apple's current categories and tier mapping were read from
[Age ratings values and definitions](https://developer.apple.com/help/app-store/reference/app-information/age-ratings-values-and-definitions/)
(2026-10-12). Re-check the live questionnaire, the wording moves.

nemu itself contains no comic content. Everything depends on **content the user can
reach**: files they import, directories/sources they add, and the open web pages a
source loads. App Review judges the app by what it can show, so answers below are
conservative about that.

## In-app controls

| Question | Answer | Why |
|---|---|---|
| Parental controls | No | none |
| Age assurance | No | no age gate; the "show adult sources" toggle in Browse (hides sources with content rating >= 2 by default) is a preference, not age assurance |

## Capabilities

| Question | Answer | Why |
|---|---|---|
| Unrestricted web access | **Yes** | Users add their own source directories and sources, which fetch arbitrary websites (and a Cloudflare challenge/web login view for some sources). Apple's definition: "users can navigate to any webpage within the app or freely browse the web." Not hiding this is safer than being corrected in review. This alone puts the app at 16+. |
| User-generated content | No | no posting or sharing between users |
| Messaging and chat | No | the assistant is not user-to-user chat |
| Social media | No | |
| Advertising | No | |

## Content (about what can appear)

| Question | Proposed answer | Why |
|---|---|---|
| Mature or suggestive themes | Infrequent | manga reachable through user-chosen sources |
| Sexual content or nudity | Infrequent | same; adult sources hidden by default |
| Graphic sexual content | **None** | would make the app Unrated; nemu must not list or ship such content (recommended directory is licensed content only) |
| Cartoon or fantasy violence | Infrequent | manga |
| Realistic violence, horror/fear, profanity | Infrequent | manga |
| Alcohol/tobacco/drugs, gambling, medical, contests, loot boxes | None | |

## Result (owner decision)

**16+**, driven by "Unrestricted web access = Yes" (Apple's tier table puts it at
16+); every content row is "Infrequent" or "None", which stays at or below 16+.

- Do not claim 4+/9+: "unrestricted web access" cannot be answered "No" for an app
  that executes user-chosen sources.
- Keep "Graphic sexual content" at **None**: any other answer makes the app
  Unrated and unpublishable. Neither nemu nor its recommended directory may list
  such content.
- After filling the questionnaire, check the Australia / Brazil / Korea tables (no
  loot boxes, simulated gambling or social media, so no regional override is
  expected).
- Re-evaluate if adult sources become visible without the extra Browse toggle, or a
  built-in directory lists adult content.
