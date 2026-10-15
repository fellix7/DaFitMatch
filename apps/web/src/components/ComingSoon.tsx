import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ComingSoon({
  title,
  phase,
  children,
}: {
  title: string;
  phase: number;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Coming in Phase {phase}.</CardDescription>
      </CardHeader>
      {children && <CardContent className="text-sm text-muted-foreground">{children}</CardContent>}
    </Card>
  );
}

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
