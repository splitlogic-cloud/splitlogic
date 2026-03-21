"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md border border-black px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Running matching..." : "Run matching"}
    </button>
  );
}

type Props = {
  companySlug: string;
  importJobId: string;
  action: (formData: FormData) => Promise<void>;
  disabled?: boolean;
};

export default function RunMatchingButton({
  companySlug,
  importJobId,
  action,
  disabled = false,
}: Props) {
  return (
    <form action={action}>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="importJobId" value={importJobId} />
      <SubmitButton disabled={disabled} />
    </form>
  );
}