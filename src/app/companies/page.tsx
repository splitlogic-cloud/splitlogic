import CompaniesClient from "./CompaniesClient";

export default async function CompaniesPage() {
  const res = await fetch("http://localhost:3000/api/companies", {
    cache: "no-store",
  });

  const { data } = await res.json();

  return <CompaniesClient initialData={data ?? []} />;
}
