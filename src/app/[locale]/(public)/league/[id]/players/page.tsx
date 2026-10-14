import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string; id: string }>
}

// The player list is manager-only now; send visitors to the league hub.
export default async function LeaguePlayersPage({ params }: Props) {
  const { locale, id: leagueId } = await params
  redirect(`/${locale}/manager-dashboard/${leagueId}`)
}
