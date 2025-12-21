import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "@/locales/en.json"
import zh from "@/locales/zh.json"
import { languageStore } from "@/stores/language"

const defaultLang = languageStore?.getState().language ?? "en"

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: en,
      },
      zh: {
        translation: zh,
      },
    },
    lng: defaultLang,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  })

// Subscribe to language store changes
if (languageStore) {
  languageStore.subscribe((state) => {
    i18n.changeLanguage(state.language)
  })
}

export default i18n

