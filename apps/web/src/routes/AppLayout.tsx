import { Link, Outlet, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { queryClient } from '@/lib/queries';
import { signOut } from '@/lib/session';

export function AppLayout() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link to="/app/feed" className="text-lg font-semibold tracking-tight">
          DaFitMatch
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOut();
            queryClient.clear();
            navigate('/', { replace: true });
          }}
        >
          Sign out
        </Button>
      </header>
      <main className="grid gap-4">
        <Outlet />
      </main>
    </div>
  );
}
