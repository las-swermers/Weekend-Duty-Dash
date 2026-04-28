"use client";

interface Props {
  message: string | null;
}

export function Toast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span className="toast__pip" />
      {message}
    </div>
  );
}
