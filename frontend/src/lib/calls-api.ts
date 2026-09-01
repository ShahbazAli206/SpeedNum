"use client";

/**
 * Client for the video-calling REST API (backend/app/routers/calls.py,
 * prefix /calls). Call *bookkeeping* only — starting/answering/ending a
 * call, listing participants, inviting. The actual media connection is
 * LiveKit's job and lives under lib/livekit/, kept separate on purpose
 * (implementation spec §24: "Keep LiveKit-specific implementation isolated").
 *
 * Everything here goes through the shared api() wrapper, so bearer-token
 * auth, the silent 401 refresh-and-retry, and error normalization are all
 * inherited — no bespoke fetch for calls.
 */

import { del, get, post } from "./api";

export type CallType = "audio" | "video";
export type CallSessionStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "missed"
  | "cancelled"
  | "ended"
  | "failed";
export type CallParticipantRole = "initiator" | "participant" | "moderator";
export type CallParticipantStatus =
  | "invited"
  | "ringing"
  | "joined"
  | "declined"
  | "left"
  | "removed";
export type CallInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export interface CallParticipant {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  role: CallParticipantRole;
  status: CallParticipantStatus;
  invited_at: string | null;
  joined_at: string | null;
  left_at: string | null;
}

export interface CallSession {
  id: string;
  room_name: string;
  initiator_profile_id: string | null;
  call_type: CallType;
  status: CallSessionStatus;
  started_at: string | null;
  connected_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string | null;
  participants: CallParticipant[];
}

export interface CallInvitation {
  id: string;
  call_session_id: string;
  inviter_profile_id: string;
  invitee_profile_id: string;
  status: CallInvitationStatus;
  created_at: string | null;
  responded_at: string | null;
}

/** What the browser needs to actually connect to the LiveKit room — never
 *  the LiveKit API secret (see backend schemas.CallTokenRead / spec §18). */
export interface CallToken {
  token: string;
  livekit_url: string;
  room_name: string;
  identity: string;
}

/** Someone the caller is allowed to call/invite — the server has already run
 *  can_call for every row (spec §21). */
export interface CallCandidate {
  profile_id: string;
  full_name: string | null;
  email: string;
  kind: string;
}

export interface CreateCallInput {
  invitee_profile_ids: string[];
  call_type?: CallType;
}

export const createCall = (input: CreateCallInput) => post<CallSession>("/calls", input);

/** Everyone the caller may start a call with or invite mid-call. */
export const listCallCandidates = () => get<CallCandidate[]>("/calls/candidates");

export const listCalls = (status?: CallSessionStatus) =>
  get<CallSession[]>(status ? `/calls?status=${status}` : "/calls");

export const getCall = (callId: string) => get<CallSession>(`/calls/${callId}`);

/** Mint the LiveKit join token. This is also the definitive "join"
 *  transition server-side — see backend calls.py::create_call_token. */
export const getCallToken = (callId: string) => post<CallToken>(`/calls/${callId}/token`);

export const acceptCall = (callId: string) => post<CallSession>(`/calls/${callId}/accept`);
export const declineCall = (callId: string) => post<CallSession>(`/calls/${callId}/decline`);
export const cancelCall = (callId: string) => post<CallSession>(`/calls/${callId}/cancel`);
export const endCall = (callId: string) => post<CallSession>(`/calls/${callId}/end`);

export const listParticipants = (callId: string) =>
  get<CallParticipant[]>(`/calls/${callId}/participants`);

export const inviteParticipant = (callId: string, inviteeProfileId: string) =>
  post<CallInvitation>(`/calls/${callId}/participants/invite`, {
    invitee_profile_id: inviteeProfileId,
  });

export const removeParticipant = (callId: string, profileId: string) =>
  del<{ ok: boolean; message: string }>(`/calls/${callId}/participants/${profileId}`);

/** The one status a caller polls for to detect an incoming call (spec §20;
 *  Phase 0 decided ringing delivery reuses this poll + the Notification
 *  feed, since there is no pre-room push channel). */
export const listRingingCalls = () => listCalls("ringing");

export interface CallMessage {
  id: string;
  sender_profile_id: string | null;
  sender_name: string | null;
  message: string;
  created_at: string | null;
}

/** In-call chat persistence (spec §16). Live delivery is LiveKit's data
 *  channel — these two only load/record durable history. */
export const listChat = (callId: string) => get<CallMessage[]>(`/calls/${callId}/chat`);
export const postChat = (callId: string, message: string) =>
  post<CallMessage>(`/calls/${callId}/chat`, { message });
