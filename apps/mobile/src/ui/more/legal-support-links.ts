export const PRIVACY_URL = 'https://ian-k.dev/stockapp/privacy/';
export const TERMS_URL = 'https://ian-k.dev/stockapp/terms/';
export const SUPPORT_URL = 'https://ian-k.dev/stockapp/support/';

export const LEGAL_SUPPORT_LINKS = [
  { label: 'Política de privacidad', url: PRIVACY_URL },
  { label: 'Términos de uso', url: TERMS_URL },
  { label: 'Soporte', url: SUPPORT_URL },
] as const;

interface LinkOpeningDependencies {
  openURL(url: string): Promise<unknown>;
  showError(title: string, message: string): void;
}

export async function openLegalSupportLink(
  url: (typeof LEGAL_SUPPORT_LINKS)[number]['url'],
  dependencies: LinkOpeningDependencies,
): Promise<void> {
  try {
    await dependencies.openURL(url);
  } catch {
    dependencies.showError(
      'No se pudo abrir el enlace.',
      'Inténtalo nuevamente.',
    );
  }
}
