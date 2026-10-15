import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirmAge } from '@/lib/queries';

const today = () => new Date().toISOString().slice(0, 10);

const Form = z.object({
  birth_date: z.iso
    .date('Enter your date of birth')
    .refine((d) => d <= today(), 'Date of birth cannot be in the future')
    .refine((d) => d >= '1900-01-01', 'Enter a real date of birth'),
});
type Form = z.infer<typeof Form>;

/**
 * One-time age gate. The date of birth is sent once to compute `is_adult` and is never stored.
 * Under-18 users can browse but cannot upload photos, use try-on or join date rooms.
 */
export function AgeGate() {
  const confirm = useConfirmAge();
  const form = useForm<Form>({ resolver: zodResolver(Form) });

  if (confirm.data && !confirm.data.is_adult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thanks!</CardTitle>
          <CardDescription>
            Photo try-on and date rooms are for adults (18+). You can still explore outfits.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Before we start</CardTitle>
        <CardDescription>
          Some features are for adults only. We use your date of birth once to check this and do not
          store it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={form.handleSubmit(({ birth_date }) => confirm.mutate(birth_date))}
          noValidate
        >
          <Label htmlFor="birth_date">Date of birth</Label>
          <Input
            id="birth_date"
            type="date"
            max={today()}
            aria-invalid={Boolean(form.formState.errors.birth_date)}
            {...form.register('birth_date')}
          />
          {form.formState.errors.birth_date && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.birth_date.message}
            </p>
          )}
          {confirm.isError && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong. Please try again.
            </p>
          )}
          <Button type="submit" disabled={confirm.isPending}>
            {confirm.isPending ? 'Checking…' : 'Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
