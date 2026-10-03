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
 *
 * One-tap quick message (v3 pilot): when the conversation is brand new, the
 * responder's first message is sent automatically so neither side faces a
 * blank box. Copy flips by post type — on a rider's post the responder is
 * offering to drive; on a captain's post they want a seat. The opener is a
 * plain message like any other (editable/deletable by normal chat rules);
 * if its insert fails (e.g. a block landed mid-tap) the chat still opens
 * and the user types manually.
 */
export async function startConversation(formData: FormData): Promise<void> {
  const user = await getUser();
  const rideId = String(formData.get("rideId") ?? "");
  if (!user) redirect(`/sign-in?redirectTo=/rides/${rideId}`);
  if (!rideId) redirect("/rides");

  const supabase = await createClient();

  const { data: ride } = await supabase
    .from("rides")
    .select("type")
    .eq("id", rideId)
    .maybeSingle<{ type: "offer" | "get" }>();

  const { data, error } = await supabase.rpc("get_or_create_conversation", {
    p_ride_id: rideId,
  });

  if (error || !data) redirect(`/rides/${rideId}?error=chat`);
  const conversationId = data as string;

  // Send the canned opener only into an empty conversation. A double-tap
  // can theoretically pass this check twice; the submit button disables
  // while pending, which makes that a deliberate double-click, not drift.
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .limit(1);
  if (existing && existing.length === 0 && ride) {
    const opener =
      ride.type === "get"
        ? "hi! i saw your ride request and i can drive this route. is it still open?"
        : "hi! i saw your ride post and i'd love a seat. is it still available?";
    // Swallowed on purpose (see docblock): a failed opener must never
    // block opening the chat.
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: opener,
    });
  }

  redirect(`/messages/${conversationId}`);
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
  if (!user) return { error: "you're not signed in." };

  const text = (input.body ?? "").trim();
  const hasImage = Boolean(input.imagePath);

  if (!text && !hasImage) return { error: "message can't be empty." };
  if (text.length > MAX_MESSAGE_LENGTH)
    return { error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  if (
    input.imagePath &&
    !isAllowedImagePath(input.imagePath, input.conversationId)
  ) {
    return { error: "only image files are allowed." };
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

  if (error) return { error: "couldn't send the message. please try again." };
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
  if (!user) return { error: "you're not signed in." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_ride_reveal", {
    p_conversation_id: conversationId,
    p_agree: agree,
  });

  if (error) return { error: "couldn't update the reveal request." };
  const reveal = (Array.isArray(data) ? data[0] : data) as RideReveal;
  return { reveal };
}
