import { redirect } from "next/navigation";

// Endereço legado: a área do cliente agora mantém os agendamentos na navegação interna.
export default function AgendamentosPage() {
  redirect("/cliente#meus-agendamentos");
}
