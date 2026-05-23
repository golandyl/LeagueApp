export default async function PlayersPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  void (await params)
  return <div>League Players — coming soon</div>
}
