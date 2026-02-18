export default async function CompaniesPage() {
    const res = await fetch('http://localhost:3000/api/companies', { cache: 'no-store' })
    const json = await res.json()
  
    return (
      <main style={{ padding: 40 }}>
        <h1>Companies</h1>
        <pre>{JSON.stringify(json, null, 2)}</pre>
      </main>
    )
  }
  