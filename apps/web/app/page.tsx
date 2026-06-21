import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect the root page to the campaigns list which serves as our main dashboard
  redirect('/campaigns');
}
