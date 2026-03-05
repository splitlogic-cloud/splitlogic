import * as React from "react";

type Props = {
  title: string;
  value: React.ReactNode;
  hint?: string;
};

export function Kpi({ title, value, hint }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default Kpi;