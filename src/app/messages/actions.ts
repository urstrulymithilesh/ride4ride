"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import {
  isAllowedImagePath,
  MAX_MESSAGE_LENGTH,
} from "@/lib/chat";
import type { Message, RideReveal } from "@/types";

/**
 * Start (or resume) a 1:1 conversation with a ride's owner, then go to it.
 * Used as a <form action>. Requires sign-in; the RPC rejects self-messaging.
 */
export async function startConversation(formData: FormData): Promise<void> {
  const user = await getUser();
  const rideId = String(formData.get("rideId") ?? "");
  if (!user) redirect(`/sign-in?redirectTo=/rides/${rideId}`);
  if (!rideId) redirect("/rides");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_conversation", {
    p_ride_id: rideId,
  });

  if (error || !data) redirect(`/rides/${rideId}?error=chat`);
  redirect(`/messages/${data as string}`);
}

export interface SendResult {
  error?: string;
  message?: Message;
}

/**
 * Insert a chat message. Server-side validation complements the client:
 *  - must have text and/or an image
 *  - text length bound
 *  - image path must be an allowed image type inside this conversation's folder
 * RLS enforces that the sender is a participant of the conversation.
 */
export async function sendMessage(input: {
  conversationId: string;
  body: string;
  imagePath: string | null;
}): Promise<SendResult> {
  const user = await getUser();
  if (!user) return { error: "You're not signed in." };

  const text = (input.body ?? "").trim();
  const hasImage = Boolean(input.imagePath);

  if (!text && !hasImage) return { error: "Message can't be empty." };
  if (text.length > MAX_MESSAGE_LENGTH)
    return { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  if (
    input.imagePath &&
    !isAllowedImagePath(input.imagePath, input.conversationId)
  ) {
    return { error: "Only image files are allowed." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      body: text || null,
      image_url: input.imagePath || null,
    })
    .select("*")
    .single<Message>();

  if (error) return { error: "Couldn't send the message. Please try again." };
  return { message: data };
}

export interface RevealResult {
  error?: string;
  reveal?: RideReveal;
}

/**
 * Set the caller's OWN agreement to reveal addresses for the ride tied to a
 * conversation. Either party can request (first to agree) and the other
 * confirms (second to agree). Mutual agreement flips `agreed`, at which point
 * the ride_locations RLS lets the viewer read the addresses — enforced by the
 * database, not this action. Passing `agree: false` withdraws consent.
 */
export async function setRevealAgreement(
  conversationId: string,
  agree: boolean,
): Promise<RevealResult> {
  const user = await getUser();
  if (!user) return { error: "You're not signed in." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_ride_reveal", {
    p_conversation_id: conversationId,
    p_agree: agree,
  });

  if (error) return { error: "Couldn't update the reveal request." };
  const reveal = (Array.isArray(data) ? data[0] : data) as RideReveal;
  return { reveal };
}
