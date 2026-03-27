"use client";

import { useFormStatus } from "react-dom";
import { runImportParseAction } from "@/features/imports/actions/run-import-parse-action";

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Parsing..." : "Run parse"}
    </button>
  );
}

type Props = {
  companySlug: string;
  importJobId: string;
  disabled?: boolean;
};

export default function RunImportParseButton({
  companySlug,
  importJobId,
  disabled = false,
}: Props) {
  async function action(formData: FormData): Promise<void> {
    await runImportParseAction(formData);
  }

  return (
    <form action={action}>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="importJobId" value={importJobId} />
      <SubmitButton disabled={disabled} />
    </form>
  );
}