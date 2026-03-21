"use client";

import { useFormStatus } from "react-dom";
import { runImportParseAction } from "@/features/imports/actions/run-import-parse-action";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Parsing..." : "Run parse"}
    </button>
  );
}

export default function RunImportParseButton({
  companySlug,
  importJobId,
}: {
  companySlug: string;
  importJobId: string;
}) {
  async function action(formData: FormData) {
    await runImportParseAction(formData);
  }

  return (
    <form action={action}>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="importJobId" value={importJobId} />
      <SubmitButton />
    </form>
  );
}