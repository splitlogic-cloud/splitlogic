"use client";

import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
    >
      {pending ? "Running matching..." : "Run matching"}
    </button>
  );
}

export default function RunMatchingV3Button(props: {
  companySlug: string;
  importJobId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={props.action}>
      <input type="hidden" name="companySlug" value={props.companySlug} />
      <input type="hidden" name="importJobId" value={props.importJobId} />
      <SubmitButton />
    </form>
  );
}