import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string; id: string }>
}

// Signup now lives in a tab of the league hub so players can also reach
// stats and live games. Old shared links land on that tab.
export default async function LeagueSignupPage({ params }: Props) {
  const { locale, id: leagueId } = await params
  redirect(`/${locale}/manager-dashboard/${leagueId}?tab=signup`)
}
