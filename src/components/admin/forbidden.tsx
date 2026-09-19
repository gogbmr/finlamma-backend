export function Forbidden({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      {message}
    </div>
  );
}
