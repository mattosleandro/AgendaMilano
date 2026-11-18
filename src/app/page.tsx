import React from "react";
import { AgendaApp } from "@/components/AgendaApp";
import {
  getAgendaMesData,
  getMinhasReservas,
  getMoradorSessionFromCookies,
} from "@/lib/agenda/queries";
import { sanitizeMoradorForClient } from "@/lib/security/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [initialAgenda, moradorCookie] = await Promise.all([
    getAgendaMesData(),
    getMoradorSessionFromCookies(),
  ]);

  const initialMorador = sanitizeMoradorForClient(moradorCookie);
  const initialMinhasReservas = moradorCookie
    ? await getMinhasReservas(moradorCookie.titular_cpf_hash)
    : [];

  return (
    <AgendaApp
      initialAgenda={initialAgenda}
      initialMorador={initialMorador}
      initialMinhasReservas={initialMinhasReservas}
    />
  );
}
