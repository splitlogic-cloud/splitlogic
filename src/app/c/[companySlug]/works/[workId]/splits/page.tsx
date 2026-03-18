import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  listSplitsForWork,
  getSplitTotal,
} from "@/features/splits/splits.repo";
import {
  createSplitAction,
  updateSplitAction,
  deleteSplitAction,
} from "@/features/splits/splits.actions";

export default async function Page({ params }: any) {
  const { workId } = await params;

  const splits = await listSplitsForWork(workId);

  const total = getSplitTotal(splits);

  const { data: parties } = await supabaseAdmin
    .from("parties")
    .select("id,name");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Splits</h1>

      <div>
        Total:{" "}
        <span
          className={
            total === 100 ? "text-green-600" : "text-red-600"
          }
        >
          {total}%
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Party</th>
            <th>%</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {splits.map((s) => (
            <tr key={s.id}>
              <td>{s.party_id}</td>
              <td>
                <form action={updateSplitAction}>
                  <input type="hidden" name="splitId" value={s.id} />
                  <input
                    name="sharePercent"
                    defaultValue={s.share_percent}
                  />
                  <button>Save</button>
                </form>
              </td>
              <td>
                <form action={deleteSplitAction}>
                  <input type="hidden" name="splitId" value={s.id} />
                  <button>Delete</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add split</h2>

      <form action={createSplitAction}>
        <input type="hidden" name="workId" value={workId} />

        <select name="partyId">
          {parties?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input name="sharePercent" placeholder="%" />
        <button>Add</button>
      </form>
    </div>
  );
}