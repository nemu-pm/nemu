# Age rating (proposed questionnaire answers)

Apple's questions and tiers were read from
[Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
on 2026-11-08. The [new system](https://developer.apple.com/news/upcoming-requirements/)
has been live since 2026-01-31. Re-check the live questionnaire, because the wording moves.

The binary ships no comics, and the built-in directory (Example Sources) is rated 0
for its content sources. The answers below are about **what a user can reach**:
files they import, directories and sources they add, and pages a source loads.

## In-app controls

| Question | Answer | Why |
|---|---|---|
| Parental Controls | No | none |
| Age Assurance | No | the Explicit content switch in Browse is a preference; it confirms no age |

## Capabilities

| Question | Answer | Why |
|---|---|---|
| Unrestricted Web Access | **Yes** | users add their own sources, which fetch arbitrary sites, and a site can open in a built-in browser window for verification or a source login. Apple's definition: "Users can navigate to any webpage within the app or freely browse the web." This alone rates the app 16+ |
| User-Generated Content | No | no posting or sharing between users |
| Social Media | No | |
| Social Media Disabled for Users Under 13 | No | |
| Messaging and Chat | No | Nemu Chat is an assistant, not chat between users |
| Advertising | No | |

## Content

| Question | Answer | Tier alone | Why |
|---|---|---|---|
| Profanity or Crude Humor | Infrequent | 9+ | manga from sources the user adds |
| Horror/Fear Themes | Infrequent | 9+ | same |
| Alcohol, Tobacco, or Drug Use or References | Infrequent | 13+ | same; raised from None to match the other rows |
| Medical or Treatment Information | None | | |
| Health or Wellness Topics | No | | |
| Mature or Suggestive Themes | Infrequent | 9+ | same |
| Sexual Content or Nudity | Infrequent | 13+ | same; explicit sources are hidden by default. See the risk below |
| Graphic Sexual Content and Nudity | **None** | Unrated | any other answer makes the app unpublishable |
| Cartoon or Fantasy Violence | Infrequent | 9+ | manga |
| Realistic Violence | Infrequent | 13+ | manga |
| Prolonged Graphic or Sadistic Realistic Violence | **None** | Unrated | any other answer makes the app unpublishable |
| Guns or Other Weapons | Infrequent | 9+ | manga; added with the new questionnaire |
| Gambling, Simulated Gambling, Contests, Loot Boxes | None / No | | |

## Result (owner decision)

**16+**, set by Unrestricted Web Access. Every content row stays at or below that.
Australia and Brazil have their own tier tables, so read the regional result the
questionnaire shows after filling it in.

- Do not claim a lower rating: Unrestricted Web Access cannot be "No" for an app
  that runs sources the user chooses.
- The rating of the directory is not the rating of the app. Screenshots and other
  metadata [must still meet 4+](https://developer.apple.com/app-store/review/guidelines/)
  (2.3.8); see `screenshots.md`.

## Risk

"Infrequent" and "None" describe what nemu lists and offers, not everything a
user-added source could return. A source a user adds could reach frequent sexual
content (an 18+ answer) or graphic content (an Unrated answer), and the Explicit
content switch is the only control. nemu lists no such source, which is the basis
for these answers. Re-evaluate if a built-in directory ever lists explicit content,
if explicit sources stop being hidden by default, or if Review asks for 4.7.5's
age restriction.
