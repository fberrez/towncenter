"use server";

// The setup screen's writes. requireUser() runs on the first line of every
// action: a Server Action is a directly reachable HTTP endpoint.

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/accounts";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  checkPlacesKey,
} from "@/lib/sources/places";
import {
  removePlacesKey,
  savePlacesKey,
} from "@/lib/settings";

import type { PlacesKeyState } from "./state";

const keySchema = z.object({
  key: z
    .string()
    .min(20, "Une clé Google Places contient au moins 20 caractères.")
    .max(2048)
    .refine((v) => !/\s/.test(v), {
      message: "La clé ne doit pas contenir d’espace.",
    }),
});

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// one billed request: the cheapest honest proof that a key works before it is saved
export async function testPlacesKeyAction(
  _previous: PlacesKeyState,
  formData: FormData,
): Promise<PlacesKeyState> {
  await requireUser();

  const parsed = keySchema.safeParse({ key: text(formData, "key") });
  if (!parsed.success) {
    return {
      status: "error",
      message: null,
      fieldError: parsed.error.issues[0]?.message ?? "Clé illisible.",
    };
  }

  const result = await checkPlacesKey(parsed.data.key);
  if (result.ok) {
    return {
      status: "tested",
      message: "Clé acceptée par Google. Vous pouvez l’enregistrer.",
      fieldError: null,
    };
  }

  return { status: "error", message: result.message, fieldError: null };
}

export async function savePlacesKeyAction(
  _previous: PlacesKeyState,
  formData: FormData,
): Promise<PlacesKeyState> {
  const owner = await requireUser();

  const parsed = keySchema.safeParse({ key: text(formData, "key") });
  if (!parsed.success) {
    return {
      status: "error",
      message: null,
      fieldError: parsed.error.issues[0]?.message ?? "Clé illisible.",
    };
  }

  await savePlacesKey(owner.id, parsed.data.key);
  redirect("/onboarding?step=grid");
}

export async function removePlacesKeyAction(): Promise<void> {
  const owner = await requireUser();
  await removePlacesKey(owner.id);
  redirect("/onboarding?step=key");
}

export async function finishOnboardingAction(): Promise<void> {
  const owner = await requireUser();
  await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(eq(users.id, owner.id));
  redirect("/");
}
