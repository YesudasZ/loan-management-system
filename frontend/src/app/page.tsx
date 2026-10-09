import { redirect } from 'next/navigation';

// The route guard (proxy.ts) sends `/` to each role's home; this only runs if it didn't.
export default function HomePage() {
  redirect('/login');
}
