import { createFileRoute } from "@tanstack/react-router";
import { EventForm } from "@/components/event-form";

export const Route = createFileRoute("/_authenticated/admin/events/new")({
  head: () => ({
    meta: [
      { title: "Novo evento — Clube Groove" },
      {
        name: "description",
        content: "Cadastre um novo evento, defina local, datas, capacidade e imagem de capa.",
      },
    ],
  }),
  component: NewEvent,
});

function NewEvent() {
  return (
    <div className="max-w-3xl">
      <EventForm />
    </div>
  );
}
