export function verificationEmailText(
  url: string,
  expiresIn: number,
  appOrigin: string,
): string {
  return [
    'Bienvenido a StockApp',
    '',
    'Creaste una cuenta para organizar productos, compras y ventas. Antes de entrar, necesitamos confirmar que puedes acceder a este correo.',
    '',
    '1. Abre este enlace para verificar tu correo:',
    url,
    '',
    `El enlace vence en ${expiresIn / 3600} horas. Si tu aplicación de correo no permite abrirlo, copia el enlace completo y pégalo en tu navegador.`,
    '',
    '2. Cuando veas «Correo verificado», vuelve a StockApp e inicia sesión con tu correo y contraseña. La verificación no inicia sesión automáticamente.',
    '3. Después de iniciar sesión podrás configurar tu inventario vacío y empezar a probar.',
    '',
    `¿El enlace venció o necesitas otro? Solicítalo en ${new URL('/verify-email', appOrigin).href}`,
    '',
    'Si no creaste esta cuenta, ignora este mensaje y no abras el enlace. No necesitas responder este correo. StockApp nunca te pedirá enviar tu contraseña ni tu enlace de verificación.',
  ].join('\n');
}
