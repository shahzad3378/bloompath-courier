"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { message: "" };

export function LoginForm({ brand }: { brand?: "fastdrop" }) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const isFastDrop = brand === "fastdrop";
  const fieldClass = `h-13 w-full rounded-xl border bg-white pl-12 pr-4 text-[15px] outline-none transition ${isFastDrop ? "border-[#d3dce8] focus:border-[#174ea6] focus:ring-4 focus:ring-[#174ea6]/10" : "border-[#d7e1dc] focus:border-[#13734b] focus:ring-4 focus:ring-[#13734b]/10"}`;

  return (
    <form action={action} className="mt-8 space-y-5">
      {brand ? <input type="hidden" name="portal_brand" value={brand} /> : null}
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#243c32]">Email address</span>
        <span className="relative block">
          <Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#718079]" />
          <input className={fieldClass} name="email" type="email" autoComplete="email" placeholder="name@company.com" required />
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#243c32]">Password</span>
        <span className="relative block">
          <LockKeyhole className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#718079]" />
          <input className={fieldClass} name="password" type="password" autoComplete="current-password" placeholder="Minimum 8 characters" minLength={8} required />
        </span>
      </label>

      {state.message ? (
        <p role="alert" className="rounded-xl border border-[#f0c6c6] bg-[#fff4f4] px-4 py-3 text-sm text-[#a93434]">{state.message}</p>
      ) : null}

      <button className={`flex h-13 w-full items-center justify-center gap-2 rounded-xl px-5 font-semibold text-white transition disabled:cursor-wait disabled:opacity-70 ${isFastDrop ? "bg-[#174ea6] shadow-[0_10px_25px_rgba(23,78,166,0.18)] hover:bg-[#123b7a]" : "bg-[#13734b] shadow-[0_10px_25px_rgba(19,115,75,0.22)] hover:bg-[#0f6240]"}`} type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : <>Sign in <ArrowRight className="size-5" /></>}
      </button>
    </form>
  );
}
