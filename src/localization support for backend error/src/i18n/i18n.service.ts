import { Injectable } from "@nestjs/common";
import { translations } from "./translations";

export type SupportedLanguage = "en" | "es" | "fr" | "de" | "pt" | "zh" | "ja";

@Injectable()
export class I18nService {
  private readonly defaultLanguage: SupportedLanguage = "en";
  private readonly supportedLanguages: SupportedLanguage[] = [
    "en",
    "es",
    "fr",
    "de",
    "pt",
    "zh",
    "ja",
  ];

  /**
   * Parse Accept-Language header and return best matching language
   */
  parseAcceptLanguage(acceptLanguageHeader?: string): SupportedLanguage {
    if (!acceptLanguageHeader) {
      return this.defaultLanguage;
    }

    // Parse header format: "en-US,en;q=0.9,es;q=0.8"
    const languages = acceptLanguageHeader
      .split(",")
      .map((lang) => {
        const parts = lang.trim().split(";");
        const code = parts[0].split("-")[0].toLowerCase();
        const quality = parts[1] ? parseFloat(parts[1].split("=")[1]) : 1.0;
        return { code, quality };
      })
      .sort((a, b) => b.quality - a.quality);

    // Find first supported language
    for (const { code } of languages) {
      if (this.supportedLanguages.includes(code as SupportedLanguage)) {
        return code as SupportedLanguage;
      }
    }

    return this.defaultLanguage;
  }

  /**
   * Get translated message with variable interpolation
   */
  translate(
    key: string,
    language: SupportedLanguage,
    params?: Record<string, any>,
  ): string {
    const lang = this.supportedLanguages.includes(language)
      ? language
      : this.defaultLanguage;

    let message =
      translations[lang]?.[key] ||
      translations[this.defaultLanguage][key] ||
      key;

    // Interpolate variables: "User {username} not found" with {username: 'john'}
    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        message = message.replace(new RegExp(`{${param}}`, "g"), String(value));
      });
    }

    return message;
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return this.supportedLanguages;
  }

  /**
   * Get default language
   */
  getDefaultLanguage(): SupportedLanguage {
    return this.defaultLanguage;
  }
}
