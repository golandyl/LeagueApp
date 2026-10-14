import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string }>
}

// Placeholder route with no page of its own — send visitors home.
export default async function Page({ params }: Props) {
  const { locale } = await params
  redirect(`/${locale}`)
}
