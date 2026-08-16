"use client";

import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui";
import { post } from "@/lib/api";
import { AUTH_CONFIGURED } from "@/lib/auth";

type Status = "working" | "success" | "error";

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(
    !AUTH_CONFIGURED ? "success" : !token ? "error" : "working",
  );
  const [message, setMessage] = useState(
    !AUTH_CONFIGURED || token ? "" : "This link is missing its token.",
  );

  useEffect(() => {
    if (!AUTH_CONFIGURED || !token) return;

    let cancelled = false;
    post("/auth/verify-email", { token })
      .then(() => {
        if (!cancelled) setStatus("success");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "This link is no longer valid.");
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount — re-verifying on every render would just retry a
    // single-use token that already succeeded or failed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="text-center">
      {status === "error" ? (
        <>
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">Couldn&apos;t verify your email</h1>
          <p className="mt-1.5 text-[14px] text-muted">{message}</p>
        </>
      ) : (
        <>
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
            {status === "success" ? (
              <CircleCheck className="size-5" />
            ) : (
              <LoaderCircle className="size-5 animate-spin" />
            )}
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">
            {status === "success" ? "Email verified" : "Verifying your email…"}
          </h1>
          {status === "success" ? (
            <p className="mt-1.5 text-[14px] text-muted">Your account is fully set up.</p>
          ) : null}
        </>
      )}
      <ButtonLink href="/login" variant="secondary" className="mt-6">
        Go to sign in
      </ButtonLink>
    </div>
  );
}
