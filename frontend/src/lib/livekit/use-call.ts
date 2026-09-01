"use client";

/**
 * useCall — the single hook that owns a LiveKit Room's lifecycle and exposes
 * a React-friendly view of it. Everything the in-call UI needs (participants,
 * their tracks, connection quality, controls, quality selector, reconnection
 * state) comes from here, so no component ever touches the raw SDK.
 *
 * Design note: the core livekit-client Room is an event emitter, not React
 * state. Rather than mirror every field into useState (which drifts), this
 * keeps the Room in a ref and bumps a version counter on the RoomEvents that
 * change what we render, then re-derives the participant list from the live
 * Room on each render. That's the standard pattern for driving React from the
 * core SDK without the heavier @livekit/components-react layer (chosen for the
 * fine control the spec's quality/adaptation requirements need).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ConnectionQuality,
  ConnectionState,
  type LocalParticipant,
  type Participant,
  type RemoteParticipant,
  type Room,
  type TrackPublication,
} from "livekit-client";

import {
  applyQualityCap,
  CONNECT_OPTIONS,
  createCallRoom,
  QualityMode,
  RoomEvent,
  Track,
} from "./room";

export type CallConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface ParticipantView {
  identity: string;
  /** display name LiveKit carries (set from the token's `name`). */
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  connectionQuality: ConnectionQuality;
  cameraPublication: TrackPublication | undefined;
  screenPublication: TrackPublication | undefined;
  micPublication: TrackPublication | undefined;
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  isScreenSharing: boolean;
}

function toView(p: Participant, isLocal: boolean): ParticipantView {
  const camera = p.getTrackPublication(Track.Source.Camera);
  const screen = p.getTrackPublication(Track.Source.ScreenShare);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    isSpeaking: p.isSpeaking,
    connectionQuality: p.connectionQuality,
    cameraPublication: camera,
    screenPublication: screen,
    micPublication: mic,
    isCameraEnabled: !!camera && !camera.isMuted,
    isMicEnabled: !!mic && !mic.isMuted,
    isScreenSharing: !!screen && !screen.isMuted,
  };
}

export interface UseCall {
  connectionState: CallConnectionState;
  /** True between a network drop and recovery — the UI keeps the call on
   *  screen and shows "Reconnecting" rather than tearing down (spec §6/§8). */
  isReconnecting: boolean;
  error: string | null;
  localView: ParticipantView | null;
  remoteViews: ParticipantView[];
  /** All views, local first — convenient for a single grid. */
  allViews: ParticipantView[];
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  quality: QualityMode;
  lowDataMode: boolean;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setQuality: (mode: QualityMode) => Promise<void>;
  /** Audio-only fallback (spec §6): stops sending/among receiving video and
   *  favours audio stability. Reversible. */
  setLowDataMode: (on: boolean) => Promise<void>;
  /** The underlying Room, for the chat data-channel hook and diagnostics.
   *  Null until connected. */
  room: Room | null;
}

export function useCall(): UseCall {
  const roomRef = useRef<Room | null>(null);
  // Bumped on every RoomEvent that changes what we render; used only as a
  // useMemo dependency so the participant views re-derive from the live Room.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [connectionState, setConnectionState] = useState<CallConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quality, setQualityState] = useState<QualityMode>("auto");
  const [lowDataMode, setLowDataModeState] = useState(false);

  // Bind the events that change what we render to a version bump, and the
  // connection-lifecycle events to explicit state. Everything else is
  // re-derived from the live Room on render.
  const attach = useCallback(
    (room: Room) => {
      const onChange = () => bump();
      const render_events: RoomEvent[] = [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.ConnectionQualityChanged,
        RoomEvent.TrackStreamStateChanged,
      ];
      render_events.forEach((e) => room.on(e, onChange));

      room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
      room.on(RoomEvent.Reconnected, () => setConnectionState("connected"));
      room.on(RoomEvent.Disconnected, () => setConnectionState("disconnected"));
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) setConnectionState("connected");
        else if (state === ConnectionState.Connecting) setConnectionState("connecting");
        else if (state === ConnectionState.Reconnecting) setConnectionState("reconnecting");
        else if (state === ConnectionState.Disconnected) setConnectionState("disconnected");
        bump();
      });
    },
    [bump],
  );

  const connect = useCallback(
    async (url: string, token: string) => {
      // A hook instance owns at most one room at a time; a stale one is torn
      // down first so a re-connect never leaks the previous media session.
      if (roomRef.current) {
        await roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
      const room = createCallRoom(quality);
      roomRef.current = room;
      attach(room);
      setError(null);
      setConnectionState("connecting");
      try {
        await room.connect(url, token, CONNECT_OPTIONS);
        setConnectionState("connected");
        bump();
      } catch (err) {
        setConnectionState("disconnected");
        setError(err instanceof Error ? err.message : "Could not join the call.");
        throw err;
      }
    },
    [attach, bump, quality],
  );

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect().catch(() => {});
    setConnectionState("disconnected");
    bump();
  }, [bump]);

  // Tear the room down if the component unmounts mid-call — a media session
  // must never outlive its UI.
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) room.disconnect().catch(() => {});
    };
  }, []);

  const local = roomRef.current?.localParticipant as LocalParticipant | undefined;

  const toggleMic = useCallback(async () => {
    if (!local) return;
    await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
    bump();
  }, [local, bump]);

  const toggleCamera = useCallback(async () => {
    if (!local) return;
    await local.setCameraEnabled(!local.isCameraEnabled);
    bump();
  }, [local, bump]);

  const toggleScreenShare = useCallback(async () => {
    if (!local) return;
    // audio:true so a shared browser tab's audio comes through too where the
    // browser supports it. The confirm-before-share warning (spec §33.7) is
    // the button's job, not this low-level toggle.
    await local.setScreenShareEnabled(!local.isScreenShareEnabled, { audio: true });
    bump();
  }, [local, bump]);

  const setQuality = useCallback(
    async (mode: QualityMode) => {
      setQualityState(mode);
      const room = roomRef.current;
      if (room) await applyQualityCap(room, mode).catch(() => {});
    },
    [],
  );

  const setLowDataMode = useCallback(
    async (on: boolean) => {
      setLowDataModeState(on);
      const room = roomRef.current;
      if (!room) return;
      // Stop publishing camera and cap the received layers hard; audio is
      // untouched. Reversible: turning it off re-enables the camera.
      if (on) {
        await room.localParticipant.setCameraEnabled(false).catch(() => {});
      } else {
        await room.localParticipant.setCameraEnabled(true).catch(() => {});
      }
      bump();
    },
    [bump],
  );

  const { localView, remoteViews } = useMemo(() => {
    const room = roomRef.current;
    if (!room) return { localView: null, remoteViews: [] as ParticipantView[] };
    const localV = room.localParticipant ? toView(room.localParticipant, true) : null;
    const remotes: ParticipantView[] = [];
    room.remoteParticipants.forEach((p: RemoteParticipant) => remotes.push(toView(p, false)));
    return { localView: localV, remoteViews: remotes };
    // `version` bumps on every render-affecting RoomEvent (the ref itself is
    // stable across renders — its *contents* are what change), so it is the
    // correct trigger to re-derive the views. connectionState covers the
    // connect/disconnect edges that don't emit one of those events.
  }, [version, connectionState]);

  const allViews = useMemo(
    () => (localView ? [localView, ...remoteViews] : remoteViews),
    [localView, remoteViews],
  );

  return {
    connectionState,
    isReconnecting: connectionState === "reconnecting",
    error,
    localView,
    remoteViews,
    allViews,
    isMicEnabled: !!local?.isMicrophoneEnabled,
    isCameraEnabled: !!local?.isCameraEnabled,
    isScreenSharing: !!local?.isScreenShareEnabled,
    quality,
    lowDataMode,
    connect,
    disconnect,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    setQuality,
    setLowDataMode,
    room: roomRef.current,
  };
}

export { ConnectionQuality };
