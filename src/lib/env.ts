function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() só pode ser executado no servidor.");
  }

  const supabaseUrl =
    process.env.SUPABASE_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    throw new Error(
      "Defina SUPABASE_INTERNAL_URL ou NEXT_PUBLIC_SUPABASE_URL no ambiente do servidor."
    );
  }

  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sessionSecret = readRequiredEnv("SESSION_SECRET");

  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET deve conter no mínimo 32 caracteres.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    sessionSecret,
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://agenda.portalmilano.com",
    appTimezone: process.env.APP_TIMEZONE?.trim() || "America/Campo_Grande",
    isProd: process.env.NODE_ENV === "production",
  };
}
