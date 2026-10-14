import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string; id: string }>
}

// The player list lives in the Roster tab of the league hub.
export default async function LeaguePlayersPage({ params }: Props) {
  const { locale, id: leagueId } = await params
  redirect(`/${locale}/manager-dashboard/${leagueId}?tab=roster`)
}
