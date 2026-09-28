import { DamApp } from '@/components/dam/dam-app';
import { getViewer } from '@/lib/access';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const viewer = await getViewer(headers());

  if (!viewer) {
    redirect('/sign-in');
  }

  return (
    <main>
      <DamApp viewer={viewer} />
    </main>
  );
}
