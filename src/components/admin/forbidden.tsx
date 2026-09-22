export function Forbidden({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
      {message}
    </div>
  );
}
